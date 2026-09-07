import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type InventoryMovementType, type SupplierClaimStatus } from "@prisma/client";

import type { CreateSupplierClaimInput, SupplierClaimAction, SupplierClaimActionInput, SupplierClaimSettlementInput } from "@/lib/contracts/supplier-claims";
import { assertCapability, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";

export class SupplierClaimError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
}

const detailInclude = {
  lines: { orderBy: { productItemCode: "asc" as const } },
  actions: { orderBy: { createdAt: "desc" as const }, include: { actor: { select: { name: true } } } },
  evidence: { orderBy: { createdAt: "desc" as const } },
  settlements: { orderBy: { createdAt: "desc" as const }, include: { actor: { select: { name: true } } } },
} satisfies Prisma.SupplierClaimInclude;

function scopedWhere(actor: AuthContext) { return hasAllLocationAccess(actor) ? {} : { locationId: { in: [...actor.locationIds] } }; }
function assertLocation(actor: AuthContext, locationId: string) { if (!canAccessLocation(actor, locationId)) throw new SupplierClaimError("FORBIDDEN", "Claim location is outside your assignment", 403); }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function claimReference() { return `SC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`; }

export async function listSupplierClaims(actor: AuthContext, query: { page: number; pageSize: number; status?: SupplierClaimStatus }) {
  assertCapability(actor, "supplier-claims:view");
  const where = { ...scopedWhere(actor), ...(query.status ? { status: query.status } : {}) };
  const [total, data] = await Promise.all([
    prisma.supplierClaim.count({ where }),
    prisma.supplierClaim.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { lines: true } }),
  ]);
  return { data, meta: { ...query, total } };
}

export async function getSupplierClaim(actor: AuthContext, claimId: string) {
  assertCapability(actor, "supplier-claims:view");
  const claim = await prisma.supplierClaim.findFirst({ where: { id: claimId, ...scopedWhere(actor) }, include: detailInclude });
  if (!claim) throw new SupplierClaimError("NOT_FOUND", "Supplier claim not found", 404);
  return claim;
}

