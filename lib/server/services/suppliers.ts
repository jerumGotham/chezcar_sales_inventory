import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type {
  CreateSupplierRequest,
  SupplierDto,
  SupplierOptionDto,
  SupplierStatusRequest,
  UpdateSupplierRequest,
} from "@/lib/contracts/suppliers";
import {
  createSupplierSchema,
  supplierStatusRequestSchema,
  updateSupplierSchema,
} from "@/lib/contracts/suppliers";
import {
  assertCapability,
  authorizationErrorResponse,
  type AuthContext,
} from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

const supplierSelect = {
  id: true,
  code: true,
  name: true,
  contactPerson: true,
  contactNumber: true,
  email: true,
  address: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SupplierSelect;

type SupplierRecord = Prisma.SupplierGetPayload<{ select: typeof supplierSelect }>;

export class SupplierMaintenanceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SupplierMaintenanceError";
  }
}

function toDto(supplier: SupplierRecord): SupplierDto {
  return {
    ...supplier,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

function mapUniqueConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = String(error.meta?.target ?? "");
    if (target.toLowerCase().includes("code")) {
      throw new SupplierMaintenanceError(409, "SUPPLIER_CODE_IN_USE", "Supplier code already exists");
    }
    throw new SupplierMaintenanceError(409, "SUPPLIER_NAME_IN_USE", "Supplier name already exists");
  }
  throw error;
}

export async function listSuppliers(actor: AuthContext): Promise<SupplierDto[]> {
  assertCapability(actor, "suppliers:view");
  const suppliers = await prisma.supplier.findMany({
    select: supplierSelect,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return suppliers.map(toDto);
}

export async function listActiveSupplierOptionsForReceiving(
  actor: AuthContext,
): Promise<SupplierOptionDto[]> {
  assertCapability(actor, "inventory-receiving:create");
  return prisma.supplier.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function createSupplier(
  actor: AuthContext,
  input: CreateSupplierRequest,
): Promise<SupplierDto> {
  assertCapability(actor, "suppliers:create");
  const supplier = createSupplierSchema.parse(input);
  try {
    return toDto(await prisma.supplier.create({
      data: { ...supplier, createdById: actor.userId },
      select: supplierSelect,
    }));
  } catch (error) {
    return mapUniqueConflict(error);
  }
}

export async function updateSupplier(
  actor: AuthContext,
  supplierId: string,
  input: UpdateSupplierRequest,
): Promise<SupplierDto> {
  assertCapability(actor, "suppliers:update");
  const editable = updateSupplierSchema.parse(input);
  try {
    return toDto(await prisma.supplier.update({
      where: { id: supplierId },
      data: { ...editable, updatedById: actor.userId },
      select: supplierSelect,
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new SupplierMaintenanceError(404, "SUPPLIER_NOT_FOUND", "Supplier not found");
    }
    return mapUniqueConflict(error);
  }
}

export async function setSupplierStatus(
  actor: AuthContext,
  supplierId: string,
  input: SupplierStatusRequest,
): Promise<SupplierDto> {
  assertCapability(actor, "suppliers:deactivate");
  const { status } = supplierStatusRequestSchema.parse(input);
  try {
    return toDto(await prisma.supplier.update({
      where: { id: supplierId },
      data: status === "ACTIVE"
        ? { status, reactivatedById: actor.userId, deactivatedById: null }
        : { status, deactivatedById: actor.userId, reactivatedById: null },
      select: supplierSelect,
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new SupplierMaintenanceError(404, "SUPPLIER_NOT_FOUND", "Supplier not found");
    }
    throw error;
  }
}

export function suppliersErrorResponse(error: unknown, context: string): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid supplier details" } },
      { status: 400 },
    );
  }
  if (error instanceof SupplierMaintenanceError) {
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
