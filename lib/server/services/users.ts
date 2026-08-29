import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  CAPABILITY_IDS,
  type CapabilityId,
} from "@/lib/contracts/roles";
import { effectiveCapabilities } from "@/lib/permissions";
import type {
  CreateUserRequest,
  ManagedUserDto,
  UpdateUserRequest,
  UserListQuery,
  UserStatusDto,
} from "@/lib/contracts/users";
import { USER_LIST_PAGE_SIZE } from "@/lib/contracts/users";
import { auth } from "@/lib/server/auth";
import { internalUserAuth } from "@/lib/server/internal-user-auth";
import type { PersistedAccessContext } from "@/lib/server/policy/access";
import {
  AuthenticationError,
  authorizationErrorResponse,
  requireActiveUser,
  requireCapability,
} from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { findActiveOperationalLocation, listActiveOperationalLocations } from "@/lib/server/locations";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";

/**
 * Delegated user lifecycle application service.
 *
 * Credential creation and replacement go through the guarded, unmounted
 * `internalUserAuth` primitives; role/location/status writes and any required
 * session revocation commit in one Prisma transaction so access changes can
 * never partially apply (D-16/D-17).
 */

export class UserLifecycleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UserLifecycleError";
  }
}

function lifecycleFailure(
  status: number,
  code: string,
  message: string,
): UserLifecycleError {
  return new UserLifecycleError(status, code, message);
}

const managedUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  roleDefinitionId: true,
  status: true,
  credentialSetupRequired: true,
  createdAt: true,
  updatedAt: true,
  locationAssignments: {
    where: {
      location: {
        isActive: true,
        OR: [{ type: "BRANCH" }, { code: "SR", type: "WAREHOUSE" }],
      },
    },
    select: { location: { select: { id: true, code: true, name: true, type: true } } },
    orderBy: { location: { code: "asc" } },
  },
  accessRole: { select: { name: true, isOwner: true, permissions: true } },
} satisfies Prisma.UserSelect;

type ManagedUserRecord = Prisma.UserGetPayload<{ select: typeof managedUserSelect }>;

export function toManagedUserDto(
  user: ManagedUserRecord,
  lastSignInAt?: Date | null,
): ManagedUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleDefinitionId: user.roleDefinitionId,
    roleName: user.accessRole.name,
    status: user.status,
    isOwner: user.accessRole.isOwner,
    locations: user.locationAssignments.map(({ location }) => location),
    credentialSetupRequired: user.credentialSetupRequired,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastSignInAt: lastSignInAt ? lastSignInAt.toISOString() : null,
  };
}

/** Stable JSON failure responses for the thin user route handlers. */
export function usersErrorResponse(
  error: unknown,
  options: { context: string; invalidCode: string; invalidMessage: string },
): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: { code: options.invalidCode, message: options.invalidMessage } },
      { status: 400 },
    );
  }

  if (error instanceof UserLifecycleError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  try {
    const response = authorizationErrorResponse(error);
    return response;
  } catch (unexpectedError) {
    console.error(options.context, unexpectedError);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: options.context } },
      { status: 500 },
    );
  }
}

// Imported late to keep the error mapper readable above the auth boundary.

export async function requireUserManager(
  headers: Headers,
  capability: CapabilityId = "users:view",
): Promise<PersistedAccessContext> {
  return requireCapability(headers, capability);
}

export async function listAssignableUserLocations(actor: PersistedAccessContext) {
  const locations = await listActiveOperationalLocations();
  return hasAllLocationAccess(actor)
    ? locations
    : locations.filter((location) => actor.locationIds.includes(location.id));
}

function assertManageableTarget<T extends { id: string; accessRole: { isOwner: boolean } }>(
  target: T | null,
): asserts target is T {
  if (!target) {
    throw lifecycleFailure(404, "USER_NOT_FOUND", "User not found");
  }
  if (target.accessRole.isOwner) {
    throw lifecycleFailure(
      403,
      "USER_NOT_MANAGEABLE",
      "The owner Admin account cannot be changed through user management",
    );
  }
}

