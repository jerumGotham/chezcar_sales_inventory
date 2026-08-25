import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type {
  CreateUserRequest,
  ManageableUserRole,
  ManagedUserDto,
  UpdateUserRequest,
  UserListQuery,
  UserStatusDto,
} from "@/lib/contracts/users";
import { USER_LIST_PAGE_SIZE } from "@/lib/contracts/users";
import { internalUserAuth } from "@/lib/server/internal-user-auth";
import type { PersistedAccessContext } from "@/lib/server/policy/access";
import {
  AuthorizationError,
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

/**
 * Owner-Admin user lifecycle application service.
 *
 * Only the single owner Admin may list or mutate non-Admin staff accounts.
 * Credential creation and replacement go through the guarded, unmounted
 * `internalUserAuth` primitives; role/location/status writes and any required
 * session revocation commit in one Prisma transaction so access changes can
 * never partially apply (D-16/D-17).
 */

const CANONICAL_BRANCH_CODES = new Set(["QC", "BL", "LU", "VC", "SP"]);

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
  status: true,
  credentialSetupRequired: true,
  createdAt: true,
  updatedAt: true,
  location: { select: { id: true, code: true, name: true, type: true } },
} satisfies Prisma.UserSelect;

type ManagedUserRecord = Prisma.UserGetPayload<{ select: typeof managedUserSelect }>;

export function toManagedUserDto(user: ManagedUserRecord): ManagedUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    isOwner: user.role === "ADMIN",
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
): Promise<PersistedAccessContext> {
  const context = await requireCapability(headers, "users:manage");
  if (context.role !== "ADMIN") {
    throw new AuthorizationError("Insufficient permissions");
  }
  return context;
}

function assertOwnerActor(actor: PersistedAccessContext): void {
  if (actor.role !== "ADMIN") {
    throw new AuthorizationError("Insufficient permissions");
  }
}

function assertManageableTarget(
  target: Pick<ManagedUserRecord, "id" | "role"> | null,
): asserts target is ManagedUserRecord {
  if (!target) {
    throw lifecycleFailure(404, "USER_NOT_FOUND", "User not found");
  }
  if (target.role === "ADMIN") {
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
  const location = await db.location.findUnique({
    where: { id: locationId },
    select: { code: true, type: true, isActive: true },
  });
  if (
    !location ||
    !location.isActive ||
    location.type !== "BRANCH" ||
    !CANONICAL_BRANCH_CODES.has(location.code)
  ) {
    throw lifecycleFailure(
      400,
      "INVALID_ASSIGNMENT",
      "Branch Staff requires exactly one active branch assignment",
    );
  }
}

/**
 * Resolve the exact D-13 location for a staff role. Stock Staff always maps to
 * the active SR warehouse, Branch Staff requires one active canonical branch,
 * and Accounting Staff never carries a location.
 */
async function resolveAssignmentLocationId(
  db: Prisma.TransactionClient,
  role: ManageableUserRole,
  requestedLocationId?: string | null,
): Promise<string | null> {
  switch (role) {
    case "STOCK_STAFF":
      return (await resolveStockRoom(db)).id;
    case "BRANCH_STAFF": {
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
    case "ACCOUNTING_STAFF":
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
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;
  if (query.location === "none") where.locationId = null;
  else if (query.location) where.location = { code: query.location };

  // Metadata counts staff only; the immutable owner row still appears in data.
  const staffOnlyWhere: Prisma.UserWhereInput = {
    AND: [where, { role: { not: "ADMIN" } }],
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
    prisma.user.count({ where: { role: { not: "ADMIN" }, status: "ACTIVE" } }),
    prisma.user.count({ where: { role: { not: "ADMIN" }, status: "INACTIVE" } }),
  ]);

  return {
    data: rows.map(toManagedUserDto),
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

export async function createStaffUser(
  actor: PersistedAccessContext,
  input: CreateUserRequest,
): Promise<ManagedUserDto> {
  assertOwnerActor(actor);

  const locationId = await resolveAssignmentLocationId(
    prisma,
    input.role,
    "locationId" in input ? input.locationId : undefined,
  );
  await assertNoEmailConflict(prisma, input.email);

  try {
    const created = await internalUserAuth.api.createUser({
      body: {
        email: input.email,
        password: input.temporaryPassword,
        name: input.name,
        role: input.role,
        ...(locationId === null ? {} : { locationId }),
      },
    });

    await prisma.user.update({
      where: { id: created.user.id },
      data: { credentialSetupRequired: true },
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.user.id },
      select: managedUserSelect,
    });
    return toManagedUserDto(user);
  } catch (error) {
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

    // The target is already guarded as non-Admin by assertManageableTarget.
    const nextRole = (input.role ?? target.role) as ManageableUserRole;
    let requestedLocationId: string | null | undefined = input.locationId;
    if (requestedLocationId === undefined) {
      // Keep the current branch only when the target already holds one as a
      // Branch Staff member; switching into Branch Staff requires an explicit
      // active branch.
      requestedLocationId =
        target.role === "BRANCH_STAFF" ? target.location?.id ?? null : undefined;
    }
    const nextLocationId = await resolveAssignmentLocationId(
      tx,
      nextRole,
      requestedLocationId,
    );

    const nextName = input.name ?? target.name;
    const nextEmail = input.email ?? target.email;
    const currentLocationId = target.location?.id ?? null;
    const accessChanged =
      nextRole !== target.role || nextLocationId !== currentLocationId;

    await tx.user.update({
      where: { id: userId },
      data: {
        name: nextName,
        email: nextEmail,
        role: nextRole,
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
    select: { id: true, role: true },
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
