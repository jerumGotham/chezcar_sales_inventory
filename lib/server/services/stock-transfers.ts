import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type StockTransferStatus } from "@prisma/client";

import type { AuthContext } from "@/lib/server/authorization";
import type { CreateTransferInput, DiscrepancyInput, InvestigationInput, ResolutionInput } from "@/lib/contracts/stock-transfers";
import { prisma } from "@/lib/server/prisma";

export class TransferError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) { super(message); }
}

const TRANSFER_INCLUDE = {
  destination: { select: { id: true, code: true, name: true } },
  lines: { include: { product: { select: { id: true, itemCode: true, name: true } } } },
  discrepancy: { include: { lines: true } }, investigation: true, resolution: { include: { lines: true } },
} satisfies Prisma.StockTransferInclude;

function assertStockStaff(actor: AuthContext) { if (actor.role !== "STOCK_STAFF") throw new TransferError("FORBIDDEN", "Stock Staff access required", 403); }
function assertBranch(actor: AuthContext) { if (actor.role !== "BRANCH_STAFF") throw new TransferError("FORBIDDEN", "Branch Staff access required", 403); }
function assertAdmin(actor: AuthContext) { if (actor.role !== "ADMIN") throw new TransferError("FORBIDDEN", "Admin access required", 403); }
function assertVersion(actual: number, expected: number) { if (actual !== expected) throw new TransferError("STALE_VERSION", "Transfer changed; reload before retrying"); }