function assertTargetLocationAccess(
  actor: PersistedAccessContext,
  target: ManagedUserRecord,
): void {
  if (hasAllLocationAccess(actor)) return;

  const targetHasAllLocations = target.accessRole.permissions.includes("locations:all");
  const targetLocationIds = target.locationAssignments.map(
    (assignment) => assignment.location.id,
  );
  if (
    targetHasAllLocations ||
    targetLocationIds.length === 0 ||
    targetLocationIds.some((locationId) => !actor.locationIds.includes(locationId))
  ) {
    throw lifecycleFailure(403, "FORBIDDEN", "User is outside your assigned locations");
  }
}

function assertTargetCapabilityAccess(
  actor: PersistedAccessContext,
  target: ManagedUserRecord,
): void {
  if (actor.isOwner) return;

  const knownPermissions = target.accessRole.permissions.filter(
    (permission): permission is CapabilityId =>
      CAPABILITY_IDS.includes(permission as CapabilityId),
  );
  const targetCapabilities = new Set<string>([
    ...target.accessRole.permissions,
    ...effectiveCapabilities(knownPermissions),
  ]);
  if (
    [...targetCapabilities].some(
      (capability) => !actor.capabilities.includes(capability),
    )
  ) {
    throw lifecycleFailure(
      403,
      "TARGET_ROLE_EXCEEDS_ACTOR",
      "The user's current role exceeds your access",
    );
  }
}

