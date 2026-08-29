import "server-only";

import { Prisma, type RoleScope } from "@prisma/client";
import { z } from "zod";

import type {
  CapabilityId,
} from "@/lib/contracts/roles";
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
  AuthorizationError,
  authorizationErrorResponse,
  requireActiveUser,
  requireCapability,
} from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import {
  findActiveBranch,
  findActiveOperationalLocation,
} from "@/lib/server/locations";

/**
 * Owner-Admin user lifecycle application service.
 *
 * Only the single owner Admin may list or mutate non-owner staff accounts.
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
  location: { select: { id: true, code: true, name: true, type: true } },
  accessRole: { select: { name: true, scope: true } },
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
    role: user.role,
    roleDefinitionId: user.roleDefinitionId,
    roleName: user.accessRole.name,
    roleScope: user.accessRole.scope,
    status: user.status,
    isOwner: user.accessRole.scope === "OWNER",
    location: user.location
      ? {
          id: user.location.id,
          code: user.location.code,
          name: user.location.name,
          type: user.location.type,
        }
      : null,
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

export async function requireOwnerAdmin(
  headers: Headers,
  capability: CapabilityId = "users:view",
): Promise<PersistedAccessContext> {
  const context = await requireCapability(headers, capability);
  if (!context.isOwner) {
    throw new AuthorizationError("Insufficient permissions");
  }
  return context;
}

function assertOwnerActor(actor: PersistedAccessContext): void {
  if (!actor.isOwner) {
    throw new AuthorizationError("Insufficient permissions");
  }
}

function assertManageableTarget<T extends { id: string; accessRole: { scope: RoleScope } }>(
  target: T | null,
): asserts target is T {
  if (!target) {
    throw lifecycleFailure(404, "USER_NOT_FOUND", "User not found");
  }
  if (target.accessRole.scope === "OWNER") {
    throw lifecycleFailure(
      403,
      "USER_NOT_MANAGEABLE",
      "The owner Admin account cannot be changed through user management",
    );
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

async function lockUserRow(tx: Prisma.TransactionClient, userId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  return locked.length > 0;
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

async function resolveStockRoom(db: Prisma.TransactionClient) {
  const stockRoom = await db.location.findFirst({
    where: { code: "SR", type: "WAREHOUSE", isActive: true },
    select: { id: true, code: true },
  });
  if (!stockRoom) {
    throw lifecycleFailure(
      400,
      "LOCATION_UNAVAILABLE",
      "The Stock Room (SR) is not available for assignment",
    );
  }
  return stockRoom;
}

async function validateActiveBranch(
  db: Prisma.TransactionClient,
  locationId: string,
): Promise<void> {
  if (!(await findActiveBranch(locationId, db))) {
    throw lifecycleFailure(
      400,
      "INVALID_ASSIGNMENT",
      "Branch Staff requires exactly one active branch assignment",
    );
  }
}

/**
 * Resolve the exact location semantics for a persisted role scope.
 */
const compatibilityRoleByScope = {
  BRANCH: "BRANCH_STAFF",
  STOCK_ROOM: "STOCK_STAFF",
  BUSINESS_WIDE: "ACCOUNTING_STAFF",
} as const;

async function resolveAssignableRole(
  db: Prisma.TransactionClient,
  roleId: string,
): Promise<{ id: string; scope: "BRANCH" | "STOCK_ROOM" | "BUSINESS_WIDE" }> {
  await db.$queryRaw`SELECT "id" FROM "RoleDefinition" WHERE "id" = ${roleId} FOR SHARE`;
  const role = await db.roleDefinition.findUnique({
    where: { id: roleId },
    select: { id: true, scope: true },
  });
  if (!role || role.scope === "OWNER") {
    throw lifecycleFailure(400, "INVALID_ROLE", "Select an assignable role");
  }
  return { id: role.id, scope: role.scope };
}

async function resolveAssignmentLocationId(
  db: Prisma.TransactionClient,
  scope: "BRANCH" | "STOCK_ROOM" | "BUSINESS_WIDE",
  requestedLocationId?: string | null,
): Promise<string | null> {
  switch (scope) {
    case "STOCK_ROOM":
      return (await resolveStockRoom(db)).id;
    case "BRANCH": {
      if (!requestedLocationId) {
        throw lifecycleFailure(
          400,
          "INVALID_ASSIGNMENT",
          "Branch Staff requires exactly one active branch assignment",
        );
      }
      await validateActiveBranch(db, requestedLocationId);
      return requestedLocationId;
    }
    case "BUSINESS_WIDE":
      return null;
  }
}

