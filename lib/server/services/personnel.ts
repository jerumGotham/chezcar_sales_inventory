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

export async function listPersonnel(actor: AuthContext): Promise<PersonnelDto[]> {
  assertCapability(actor, "personnel:view");
  const rows = await prisma.personnel.findMany({
    where: {
      ...locationScope(actor),
      location: { type: "BRANCH", isActive: true },
    },
    select: personnelSelect,
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
  });
  return rows.map(toDto);
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
  return toDto(await prisma.personnel.create({
    data: { ...personnel, createdById: actor.userId },
    select: personnelSelect,
  }));
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
  return toDto(await prisma.personnel.update({
    where: { id: personnelId },
    data: { ...editable, updatedById: actor.userId },
    select: personnelSelect,
  }));
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
  return toDto(await prisma.personnel.update({
    where: { id: personnelId },
    data: status === "ACTIVE"
      ? { status, reactivatedById: actor.userId, deactivatedById: null }
      : { status, deactivatedById: actor.userId, reactivatedById: null },
    select: personnelSelect,
  }));
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
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: context } },
      { status: 500 },
    );
  }
}
