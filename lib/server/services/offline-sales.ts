import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type { AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { findActiveBranch } from "@/lib/server/locations";
import { createDirectSale, CustomerSalesError, directSaleSchema } from "@/lib/server/services/customer-sales";

const activationSchema = z.object({
  locationId: z.string().min(1),
  deviceId: z.string().trim().min(8).max(200),
  label: z.string().trim().max(100).optional(),
});
const snapshotQuerySchema = z.object({ deviceId: z.string().trim().min(8).max(200) });
const syncSchema = z.object({
  deviceId: z.string().trim().min(8).max(200),
  idempotencyKey: z.string().uuid(),
  occurredAt: z.string().datetime(),
  operationType: z.literal("DIRECT_SALE"),
  payload: z.unknown(),
});

export class OfflineSalesError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

function assertBranchActor(actor: AuthContext) {
  if (actor.role !== "BRANCH_STAFF" || !actor.locationId || actor.location?.id !== actor.locationId || actor.location.type !== "BRANCH" || !actor.location.isActive) {
    throw new OfflineSalesError("FORBIDDEN", "Branch Staff with an active branch assignment is required", 403);
  }
  return actor.locationId;
}

function requestHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function activateOfflineDevice(actor: AuthContext, rawInput: unknown) {
  if (actor.role !== "ADMIN") throw new OfflineSalesError("FORBIDDEN", "Admin access required", 403);
  const input = activationSchema.parse(rawInput);
  const location = await findActiveBranch(input.locationId);
  if (!location) throw new OfflineSalesError("INVALID_LOCATION", "Select an active branch", 400);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    await tx.offlineDeviceActivation.updateMany({
      where: { locationId: location.id, status: "ACTIVE", deviceId: { not: input.deviceId } },
      data: { status: "REVOKED", revokedAt: now },
    });

    const activation = await tx.offlineDeviceActivation.upsert({
      where: { deviceId: input.deviceId },
      create: { deviceId: input.deviceId, locationId: location.id, activatedById: actor.userId, label: input.label || null, expiresAt },
      update: { locationId: location.id, activatedById: actor.userId, label: input.label || null, status: "ACTIVE", revokedAt: null, lastAuthorizedAt: now, expiresAt },
    });

    return { id: activation.id, deviceId: activation.deviceId, location, expiresAt: activation.expiresAt.toISOString() };
  });
}

export async function getOfflineSnapshot(actor: AuthContext, rawInput: unknown) {
  const locationId = assertBranchActor(actor);
  const input = snapshotQuerySchema.parse(rawInput);
  const activation = await authorizeDevice(input.deviceId, locationId, true);
  const balances = await prisma.inventoryBalance.findMany({
    where: { locationId, product: { status: "ACTIVE", price: { not: null } } },
    include: { product: true },
    orderBy: { product: { itemCode: "asc" } },
    take: 500,
  });

  return {
    deviceId: input.deviceId,
    locationId,
    authorizedAt: activation.lastAuthorizedAt.toISOString(),
    expiresAt: activation.expiresAt.toISOString(),
    products: balances.map((balance) => ({
      id: balance.productId,
      itemCode: balance.product.itemCode,
      name: balance.product.name,
      price: balance.product.price?.toNumber() ?? 0,
      available: Math.max(0, balance.onHand - balance.reserved),
      balanceVersion: balance.version,
    })),
  };
}

export async function syncOfflineSale(actor: AuthContext, rawInput: unknown) {
  const locationId = assertBranchActor(actor);
  const input = syncSchema.parse(rawInput);
  await authorizeDevice(input.deviceId, locationId, false);
  const hash = requestHash(input);

  const existing = await prisma.offlineSyncOperation.findUnique({
    where: { deviceId_idempotencyKey: { deviceId: input.deviceId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    if (existing.requestHash !== hash) return { status: "CONFLICT" as const, message: "Idempotency key was reused with a different payload" };
    return { status: existing.status === "ACCEPTED" ? "ALREADY_ACCEPTED" as const : existing.status, result: existing.resultJson ? JSON.parse(existing.resultJson) : null };
  }

  const operation = await prisma.offlineSyncOperation.create({
    data: { deviceId: input.deviceId, idempotencyKey: input.idempotencyKey, operationType: input.operationType, requestHash: hash, status: "PENDING", actorId: actor.userId, locationId },
  });
  const submission = await prisma.offlineSaleSubmission.create({
    data: { syncOperationId: operation.id, deviceId: input.deviceId, idempotencyKey: input.idempotencyKey, locationId, submittedById: actor.userId, payloadJson: JSON.stringify(input.payload), status: "PENDING", occurredAt: new Date(input.occurredAt) },
  });

  const parsedSale = directSaleSchema.safeParse(input.payload);
  if (!parsedSale.success || parsedSale.data.customer) {
    return updateOfflineResult(operation.id, submission.id, "REJECTED", "Offline sale payload is invalid or contains new customer details", null);
  }

  try {
    const sale = await createDirectSale(actor, { ...parsedSale.data, locationId });
    return updateOfflineResult(operation.id, submission.id, "ACCEPTED", null, sale);
  } catch (error) {
    const status = error instanceof CustomerSalesError && error.status === 409 ? "NEEDS_REVIEW" : "REJECTED";
    const message = error instanceof Error ? error.message : "Offline sale could not be synchronized";
    return updateOfflineResult(operation.id, submission.id, status, message, null);
  }
}

async function authorizeDevice(deviceId: string, locationId: string, refresh: boolean) {
  const now = new Date();
  const activation = await prisma.offlineDeviceActivation.findFirst({ where: { deviceId, locationId, status: "ACTIVE" } });
  if (!activation || activation.expiresAt.getTime() <= now.getTime()) throw new OfflineSalesError("OFFLINE_DEVICE_NOT_AUTHORIZED", "Offline device authorization is missing or expired", 403);
  if (!refresh) return activation;

  return prisma.offlineDeviceActivation.update({
    where: { id: activation.id },
    data: { lastAuthorizedAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  });
}

async function updateOfflineResult(operationId: string, submissionId: string, status: "ACCEPTED" | "REJECTED" | "NEEDS_REVIEW", message: string | null, sale: unknown) {
  const result = sale ? { sale } : message ? { message } : null;
  await prisma.$transaction([
    prisma.offlineSyncOperation.update({ where: { id: operationId }, data: { status, saleId: sale && typeof sale === "object" && "id" in sale ? String(sale.id) : null, resultJson: result ? JSON.stringify(result) : null, processedAt: new Date() } }),
    prisma.offlineSaleSubmission.update({ where: { id: submissionId }, data: { status, statusReason: message, saleId: sale && typeof sale === "object" && "id" in sale ? String(sale.id) : null } }),
  ]);
  return { status, result };
}
