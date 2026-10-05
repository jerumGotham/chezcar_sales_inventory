import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type {
  CreatePersonnelRequest,
  PersonnelBranchOptionDto,
  PersonnelDto,
  PersonnelStatusRequest,
  SalespersonOptionDto,
  UpdatePersonnelRequest,
} from "@/lib/contracts/personnel";
import {
  personnelListQuerySchema,
  createPersonnelSchema,
  personnelStatusRequestSchema,
  updatePersonnelSchema,
} from "@/lib/contracts/personnel";
import {
  assertCapability,
  AuthorizationError,
  authorizationErrorResponse,
  type AuthContext,
} from "@/lib/server/authorization";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";
import { recordAuditLog } from "./audit-log";

import { describeError, recordSystemLog } from "./system-log";
const personnelSelect = {
  id: true,
  fullName: true,
  locationId: true,
  location: { select: { id: true, code: true, name: true } },
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PersonnelSelect;

type PersonnelRecord = Prisma.PersonnelGetPayload<{ select: typeof personnelSelect }>;

export class PersonnelMaintenanceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PersonnelMaintenanceError";
  }
}

function toDto(personnel: PersonnelRecord): PersonnelDto {
  return {
    ...personnel,
    createdAt: personnel.createdAt.toISOString(),
    updatedAt: personnel.updatedAt.toISOString(),
  };
}

function locationScope(actor: AuthContext) {
  return hasAllLocationAccess(actor) ? {} : { locationId: { in: [...actor.locationIds] } };
}

async function requireActiveBranch(actor: AuthContext, locationId: string) {
  if (!canAccessLocation(actor, locationId)) {
    throw new AuthorizationError("Branch is outside assigned locations");
  }
  const location = await prisma.location.findFirst({
    where: { id: locationId, type: "BRANCH", isActive: true },
    select: { id: true },
  });
  if (!location) {
    throw new PersonnelMaintenanceError(400, "INVALID_PERSONNEL_BRANCH", "Select an active branch");
  }
}

async function requireScopedPersonnel(actor: AuthContext, personnelId: string) {
  const personnel = await prisma.personnel.findUnique({
    where: { id: personnelId },
    select: { id: true, locationId: true },
  });
  if (!personnel) {
    throw new PersonnelMaintenanceError(404, "PERSONNEL_NOT_FOUND", "Personnel not found");
  }
  if (!canAccessLocation(actor, personnel.locationId)) {
    throw new AuthorizationError("Personnel is outside assigned locations");
  }
  return personnel;
}