export async function listUsers(query: UserListQuery): Promise<{
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

  const where: Prisma.UserWhereInput = {};
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.roleId) {
    const role = await prisma.roleDefinition.findFirst({
      where: { id: query.roleId, scope: { not: "OWNER" } },
      select: { id: true },
    });
    if (!role) {
      throw lifecycleFailure(400, "INVALID_ROLE_FILTER", "Select an assignable role");
    }
    where.roleDefinitionId = role.id;
  }
  if (query.status) where.status = query.status;
  if (query.location === "none") {
    where.locationId = null;
  } else if (query.location) {
    const location = await findActiveOperationalLocation(query.location);
    if (!location) {
      throw lifecycleFailure(
        400,
        "INVALID_LOCATION_FILTER",
        "Select an active location",
      );
    }
    where.locationId = location.id;
  }

  // Metadata counts staff only; the immutable owner row still appears in data.
  const staffOnlyWhere: Prisma.UserWhereInput = {
    AND: [where, { accessRole: { scope: { not: "OWNER" } } }],
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
    prisma.user.count({ where: { accessRole: { scope: { not: "OWNER" } }, status: "ACTIVE" } }),
    prisma.user.count({ where: { accessRole: { scope: { not: "OWNER" } }, status: "INACTIVE" } }),
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
  assertOwnerActor(actor);
  let createdUserId: string | undefined;

  try {
    const initialAssignment = await prisma.$transaction(async (tx) => {
      const accessRole = await resolveAssignableRole(tx, input.roleId);
      const locationId = await resolveAssignmentLocationId(
        tx,
        accessRole.scope,
        input.locationId,
      );
      await assertNoEmailConflict(tx, input.email);
      return { accessRole, locationId };
    });

    const created = await internalUserAuth.api.createUser({
      body: {
        email: input.email,
        password: input.temporaryPassword,
        name: input.name,
        role: compatibilityRoleByScope[initialAssignment.accessRole.scope],
        roleDefinitionId: initialAssignment.accessRole.id,
        ...(initialAssignment.locationId === null
          ? {}
          : { locationId: initialAssignment.locationId }),
      },
    });
    createdUserId = created.user.id;
    if (options.injectFailureAfterCredentialWrite) {
      throw new Error("Injected credential-finalization failure");
    }

    return await prisma.$transaction(async (tx) => {
      const accessRole = await resolveAssignableRole(tx, input.roleId);
      const locationId = await resolveAssignmentLocationId(
        tx,
        accessRole.scope,
        input.locationId,
      );
      await tx.user.update({
        where: { id: created.user.id },
        data: {
          role: compatibilityRoleByScope[accessRole.scope],
          roleDefinitionId: accessRole.id,
          locationId,
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
  assertOwnerActor(actor);

  const updated = await prisma.$transaction(async (tx) => {
    if (!(await lockUserRow(tx, userId))) {
      throw lifecycleFailure(404, "USER_NOT_FOUND", "User not found");
    }
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: managedUserSelect,
    });
    assertManageableTarget(target);

    if (input.email && input.email !== target.email) {
      await assertNoEmailConflict(tx, input.email, userId);
    }

    // The target is already guarded as non-owner by assertManageableTarget.
    const nextAccessRole = input.roleId
      ? await resolveAssignableRole(tx, input.roleId)
      : { id: target.roleDefinitionId, scope: target.accessRole.scope };
    if (nextAccessRole.scope === "OWNER") {
      throw lifecycleFailure(400, "INVALID_ROLE", "Select an assignable role");
    }
    const nextRole = compatibilityRoleByScope[nextAccessRole.scope];
    let requestedLocationId: string | null | undefined = input.locationId;
    if (requestedLocationId === undefined) {
      // Keep the current branch only when the target already holds one as a
      // Branch Staff member; switching into Branch Staff requires an explicit
      // active branch.
      requestedLocationId =
        target.accessRole.scope === "BRANCH" ? target.location?.id ?? null : undefined;
    }
    const nextLocationId = await resolveAssignmentLocationId(
      tx,
      nextAccessRole.scope,
      requestedLocationId,
    );

    const nextName = input.name ?? target.name;
    const nextEmail = input.email ?? target.email;
    const currentLocationId = target.location?.id ?? null;
    const accessChanged =
      nextAccessRole.id !== target.roleDefinitionId || nextLocationId !== currentLocationId;

    await tx.user.update({
      where: { id: userId },
      data: {
        name: nextName,
        email: nextEmail,
        role: nextRole,
        roleDefinitionId: nextAccessRole.id,
        locationId: nextLocationId,
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
  assertOwnerActor(actor);

  // Idempotent fast path: an already-settled status is a successful no-op.
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: managedUserSelect,
  });
  assertManageableTarget(current);
  if (current.status === status) {
    return toManagedUserDto(current);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (!(await lockUserRow(tx, userId))) {
      throw lifecycleFailure(404, "USER_NOT_FOUND", "User not found");
    }
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: managedUserSelect,
    });
    assertManageableTarget(target);
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
  assertOwnerActor(actor);

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accessRole: { select: { scope: true } } },
  });
  assertManageableTarget(target);

  // Better Auth owns credential hashing/replacement; it never creates another
  // User, Account, or Session row for an existing account.
  await internalUserAuth.api.setUserPassword({
    body: { userId, newPassword },
    headers,
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { credentialSetupRequired: true },
    });
    // A replaced temporary credential must not leave live sessions behind.
    await tx.session.deleteMany({ where: { userId } });
    if (options.injectFailureAfterAccessWrite) {
      throw new Error("Injected access-change failure");
    }
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: managedUserSelect,
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