export async function createSupplierClaim(actor: AuthContext, input: CreateSupplierClaimInput) {
  assertCapability(actor, "supplier-claims:create");
  assertLocation(actor, input.locationId);
  const existing = await prisma.supplierClaim.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: detailInclude });
  if (existing) { assertLocation(actor, existing.locationId); return existing; }
  if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new SupplierClaimError("INVALID_LINES", "A product may appear only once", 400);
  return prisma.$transaction(async (tx) => {
    const [supplier, location, products, receipt, warranty] = await Promise.all([
      tx.supplier.findUnique({ where: { id: input.supplierId } }),
      tx.location.findUnique({ where: { id: input.locationId } }),
      tx.product.findMany({ where: { id: { in: input.lines.map((line) => line.productId) } } }),
      input.sourceReceiptId ? tx.stockReceipt.findUnique({ where: { id: input.sourceReceiptId } }) : null,
      input.customerWarrantyId ? tx.customerWarranty.findUnique({ where: { id: input.customerWarrantyId } }) : null,
    ]);
    if (!supplier || !location?.isActive || products.length !== input.lines.length) throw new SupplierClaimError("INVALID_INPUT", "Supplier, location, or product is invalid", 400);
    if (receipt && (receipt.supplierId !== supplier.id || receipt.locationId !== location.id)) throw new SupplierClaimError("INVALID_SOURCE", "Source receipt does not match supplier and location", 409);
    if (input.sourceReceiptId && !receipt) throw new SupplierClaimError("INVALID_SOURCE", "Source receipt not found", 404);
    if (warranty && warranty.locationId !== location.id) throw new SupplierClaimError("INVALID_SOURCE", "Customer warranty location does not match", 409);
    if (input.customerWarrantyId && !warranty) throw new SupplierClaimError("INVALID_SOURCE", "Customer warranty not found", 404);
    const byId = new Map(products.map((product) => [product.id, product]));
    return tx.supplierClaim.create({ data: { reference: claimReference(), idempotencyKey: input.idempotencyKey, supplierId: supplier.id, supplierName: supplier.name, locationId: location.id, locationCode: location.code, locationName: location.name, sourceReceiptId: input.sourceReceiptId, customerWarrantyId: input.customerWarrantyId, notes: input.notes, createdById: actor.userId, lines: { create: input.lines.map((line) => { const product = byId.get(line.productId)!; return { ...line, claimedQuantity: line.quarantinedQuantity + line.missingQuantity, openQuarantinedQuantity: line.quarantinedQuantity, openMissingQuantity: line.missingQuantity, productItemCode: product.itemCode, productName: product.name, unitCost: new Prisma.Decimal(line.unitCost) }; }) } }, include: detailInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function movementType(action: SupplierClaimAction): InventoryMovementType | null {
  const types: Partial<Record<SupplierClaimAction, InventoryMovementType>> = { "return-to-supplier": "SUPPLIER_CLAIM_RETURN", "send-repair": "SUPPLIER_CLAIM_REPAIR_SEND", "receive-replacement": "SUPPLIER_CLAIM_REPLACEMENT_RECEIPT", "release-repaired": "SUPPLIER_CLAIM_REPAIRED_RECEIPT", "receive-repaired": "SUPPLIER_CLAIM_REPAIRED_RECEIPT", writeoff: "SUPPLIER_CLAIM_WRITEOFF" };
  return types[action] ?? null;
}

export async function actOnSupplierClaim(actor: AuthContext, claimId: string, action: SupplierClaimAction, input: SupplierClaimActionInput) {
  const capability = action === "return-to-supplier" ? "supplier-claims:return-stock"
    : action === "receive-replacement" ? "supplier-claims:receive-replacement"
    : ["send-repair", "release-repaired", "receive-repaired"].includes(action) ? "supplier-claims:repair-stock"
    : action === "writeoff" ? "supplier-claims:approve-writeoff"
    : ["reject", "complete", "cancel"].includes(action) ? "supplier-claims:close"
    : "supplier-claims:manage";
  assertCapability(actor, capability);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claimId}))`;
    const claim = await tx.supplierClaim.findUnique({ where: { id: claimId }, include: { lines: true } });
    if (!claim) throw new SupplierClaimError("NOT_FOUND", "Supplier claim not found", 404);
    assertLocation(actor, claim.locationId);
    const requestHash = hash({ action, ...input });
    const prior = await tx.supplierClaimAction.findUnique({ where: { claimId_idempotencyKey: { claimId, idempotencyKey: input.idempotencyKey } } });
    if (prior) {
      if (prior.action !== action || prior.requestHash !== requestHash) throw new SupplierClaimError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused for another action", 409);
      return tx.supplierClaim.findUniqueOrThrow({ where: { id: claimId }, include: detailInclude });
    }
    if (claim.version !== input.version) throw new SupplierClaimError("VERSION_CONFLICT", "Claim changed; reload and retry", 409);
    let status: SupplierClaimStatus = claim.status;
    const lineActions = new Map(input.lines.map((line) => [line.productId, line.quantity]));
    const inventoryActions = ["return-to-supplier", "send-repair", "receive-replacement", "release-repaired", "receive-repaired", "writeoff"];
    if (action === "submit" && claim.status === "DRAFT") status = "PENDING";
    else if (action === "wait-replacement" && ["PENDING", "PARTIAL"].includes(claim.status)) status = "WAITING_REPLACEMENT";
    else if (action === "reject" && ["DRAFT", "PENDING"].includes(claim.status)) status = "REJECTED";
    else if (action === "cancel" && claim.status === "DRAFT") status = "CANCELLED";
    else if (action === "complete" && ["PENDING", "PARTIAL", "REPLACEMENT_RECEIVED"].includes(claim.status)) {
      if (claim.lines.some((line) => line.openQuarantinedQuantity + line.openMissingQuantity > 0)) throw new SupplierClaimError("UNRESOLVED_LINES", "Resolve every claimed quantity before completion", 409);
      status = "COMPLETED";
    } else if (inventoryActions.includes(action) && ["PENDING", "WAITING_REPLACEMENT", "PARTIAL"].includes(claim.status)) {
      if (lineActions.size === 0) throw new SupplierClaimError("INVALID_LINES", "Select at least one claim line", 400);
      for (const line of claim.lines) {
        const quantity = lineActions.get(line.productId);
        if (!quantity) continue;
        const consumesQuarantine = ["return-to-supplier", "send-repair", "release-repaired", "writeoff"].includes(action);
        const consumesExternal = ["receive-replacement", "receive-repaired"].includes(action);
        if (consumesQuarantine && quantity > line.openQuarantinedQuantity) throw new SupplierClaimError("QUANTITY_EXCEEDED", "Action exceeds quarantined claim quantity", 409);
        if (consumesExternal && quantity > line.openMissingQuantity) throw new SupplierClaimError("QUANTITY_EXCEEDED", "Action exceeds outstanding external quantity", 409);
        const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: claim.locationId, productId: line.productId } } });
        if (consumesQuarantine && (!balance || balance.quarantined < quantity || (action !== "release-repaired" && balance.onHand < quantity))) throw new SupplierClaimError("INSUFFICIENT_STOCK", "Insufficient quarantined stock", 409);
        if (["return-to-supplier", "send-repair"].includes(action)) {
          await tx.inventoryBalance.update({ where: { id: balance!.id }, data: { onHand: { decrement: quantity }, quarantined: { decrement: quantity }, version: { increment: 1 } } });
          await tx.supplierClaimLine.update({ where: { id: line.id }, data: { openQuarantinedQuantity: { decrement: quantity }, openMissingQuantity: { increment: quantity } } });
        } else if (action === "release-repaired") {
          await tx.inventoryBalance.update({ where: { id: balance!.id }, data: { quarantined: { decrement: quantity }, version: { increment: 1 } } });
          await tx.supplierClaimLine.update({ where: { id: line.id }, data: { openQuarantinedQuantity: { decrement: quantity } } });
        } else if (action === "writeoff") {
          await tx.inventoryBalance.update({ where: { id: balance!.id }, data: { onHand: { decrement: quantity }, quarantined: { decrement: quantity }, version: { increment: 1 } } });
          await tx.supplierClaimLine.update({ where: { id: line.id }, data: { openQuarantinedQuantity: { decrement: quantity } } });
        } else {
          await tx.inventoryBalance.upsert({ where: { locationId_productId: { locationId: claim.locationId, productId: line.productId } }, create: { locationId: claim.locationId, productId: line.productId, onHand: quantity }, update: { onHand: { increment: quantity }, version: { increment: 1 } } });
          await tx.supplierClaimLine.update({ where: { id: line.id }, data: { openMissingQuantity: { decrement: quantity } } });
        }
        const type = movementType(action);
        if (type) await tx.inventoryMovement.create({ data: { supplierClaimId: claim.id, productId: line.productId, locationId: claim.locationId, quantity: ["return-to-supplier", "send-repair", "writeoff"].includes(action) ? -quantity : action === "release-repaired" ? 0 : quantity, type, actorId: actor.userId, reference: claim.reference, remarks: input.notes } });
      }
      const remaining = await tx.supplierClaimLine.aggregate({ where: { claimId }, _sum: { openQuarantinedQuantity: true, openMissingQuantity: true } });
      const unresolved = (remaining._sum.openQuarantinedQuantity ?? 0) + (remaining._sum.openMissingQuantity ?? 0);
      status = unresolved === 0 && action === "receive-replacement" ? "REPLACEMENT_RECEIVED" : unresolved === 0 ? "PENDING" : "PARTIAL";
    } else throw new SupplierClaimError("INVALID_STATE", `Cannot ${action} a ${claim.status.toLowerCase()} claim`, 409);
    await tx.supplierClaim.update({ where: { id: claimId }, data: { status, version: { increment: 1 }, ...(action === "submit" ? { submittedAt: new Date() } : {}), ...(action === "complete" ? { completedAt: new Date() } : {}) } });
    await tx.supplierClaimAction.create({ data: { claimId, idempotencyKey: input.idempotencyKey, action, requestHash, fromStatus: claim.status, toStatus: status, detailsJson: input, actorId: actor.userId } });
    return tx.supplierClaim.findUniqueOrThrow({ where: { id: claimId }, include: detailInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function addSupplierClaimSettlement(actor: AuthContext, claimId: string, input: SupplierClaimSettlementInput) {
  assertCapability(actor, "supplier-claims:record-monetary-resolution");
  await getSupplierClaim(actor, claimId);
  const existing = await prisma.supplierClaimSettlement.findUnique({ where: { claimId_idempotencyKey: { claimId, idempotencyKey: input.idempotencyKey } } });
  if (existing) return existing;
  return prisma.supplierClaimSettlement.create({ data: { claimId, ...input, amount: new Prisma.Decimal(input.amount), currency: input.currency.toUpperCase(), actorId: actor.userId } });
}

export async function addSupplierClaimEvidence(actor: AuthContext, claimId: string, evidence: { key: string; contentType: string; fileName: string; size: number }, caption?: string) {
  assertCapability(actor, "supplier-claims:evidence");
  await getSupplierClaim(actor, claimId);
  return prisma.supplierClaimEvidence.create({ data: { claimId, storageKey: evidence.key, contentType: evidence.contentType, fileName: evidence.fileName, size: evidence.size, caption, uploadedById: actor.userId } });
}