export async function listPersonnel(
  actor: AuthContext,
  query: z.infer<typeof personnelListQuerySchema> = personnelListQuerySchema.parse({}),
) {
  assertCapability(actor, "personnel:view");
  /*
   * One box over the name and the branch. A reader looking for somebody knows
   * one or the other, and rarely which column it will match.
   */
  const where: Prisma.PersonnelWhereInput = {
    ...locationScope(actor),
    location: { type: "BRANCH", isActive: true },
    status: query.status === "all" ? undefined : query.status === "active" ? "ACTIVE" : "INACTIVE",
    type: query.type === "all" ? undefined : query.type,
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" } },
            { location: { name: { contains: query.search, mode: "insensitive" } } },
            { location: { code: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await prisma.personnel.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  // Clamped, so deactivating the last row of the last page does not strand the
  // reader on a page that no longer exists.
  const page = Math.min(query.page, totalPages);
  const rows = await prisma.personnel.findMany({
    where,
    select: personnelSelect,
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    skip: (page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return { data: rows.map(toDto), meta: { page, pageSize: query.pageSize, total, totalPages } };
}

export async function listAssignablePersonnelBranches(
  actor: AuthContext,
): Promise<PersonnelBranchOptionDto[]> {
  assertCapability(actor, "personnel:view");
  return prisma.location.findMany({
    where: {
      type: "BRANCH",
      isActive: true,
      ...(hasAllLocationAccess(actor) ? {} : { id: { in: [...actor.locationIds] } }),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

export async function listActiveSalespersonOptions(
  actor: AuthContext,
  locationId: string,
): Promise<SalespersonOptionDto[]> {
  if (!canAccessLocation(actor, locationId)) {
    throw new AuthorizationError("Branch is outside assigned locations");
  }
  return prisma.personnel.findMany({
    where: {
      ...eligiblePersonnelWhere(actor, "SALESPERSON"),
    },
    select: { id: true, fullName: true, locationId: true },
    orderBy: { fullName: "asc" },
  });
}

export async function resolveActiveSalespersonForTransaction(
  tx: Prisma.TransactionClient,
  actor: AuthContext,
  personnelId: string,
  locationId: string,
) {
  if (!canAccessLocation(actor, locationId)) {
    throw new AuthorizationError("Branch is outside assigned locations");
  }
  await tx.$queryRaw`SELECT id FROM "Personnel" WHERE id = ${personnelId} FOR SHARE`;
  return tx.personnel.findFirst({
    where: {
      id: personnelId,
      ...eligiblePersonnelWhere(actor, "SALESPERSON"),
    },
    select: {
      id: true,
      fullName: true,
      locationId: true,
      location: { select: { id: true, code: true, name: true } },
    },
  });
}

export function eligiblePersonnelWhere(
  actor: AuthContext,
  type: "SALESPERSON" | "INSTALLER",
): Prisma.PersonnelWhereInput {
  return {
    ...locationScope(actor),
    status: "ACTIVE",
    type: { in: [type, "BOTH"] },
    location: { type: "BRANCH", isActive: true },
  };
}

export async function createPersonnel(
  actor: AuthContext,
  input: CreatePersonnelRequest,
): Promise<PersonnelDto> {
  assertCapability(actor, "personnel:create");
  const personnel = createPersonnelSchema.parse(input);
  await requireActiveBranch(actor, personnel.locationId);
  const created = toDto(await prisma.personnel.create({
    data: { ...personnel, createdById: actor.userId },
    select: personnelSelect,
  }));
  await recordAuditLog({ category: "Master Data", action: "Personnel Created", actorId: actor.userId, reference: created.fullName, locationLabel: created.location.name, details: `${created.fullName} as ${created.type}` });
  return created;
}

export async function updatePersonnel(
  actor: AuthContext,
  personnelId: string,
  input: UpdatePersonnelRequest,
): Promise<PersonnelDto> {
  assertCapability(actor, "personnel:update");
  const editable = updatePersonnelSchema.parse(input);
  await requireScopedPersonnel(actor, personnelId);
  if (editable.locationId) await requireActiveBranch(actor, editable.locationId);
  const updated = toDto(await prisma.personnel.update({
    where: { id: personnelId },
    data: { ...editable, updatedById: actor.userId },
    select: personnelSelect,
  }));
  await recordAuditLog({ category: "Master Data", action: "Personnel Updated", actorId: actor.userId, reference: updated.fullName, locationLabel: updated.location.name, details: `${updated.fullName} as ${updated.type}` });
  return updated;
}

export async function setPersonnelStatus(
  actor: AuthContext,
  personnelId: string,
  input: PersonnelStatusRequest,
): Promise<PersonnelDto> {
  assertCapability(actor, "personnel:deactivate");
  const { status } = personnelStatusRequestSchema.parse(input);
  const existing = await requireScopedPersonnel(actor, personnelId);
  if (status === "ACTIVE") await requireActiveBranch(actor, existing.locationId);
  const changed = toDto(await prisma.personnel.update({
    where: { id: personnelId },
    data: status === "ACTIVE"
      ? { status, reactivatedById: actor.userId, deactivatedById: null }
      : { status, deactivatedById: actor.userId, reactivatedById: null },
    select: personnelSelect,
  }));
  await recordAuditLog({ category: "Master Data", action: `Personnel ${status === "ACTIVE" ? "Reactivated" : "Deactivated"}`, actorId: actor.userId, reference: changed.fullName, locationLabel: changed.location.name, details: changed.fullName });
  return changed;
}

export function personnelErrorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid personnel details" } },
      { status: 400 },
    );
  }
  if (error instanceof PersonnelMaintenanceError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  try {
    return authorizationErrorResponse(error);
  } catch (unexpectedError) {
    console.error(context, unexpectedError);
    // Kept where it can be read back: the container log is gone on the
    // next restart, and this is the only answer to "it said internal
    // server error".
    void recordSystemLog({ level: "ERROR", source: context, ...describeError(unexpectedError) });
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: context } },
      { status: 500 },
    );
  }
}