function assertNotSelf(
  actor: PersistedAccessContext,
  userId: string,
  message: string,
): void {
  if (!actor.isOwner && actor.userId === userId) {
    throw lifecycleFailure(403, "SELF_MANAGEMENT_FORBIDDEN", message);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

function looksLikeExistingEmailConflict(error: unknown): boolean {
  return (
    isUniqueViolation(error) ||
    (error instanceof Error && /already exists|already registered/i.test(error.message))
  );
}

async function loadLockedManageableTarget(
  tx: Prisma.TransactionClient,
  actor: PersistedAccessContext,
  userId: string,
) {
  const locked = await tx.$queryRaw<Array<{ roleDefinitionId: string }>>`
    SELECT "roleDefinitionId" FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  const roleDefinitionId = locked[0]?.roleDefinitionId;
  if (!roleDefinitionId) {
    throw lifecycleFailure(404, "USER_NOT_FOUND", "User not found");
  }
  await tx.$queryRaw`
    SELECT id FROM "RoleDefinition" WHERE id = ${roleDefinitionId} FOR SHARE
  `;
  const target = await tx.user.findUnique({
    where: { id: userId },
    select: managedUserSelect,
  });
  assertManageableTarget(target);
  assertTargetCapabilityAccess(actor, target);
  assertTargetLocationAccess(actor, target);
  return target;
}

async function assertNoEmailConflict(
  db: Prisma.TransactionClient,
  email: string,
  ignoreUserId?: string,
): Promise<void> {
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing && existing.id !== ignoreUserId) {
    throw lifecycleFailure(
      409,
      "EMAIL_IN_USE",
      "A user with this email already exists",
    );
  }
}

async function resolveAssignableRole(
  db: Prisma.TransactionClient,
  actor: PersistedAccessContext,
  roleId: string,
): Promise<{ id: string; hasAllLocations: boolean; permissions: string[] }> {
  await db.$queryRaw`SELECT "id" FROM "RoleDefinition" WHERE "id" = ${roleId} FOR SHARE`;
  const role = await db.roleDefinition.findUnique({
    where: { id: roleId },
    select: { id: true, isOwner: true, permissions: true },
  });
  if (!role || role.isOwner) {
    throw lifecycleFailure(400, "INVALID_ROLE", "Select an assignable role");
  }
  if (
    !actor.isOwner &&
    role.permissions.some((permission) => !actor.capabilities.includes(permission as CapabilityId))
  ) {
    throw lifecycleFailure(403, "ROLE_GRANT_EXCEEDS_ACTOR", "The selected role exceeds your access");
  }
  return {
    id: role.id,
    hasAllLocations: role.permissions.includes("locations:all"),
    permissions: role.permissions,
  };
}

async function resolveAssignmentLocationIds(
  db: Prisma.TransactionClient,
  actor: PersistedAccessContext,
  hasAllLocations: boolean,
  requestedLocationIds: readonly string[],
): Promise<string[]> {
  const ids = [...new Set(requestedLocationIds)];
  if (hasAllLocations && !hasAllLocationAccess(actor)) {
    throw lifecycleFailure(403, "FORBIDDEN", "You cannot grant all-location access");
  }
  if (!hasAllLocations && ids.length === 0) {
    throw lifecycleFailure(400, "INVALID_ASSIGNMENT", "Select at least one active location");
  }
  if (ids.length === 0) return [];
  if (ids.some((id) => !canAccessLocation(actor, id))) {
    throw lifecycleFailure(403, "FORBIDDEN", "A selected location is outside your access");
  }
  const count = await db.location.count({
    where: { id: { in: ids }, isActive: true, OR: [{ type: "BRANCH" }, { code: "SR", type: "WAREHOUSE" }] },
  });
  if (count !== ids.length) {
    throw lifecycleFailure(400, "INVALID_ASSIGNMENT", "Select only active operational locations");
  }
  return ids;
}

export async function listUsers(actor: PersistedAccessContext, query: UserListQuery): Promise<{
  data: ManagedUserDto[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    totalStaff: number;
    activeStaff: number;
    inactiveStaff: number;
  };
}> {
  const page = query.page;

  const actorWhere: Prisma.UserWhereInput = hasAllLocationAccess(actor)
    ? {}
    : {
        AND: [
          { accessRole: { isOwner: false } },
          { NOT: { accessRole: { permissions: { has: "locations:all" } } } },
          {
            locationAssignments: {
              some: {
                locationId: { in: [...actor.locationIds] },
                location: {
                  isActive: true,
                  OR: [{ type: "BRANCH" }, { code: "SR", type: "WAREHOUSE" }],
                },
              },
            },
          },
          {
            locationAssignments: {
              none: {
                locationId: { notIn: [...actor.locationIds] },
                location: {
                  isActive: true,
                  OR: [{ type: "BRANCH" }, { code: "SR", type: "WAREHOUSE" }],
                },
              },
            },
          },
        ],
      };
  const filters: Prisma.UserWhereInput[] = [];
  if (query.search) {
    filters.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }
  if (query.roleId) {
    const role = await prisma.roleDefinition.findFirst({
      where: { id: query.roleId, isOwner: false },
      select: { id: true },
    });
    if (!role) {
      throw lifecycleFailure(400, "INVALID_ROLE_FILTER", "Select an assignable role");
    }
    filters.push({ roleDefinitionId: role.id });
  }
  if (query.status) filters.push({ status: query.status });
  if (query.location === "none") {
    if (!hasAllLocationAccess(actor)) {
      throw lifecycleFailure(403, "FORBIDDEN", "Unassigned users are outside your location access");
    }
    filters.push({ locationAssignments: { none: {} } });
  } else if (query.location) {
    const location = await findActiveOperationalLocation(query.location);
    if (!location) {
      throw lifecycleFailure(
        400,
        "INVALID_LOCATION_FILTER",
        "Select an active location",
      );
    }
    if (!canAccessLocation(actor, location.id)) {
      throw lifecycleFailure(403, "FORBIDDEN", "The selected location is outside your access");
    }
    filters.push({ locationAssignments: { some: { locationId: location.id } } });
  }

  const where: Prisma.UserWhereInput = { AND: [actorWhere, ...filters] };

  // Metadata counts staff only; the immutable owner row still appears in data.
  const staffOnlyWhere: Prisma.UserWhereInput = {
    AND: [where, { accessRole: { isOwner: false } }],
  };
  const actorStaffWhere: Prisma.UserWhereInput = {
    AND: [actorWhere, { accessRole: { isOwner: false } }],
  };

  const [rows, totalItems, activeStaff, inactiveStaff] = await Promise.all([
    prisma.user.findMany({
      where,
      select: managedUserSelect,
      orderBy: { email: "asc" },
      skip: (page - 1) * USER_LIST_PAGE_SIZE,
      take: USER_LIST_PAGE_SIZE,
    }),
    prisma.user.count({ where: staffOnlyWhere }),
    prisma.user.count({ where: { AND: [actorStaffWhere, { status: "ACTIVE" }] } }),
    prisma.user.count({ where: { AND: [actorStaffWhere, { status: "INACTIVE" }] } }),
  ]);

  // Last sign-in derives from the most recent session record per listed user.
  const lastSignInByUser = new Map<string, Date>();
  if (rows.length > 0) {
    const sessions = await prisma.session.groupBy({
      by: ["userId"],
      where: { userId: { in: rows.map((row) => row.id) } },
      _max: { createdAt: true },
    });
    for (const session of sessions) {
      if (session._max.createdAt) {
        lastSignInByUser.set(session.userId, session._max.createdAt);
      }
    }
  }

  return {
    data: rows.map((row) =>
      toManagedUserDto(row, lastSignInByUser.get(row.id) ?? null),
    ),
    meta: {
      page,
      pageSize: USER_LIST_PAGE_SIZE,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / USER_LIST_PAGE_SIZE)),
      totalStaff: activeStaff + inactiveStaff,
      activeStaff,
      inactiveStaff,
    },
  };
}

export type StaffCreationOptions = {
  /** Test-only fault injection after Better Auth persists the credential. */
  injectFailureAfterCredentialWrite?: boolean;
  /** Test-only proof that failed cleanup leaves an inactive staging row. */
  injectCleanupFailure?: boolean;
};

export async function createStaffUser(
  actor: PersistedAccessContext,
  input: CreateUserRequest,
  options: StaffCreationOptions = {},
): Promise<ManagedUserDto> {
  let createdUserId: string | undefined;

  try {
    const initialAssignment = await prisma.$transaction(async (tx) => {
      const accessRole = await resolveAssignableRole(tx, actor, input.roleId);
      const locationIds = await resolveAssignmentLocationIds(
        tx,
        actor,
        accessRole.hasAllLocations,
        input.locationIds,
      );
      await assertNoEmailConflict(tx, input.email);
      return { accessRole, locationIds };
    });

    const created = await internalUserAuth.api.createUser({
      body: {
        email: input.email,
        password: input.temporaryPassword,
        name: input.name,
        // Better Auth still requires its legacy enum-shaped role field.
        role: "BRANCH_STAFF",
        roleDefinitionId: initialAssignment.accessRole.id,
        ...(initialAssignment.locationIds[0]
          ? { locationId: initialAssignment.locationIds[0] }
          : {}),
      },
    });
    createdUserId = created.user.id;
    if (options.injectFailureAfterCredentialWrite) {
      throw new Error("Injected credential-finalization failure");
    }

    return await prisma.$transaction(async (tx) => {
      const accessRole = await resolveAssignableRole(tx, actor, input.roleId);
      const locationIds = await resolveAssignmentLocationIds(
        tx,
        actor,
        accessRole.hasAllLocations,
        input.locationIds,
      );
      await tx.user.update({
        where: { id: created.user.id },
        data: {
          roleDefinitionId: accessRole.id,
          locationId: locationIds[0] ?? null,
          locationAssignments: {
            createMany: { data: locationIds.map((locationId) => ({ locationId })) },
          },
          status: "ACTIVE",
          credentialSetupRequired: true,
        },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: { id: created.user.id },
        select: managedUserSelect,
      });
      return toManagedUserDto(user);
    });
  } catch (error) {
    if (createdUserId) {
      try {
        if (options.injectCleanupFailure) {
          throw new Error("Injected partial-provision cleanup failure");
        }
        await prisma.user.delete({ where: { id: createdUserId } });
      } catch (cleanupError) {
        console.error("Unable to remove a partially provisioned user", cleanupError);
      }
    }
    if (looksLikeExistingEmailConflict(error)) {
      throw lifecycleFailure(
        409,
        "EMAIL_IN_USE",
        "A user with this email already exists",
      );
    }
    throw error;
  }
}

export type StaffMutationOptions = {
  /** Test-only fault injection after the session revocation write. */
  injectFailureAfterAccessWrite?: boolean;
};

export async function updateStaffUser(
  actor: PersistedAccessContext,
  userId: string,
  input: UpdateUserRequest,
  options: StaffMutationOptions = {},
): Promise<ManagedUserDto> {
  if (input.roleId !== undefined || input.locationIds !== undefined) {
    assertNotSelf(actor, userId, "You cannot change your own role or locations");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const target = await loadLockedManageableTarget(tx, actor, userId);

    if (input.email && input.email !== target.email) {
      await assertNoEmailConflict(tx, input.email, userId);
    }

    // The target is already guarded as non-owner by assertManageableTarget.
    const nextAccessRole = input.roleId
      ? await resolveAssignableRole(tx, actor, input.roleId)
      : {
          id: target.roleDefinitionId,
          hasAllLocations: target.accessRole.permissions.includes("locations:all"),
          permissions: target.accessRole.permissions,
        };
    const requestedLocationIds = input.locationIds ??
      target.locationAssignments.map((assignment) => assignment.location.id);
    const nextLocationIds = await resolveAssignmentLocationIds(
      tx,
      actor,
      nextAccessRole.hasAllLocations,
      requestedLocationIds,
    );

    const nextName = input.name ?? target.name;
    const nextEmail = input.email ?? target.email;
    const currentLocationIds = target.locationAssignments.map(
      (assignment) => assignment.location.id,
    );
    const accessChanged =
      nextAccessRole.id !== target.roleDefinitionId ||
      currentLocationIds.length !== nextLocationIds.length ||
      currentLocationIds.some((id) => !nextLocationIds.includes(id));

    await tx.user.update({
      where: { id: userId },
      data: {
        name: nextName,
        email: nextEmail,
        roleDefinitionId: nextAccessRole.id,
        locationId: nextLocationIds[0] ?? null,
        locationAssignments: {
          deleteMany: {},
          createMany: { data: nextLocationIds.map((locationId) => ({ locationId })) },
        },
      },
    });

    if (accessChanged) {
      await tx.session.deleteMany({ where: { userId } });
      if (options.injectFailureAfterAccessWrite) {
        throw new Error("Injected access-change failure");
      }
    }

    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: managedUserSelect,
    });
  });

  return toManagedUserDto(updated);
}

export async function setStaffStatus(
  actor: PersistedAccessContext,
  userId: string,
  status: UserStatusDto,
  options: StaffMutationOptions = {},
): Promise<ManagedUserDto> {
  assertNotSelf(actor, userId, "You cannot change your own account status");
  const updated = await prisma.$transaction(async (tx) => {
    const target = await loadLockedManageableTarget(tx, actor, userId);
    if (target.status === status) {
      return target;
    }

    await tx.user.update({
      where: { id: userId },
      data: { status },
    });
    // Deactivation immediately revokes every live session (D-16).
    await tx.session.deleteMany({ where: { userId } });
    if (options.injectFailureAfterAccessWrite) {
      throw new Error("Injected access-change failure");
    }

    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: managedUserSelect,
    });
  });

  return toManagedUserDto(updated);
}

export async function resetStaffPassword(
  actor: PersistedAccessContext,
  headers: Headers,
  userId: string,
  newPassword: string,
  options: StaffMutationOptions = {},
): Promise<ManagedUserDto> {
  assertNotSelf(actor, userId, "You cannot reset your own password through user management");
  const user = await prisma.$transaction(async (tx) => {
    await loadLockedManageableTarget(tx, actor, userId);

    // Better Auth owns credential hashing/replacement; it never creates another
    // User, Account, or Session row for an existing account.
    await internalUserAuth.api.setUserPassword({
      body: { userId, newPassword },
      headers,
    });
    await tx.user.update({
      where: { id: userId },
      data: { credentialSetupRequired: true },
    });
    // A replaced temporary credential must not leave live sessions behind.
    await tx.session.deleteMany({ where: { userId } });
    if (options.injectFailureAfterAccessWrite) {
      throw new Error("Injected access-change failure");
    }
    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: managedUserSelect,
    });
  });
  return toManagedUserDto(user);
}

/**
 * First-login temporary-credential state machine (D-15).
 *
 * Every operation is strictly current-user scoped: the caller's own active
 * persisted session is the only authority, and no role capability besides an
 * authenticated account is required. Password values are verified/replaced by
 * Better Auth and are never returned, logged, or echoed (T-01-08).
 */

/** Exact approved UI-SPEC failure copy for first-login password changes. */
export const CREDENTIAL_CHANGE_FAILURE_COPY =
  "We couldn’t change your password. Your current password is unchanged.";

const credentialPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

export const credentialChangeRequestSchema = z
  .object({
    action: z.literal("change"),
    currentPassword: z.string().min(1).max(128),
    newPassword: credentialPasswordSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const credentialSkipRequestSchema = z.object({
  action: z.literal("skip"),
});

export const credentialActionSchema = z.discriminatedUnion("action", [
  credentialChangeRequestSchema,
  credentialSkipRequestSchema,
]);

async function requireActiveCurrentUser(headers: Headers) {
  const context = await requireActiveUser(headers);
  const [user, session] = await Promise.all([
    prisma.user.findUnique({
      where: { id: context.userId },
      select: { id: true, status: true, credentialSetupRequired: true },
    }),
    auth.api.getSession({ headers }),
  ]);
  if (!user || user.status !== "ACTIVE" || !session) {
    throw new AuthenticationError("Active user account required");
  }
  return { context, user, session: session.session };
}

export async function getCredentialSetupRequired(
  headers: Headers,
): Promise<{ credentialSetupRequired: boolean }> {
  const { user } = await requireActiveCurrentUser(headers);
  return { credentialSetupRequired: user.credentialSetupRequired };
}

export async function skipCredentialSetup(
  headers: Headers,
): Promise<{ credentialSetupRequired: boolean }> {
  const { context } = await requireActiveCurrentUser(headers);
  // Idempotent final state: consuming an already-consumed prompt is a no-op.
  await prisma.user.update({
    where: { id: context.userId },
    data: { credentialSetupRequired: false },
  });
  return { credentialSetupRequired: false };
}

export async function changeOwnCredential(
  headers: Headers,
  input: { currentPassword: string; newPassword: string },
): Promise<{ credentialSetupRequired: boolean }> {
  const {
    context,
    session: currentSession,
  } = await requireActiveCurrentUser(headers);

  try {
    // Better Auth owns verification of the current credential and its hashed
    // replacement. The built-in revokeOtherSessions flag would also replace
    // the initiating session's cookie, so other sessions are revoked below
    // while this login continues to the requested page.
    await auth.api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      },
      headers,
    });
  } catch (error) {
    // Never log or echo submitted password values; only a stable envelope.
    if (error instanceof Error && error.name !== "APIError") {
      console.error("Unable to change own password");
    }
    throw lifecycleFailure(
      400,
      "CREDENTIAL_CHANGE_FAILED",
      CREDENTIAL_CHANGE_FAILURE_COPY,
    );
  }

  // Revoke every session except the one that performed the change (T-01-03).
  await prisma.session.deleteMany({
    where: { userId: context.userId, id: { not: currentSession.id } },
  });

  // The prompt is consumed only after a successful change; a later Admin
  // reset re-arms it through resetStaffPassword.
  await prisma.user.update({
    where: { id: context.userId },
    data: { credentialSetupRequired: false },
  });
  return { credentialSetupRequired: false };
}
