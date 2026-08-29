import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type {
  BranchDto,
  CreateBranchRequest,
  UpdateBranchRequest,
} from "@/lib/contracts/branches";
import {
  createBranchSchema,
  updateBranchSchema,
} from "@/lib/contracts/branches";
import { AuthorizationError, authorizationErrorResponse, type AuthContext } from "@/lib/server/authorization";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";

const branchSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  city: true,
  contactNumber: true,
  email: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LocationSelect;

type BranchRecord = Prisma.LocationGetPayload<{ select: typeof branchSelect }>;

export class BranchMaintenanceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BranchMaintenanceError";
  }
}

function toDto(branch: BranchRecord): BranchDto {
  return {
    ...branch,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

export async function listBranches(actor: AuthContext): Promise<BranchDto[]> {
  const rows = await prisma.location.findMany({
    where: {
      type: "BRANCH",
      isActive: true,
      ...(hasAllLocationAccess(actor) ? {} : { id: { in: [...actor.locationIds] } }),
    },
    select: branchSelect,
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });
  return rows.map(toDto);
}

export async function createBranch(actor: AuthContext, input: CreateBranchRequest): Promise<BranchDto> {
  if (!hasAllLocationAccess(actor)) throw new AuthorizationError("All-location access is required to create a branch");
  const branch = createBranchSchema.parse(input);
  try {
    const row = await prisma.location.create({
      data: { ...branch, type: "BRANCH", isActive: true },
      select: branchSelect,
    });
    return toDto(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new BranchMaintenanceError(409, "BRANCH_CODE_IN_USE", "Branch code already exists");
    }
    throw error;
  }
}

export async function updateBranch(
  actor: AuthContext,
  branchId: string,
  input: UpdateBranchRequest,
): Promise<BranchDto> {
  const editable = updateBranchSchema.parse(input);
  if (!canAccessLocation(actor, branchId)) throw new AuthorizationError("Branch is outside assigned locations");
  const existing = await prisma.location.findFirst({
    where: { id: branchId, type: "BRANCH", isActive: true },
    select: { id: true },
  });
  if (!existing) {
    throw new BranchMaintenanceError(404, "BRANCH_NOT_FOUND", "Branch not found");
  }

  return toDto(
    await prisma.location.update({
      where: { id: branchId },
      data: editable,
      select: branchSelect,
    }),
  );
}

export function branchesErrorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid branch details" } },
      { status: 400 },
    );
  }
  if (error instanceof BranchMaintenanceError) {
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