async function lockTransfer(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "StockTransfer" WHERE id = ${id} FOR UPDATE`;
  const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: TRANSFER_INCLUDE });
  if (!transfer) throw new TransferError("NOT_FOUND", "Transfer not found", 404);
  return transfer;
}

function ensureBranchScope(actor: AuthContext, destinationId: string) {
  if (actor.locationId !== destinationId) throw new TransferError("FORBIDDEN", "Transfer is outside your branch", 403);
}

async function decreaseAvailableBalance(
  tx: Prisma.TransactionClient,
  locationId: string,
  productId: string,
  quantity: number,
) {
  const balance = await tx.inventoryBalance.findUnique({
    where: { locationId_productId: { locationId, productId } },
    select: { onHand: true, reserved: true, version: true },
  });
  if (!balance || balance.onHand - balance.reserved < quantity) {
    throw new TransferError("INSUFFICIENT_STOCK", "Insufficient available source stock");
  }
  const result = await tx.inventoryBalance.updateMany({
    where: {
      locationId,
      productId,
      version: balance.version,
      onHand: { gte: balance.reserved + quantity },
    },
    data: { onHand: { decrement: quantity }, version: { increment: 1 } },
  });
  if (result.count !== 1) {
    throw new TransferError("STALE_BALANCE", "Source stock changed; reload before retrying");
  }
}

async function increaseBalance(
  tx: Prisma.TransactionClient,
  locationId: string,
  productId: string,
  quantity: number,
) {
  await tx.inventoryBalance.upsert({
    where: { locationId_productId: { locationId, productId } },
    create: { locationId, productId, onHand: quantity },
    update: { onHand: { increment: quantity }, version: { increment: 1 } },
  });
}

export async function listTransfers(actor: AuthContext) {
  const where = actor.role === "BRANCH_STAFF" ? { destinationId: actor.locationId as string } : {};
  const transfers = await prisma.stockTransfer.findMany({ where, orderBy: { createdAt: "desc" }, include: TRANSFER_INCLUDE });
  return transfers.map(serializeTransfer);
}

export async function createTransfer(actor: AuthContext, input: CreateTransferInput) {
  assertStockStaff(actor);
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) throw new TransferError("INVALID_LINES", "A product may appear only once", 400);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: "ACTIVE" },
    select: { id: true },
  });
  if (products.length !== productIds.length) {
    throw new TransferError("INVALID_LINES", "Every transfer product must be active", 400);
  }
  const destination = await prisma.location.findFirst({ where: { id: input.destinationId, type: "BRANCH", isActive: true, code: { in: ["QC", "BL", "LU", "VC", "SP"] } } });
  if (!destination) throw new TransferError("INVALID_DESTINATION", "Destination must be an active branch", 400);
  const transfer = await prisma.stockTransfer.create({ data: { reference: `ST-${randomUUID()}`, destinationId: destination.id, createdById: actor.userId, lines: { create: input.lines.map((line) => ({ productId: line.productId, requestedQuantity: line.quantity })) } }, include: TRANSFER_INCLUDE });
  return serializeTransfer(transfer);
}

export async function updateDraftTransfer(actor: AuthContext, id: string, version: number, lines: { productId: string; quantity: number }[]) {
  assertStockStaff(actor);
  if (new Set(lines.map((l) => l.productId)).size !== lines.length) throw new TransferError("INVALID_LINES", "A product may appear only once", 400);
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, id);
    if (transfer.status !== "DRAFT") throw new TransferError("INVALID_STATE", "Only draft transfers can be edited");
    assertVersion(transfer.version, version);
    await tx.stockTransferLine.deleteMany({ where: { transferId: id } });
    await tx.stockTransferLine.createMany({ data: lines.map((line) => ({ transferId: id, productId: line.productId, requestedQuantity: line.quantity })) });
    const updated = await tx.stockTransfer.update({ where: { id }, data: { version: { increment: 1 } }, include: TRANSFER_INCLUDE });
    return serializeTransfer(updated);
  }, { isolationLevel: "Serializable" });
}

export async function deleteDraftTransfer(actor: AuthContext, id: string) {
  assertStockStaff(actor);
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id } });
    if (!transfer) throw new TransferError("NOT_FOUND", "Transfer not found", 404);
    if (transfer.status !== "DRAFT") throw new TransferError("INVALID_STATE", "Only draft transfers can be deleted");
    await tx.stockTransferLine.deleteMany({ where: { transferId: id } });
    await tx.stockTransfer.delete({ where: { id } });
  }, { isolationLevel: "Serializable" });
}

export async function finalizeTransfer(actor: AuthContext, id: string, version: number) {
  assertStockStaff(actor);
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, id);
    if (transfer.status === "FOR_DISPATCH") return serializeTransfer(transfer);
    assertVersion(transfer.version, version);
    if (transfer.status !== "DRAFT") throw new TransferError("INVALID_STATE", "Only draft transfers can be finalized");
    const updated = await tx.stockTransfer.update({ where: { id }, data: { status: "FOR_DISPATCH", finalizedById: actor.userId, finalizedAt: new Date(), version: { increment: 1 } }, include: TRANSFER_INCLUDE });
    return serializeTransfer(updated);
  }, { isolationLevel: "Serializable" });
}

export async function dispatchTransfer(actor: AuthContext, id: string, version: number) {
  assertStockStaff(actor);
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, id);
    if (transfer.status === "IN_TRANSIT") return serializeTransfer(transfer);
    assertVersion(transfer.version, version);
    if (transfer.status !== "FOR_DISPATCH") throw new TransferError("INVALID_STATE", "Only finalized transfers can be dispatched");
    const sr = actor.locationId as string;
    for (const line of transfer.lines) {
      await decreaseAvailableBalance(tx, sr, line.productId, line.requestedQuantity);
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { dispatchedQuantity: line.requestedQuantity, inTransitQuantity: line.requestedQuantity } });
      await tx.inventoryMovement.create({ data: { transferId: id, productId: line.productId, locationId: sr, quantity: -line.requestedQuantity, type: "TRANSFER_DISPATCH", actorId: actor.userId } });
    }
    const updated = await tx.stockTransfer.update({ where: { id }, data: { status: "IN_TRANSIT", dispatchedById: actor.userId, dispatchedAt: new Date(), version: { increment: 1 } }, include: TRANSFER_INCLUDE });
    return serializeTransfer(updated);
  }, { isolationLevel: "Serializable" });
}

export async function confirmReceipt(actor: AuthContext, id: string, version: number) {
  assertBranch(actor);
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, id); ensureBranchScope(actor, transfer.destinationId);
    if (transfer.status === "RECEIVED") return serializeTransfer(transfer);
    assertVersion(transfer.version, version);
    if (transfer.status !== "IN_TRANSIT") throw new TransferError("INVALID_STATE", "Only in-transit transfers can be received");
    for (const line of transfer.lines) {
      await increaseBalance(tx, transfer.destinationId, line.productId, line.inTransitQuantity);
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { inTransitQuantity: 0 } });
      await tx.inventoryMovement.create({ data: { transferId: id, productId: line.productId, locationId: transfer.destinationId, quantity: line.dispatchedQuantity, type: "TRANSFER_RECEIPT", actorId: actor.userId } });
    }
    const updated = await tx.stockTransfer.update({ where: { id }, data: { status: "RECEIVED", receivedById: actor.userId, receivedAt: new Date(), version: { increment: 1 } }, include: TRANSFER_INCLUDE }); return serializeTransfer(updated);
  }, { isolationLevel: "Serializable" });
}

export async function reportDiscrepancy(actor: AuthContext, id: string, input: DiscrepancyInput) {
  assertBranch(actor);
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, id); ensureBranchScope(actor, transfer.destinationId);
    if (transfer.status === "DISCREPANCY_REPORTED") return serializeTransfer(transfer);
    assertVersion(transfer.version, input.version);
    if (transfer.status !== "IN_TRANSIT") throw new TransferError("INVALID_STATE", "Only in-transit transfers can be reported");
    if (input.lines.length !== transfer.lines.length || new Set(input.lines.map((line) => line.lineId)).size !== transfer.lines.length) throw new TransferError("INVALID_LINES", "Report every dispatched line", 400);
    for (const line of input.lines) { const dispatched = transfer.lines.find((item) => item.id === line.lineId); if (!dispatched || line.actualQuantity > dispatched.dispatchedQuantity) throw new TransferError("INVALID_LINES", "Actual quantity must not exceed dispatched quantity", 400); }
    if (input.lines.every((line) => transfer.lines.find((item) => item.id === line.lineId)?.dispatchedQuantity === line.actualQuantity)) {
      throw new TransferError("INVALID_DISCREPANCY", "Use exact receipt when every item count matches", 400);
    }
    await tx.stockTransferDiscrepancy.create({ data: { transferId: id, reportedById: actor.userId, notes: input.notes, lines: { create: input.lines.map((line) => ({ transferLineId: line.lineId, actualQuantity: line.actualQuantity, reason: line.reason, notes: line.notes })) } } });
    const updated = await tx.stockTransfer.update({ where: { id }, data: { status: "DISCREPANCY_REPORTED", version: { increment: 1 } }, include: TRANSFER_INCLUDE }); return serializeTransfer(updated);
  }, { isolationLevel: "Serializable" });
}

export async function submitInvestigation(actor: AuthContext, id: string, input: InvestigationInput) {
  assertStockStaff(actor);
  return prisma.$transaction(async (tx) => { const transfer = await lockTransfer(tx, id); if (transfer.status === "UNDER_REVIEW") return serializeTransfer(transfer); assertVersion(transfer.version, input.version); if (transfer.status !== "DISCREPANCY_REPORTED") throw new TransferError("INVALID_STATE", "Only reported discrepancies can be investigated"); await tx.stockTransferInvestigation.create({ data: { transferId: id, submittedById: actor.userId, findings: input.findings } }); const updated = await tx.stockTransfer.update({ where: { id }, data: { status: "UNDER_REVIEW", version: { increment: 1 } }, include: TRANSFER_INCLUDE }); return serializeTransfer(updated); }, { isolationLevel: "Serializable" });
}

export async function resolveTransfer(actor: AuthContext, id: string, input: ResolutionInput) {
  assertAdmin(actor);
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, id);
    if (transfer.status === "RESOLVED") return serializeTransfer(transfer);
    assertVersion(transfer.version, input.version);
    if (transfer.status !== "UNDER_REVIEW") throw new TransferError("INVALID_STATE", "Only investigated discrepancies can be resolved");
    if (input.lines.length !== transfer.lines.length) throw new TransferError("INVALID_LINES", "Resolve every dispatched line", 400);
    if (new Set(input.lines.map((line) => line.lineId)).size !== transfer.lines.length) {
      throw new TransferError("INVALID_LINES", "Resolve every dispatched line once", 400);
    }
    for (const item of input.lines) { const line = transfer.lines.find((candidate) => candidate.id === item.lineId); if (!line || item.destinationQuantity + item.restoreToSrQuantity + item.lossQuantity !== line.inTransitQuantity) throw new TransferError("UNBALANCED_RESOLUTION", "Each resolution line must account for all in-transit quantity", 400); }
    const sr = await tx.location.findFirstOrThrow({ where: { code: "SR", type: "WAREHOUSE", isActive: true }, select: { id: true } });
    const resolution = await tx.stockTransferResolution.create({ data: { transferId: id, postedById: actor.userId, notes: input.notes, lines: { create: input.lines.map((line) => ({ transferLineId: line.lineId, destinationQty: line.destinationQuantity, restoreToSrQty: line.restoreToSrQuantity, lossQty: line.lossQuantity })) } } });
    for (const item of input.lines) { const line = transfer.lines.find((candidate) => candidate.id === item.lineId)!; if (item.destinationQuantity) { await increaseBalance(tx, transfer.destinationId, line.productId, item.destinationQuantity); await tx.inventoryMovement.create({ data: { transferId: id, productId: line.productId, locationId: transfer.destinationId, quantity: item.destinationQuantity, type: "TRANSFER_RESOLUTION", actorId: actor.userId } }); } if (item.restoreToSrQuantity) { await increaseBalance(tx, sr.id, line.productId, item.restoreToSrQuantity); await tx.inventoryMovement.create({ data: { transferId: id, productId: line.productId, locationId: sr.id, quantity: item.restoreToSrQuantity, type: "TRANSFER_RESTORATION", actorId: actor.userId } }); } if (item.lossQuantity) await tx.inventoryMovement.create({ data: { transferId: id, productId: line.productId, quantity: -item.lossQuantity, type: "TRANSFER_LOSS", actorId: actor.userId } }); await tx.stockTransferLine.update({ where: { id: line.id }, data: { inTransitQuantity: 0 } }); }
    const updated = await tx.stockTransfer.update({ where: { id }, data: { status: "RESOLVED", version: { increment: 1 } }, include: TRANSFER_INCLUDE }); return serializeTransfer(updated);
  }, { isolationLevel: "Serializable" });
}

function serializeTransfer(transfer: any) {
  return { id: transfer.id, reference: transfer.reference, status: transfer.status as StockTransferStatus, version: transfer.version, destination: transfer.destination, createdAt: transfer.createdAt.toISOString(), lines: transfer.lines.map((line: any) => ({ id: line.id, product: line.product, requestedQuantity: line.requestedQuantity, dispatchedQuantity: line.dispatchedQuantity, inTransitQuantity: line.inTransitQuantity, discrepancy: transfer.discrepancy?.lines.find((item: any) => item.transferLineId === line.id) ?? null, resolution: transfer.resolution?.lines.find((item: any) => item.transferLineId === line.id) ?? null })), discrepancy: transfer.discrepancy ? { notes: transfer.discrepancy.notes, reportedAt: transfer.discrepancy.reportedAt.toISOString() } : null, investigation: transfer.investigation ? { findings: transfer.investigation.findings, submittedAt: transfer.investigation.submittedAt.toISOString() } : null, resolution: transfer.resolution ? { notes: transfer.resolution.notes, postedAt: transfer.resolution.postedAt.toISOString() } : null };
}
