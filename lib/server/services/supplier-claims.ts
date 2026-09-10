import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type InventoryMovementType, type SupplierClaimStatus } from "@prisma/client";

import { supplierClaimActionCapabilities, type CreateSupplierClaimInput, type SupplierClaimAction, type SupplierClaimActionInput, type SupplierClaimSettlementInput } from "@/lib/contracts/supplier-claims";
import { assertCapability, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { createNotifications, findWorkflowNotificationRecipients } from "@/lib/server/services/notifications";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";
import { calculateWarrantyQuarantine } from "@/lib/server/services/warranty-quarantine";

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
function normalizedClaimRequest(input: CreateSupplierClaimInput) {
  return {
    supplierId: input.supplierId,
    locationId: input.locationId,
    sourceReceiptId: input.sourceReceiptId ?? null,
    customerWarrantyId: input.customerWarrantyId ?? null,
    notes: input.notes ?? null,
    targetDate: input.targetDate ? new Date(input.targetDate).toISOString() : null,
    lines: input.lines.map((line) => ({ ...line, notes: line.notes ?? null, unitCost: new Prisma.Decimal(line.unitCost).toString() })).sort((a, b) => a.productId.localeCompare(b.productId)),
  };
}
function normalizedStoredClaim(claim: Prisma.SupplierClaimGetPayload<{ include: typeof detailInclude }>) {
  return {
    supplierId: claim.supplierId,
    locationId: claim.locationId,
    sourceReceiptId: claim.sourceReceiptId,
    customerWarrantyId: claim.customerWarrantyId,
    notes: claim.notes,
    targetDate: claim.targetDate?.toISOString() ?? null,
    lines: claim.lines.map((line) => ({ productId: line.productId, reason: line.reason, quarantinedQuantity: line.quarantinedQuantity, missingQuantity: line.missingQuantity, unitCost: line.unitCost.toString(), notes: line.notes })).sort((a, b) => a.productId.localeCompare(b.productId)),
  };
}
function assertCreateReplay(claim: Prisma.SupplierClaimGetPayload<{ include: typeof detailInclude }>, input: CreateSupplierClaimInput) {
  if (hash(normalizedStoredClaim(claim)) !== hash(normalizedClaimRequest(input))) throw new SupplierClaimError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused with a different claim payload", 409);
}
function isUniqueConstraintError(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
function normalizedSettlementRequest(input: SupplierClaimSettlementInput) {
  return {
    type: input.type,
    amount: new Prisma.Decimal(input.amount).toString(),
    currency: input.currency.toUpperCase(),
    reference: input.reference,
    notes: input.notes ?? null,
    lines: [...input.lines].sort((a, b) => a.productId.localeCompare(b.productId)),
  };
}
async function assertQuarantineAvailable(tx: Prisma.TransactionClient, locationId: string, lines: CreateSupplierClaimInput["lines"], customerWarrantyId?: string) {
  const requested = lines.filter((line) => line.quarantinedQuantity > 0).sort((a, b) => a.productId.localeCompare(b.productId));
  if (requested.length === 0) return;

  for (const line of requested) {
    await tx.$queryRaw`SELECT "id" FROM "InventoryBalance" WHERE "locationId" = ${locationId} AND "productId" = ${line.productId} FOR UPDATE`;
  }
  const productIds = requested.map((line) => line.productId);
  const [balances, openLines, warranties] = await Promise.all([
    tx.inventoryBalance.findMany({ where: { locationId, productId: { in: productIds } }, select: { productId: true, quarantined: true } }),
    tx.supplierClaimLine.findMany({ where: { productId: { in: productIds }, openQuarantinedQuantity: { gt: 0 }, claim: { locationId, status: { notIn: ["REJECTED", "COMPLETED", "CANCELLED"] } } }, select: { productId: true, openQuarantinedQuantity: true } }),
    tx.customerWarranty.findMany({ where: { locationId, productId: { in: productIds }, receivedQuantity: { gt: 0 } }, select: { id: true, productId: true, receivedQuantity: true, returnedQuantity: true, resolution: true, status: true, supplierClaims: { select: { lines: { select: { productId: true, quarantinedQuantity: true, openQuarantinedQuantity: true } } } } } }),
  ]);
  const quarantinedByProduct = new Map(balances.map((balance) => [balance.productId, balance.quarantined]));
  const allocatedByProduct = new Map<string, number>();
  for (const line of openLines) allocatedByProduct.set(line.productId, (allocatedByProduct.get(line.productId) ?? 0) + line.openQuarantinedQuantity);
  const warrantyOwnedByProduct = new Map<string, number>();
  const targetWarrantyOwnedByProduct = new Map<string, number>();
  for (const warranty of warranties) {
    if (!warranty.productId) continue;
    const linkedLines = warranty.supplierClaims.flatMap((claim) => claim.lines).filter((line) => line.productId === warranty.productId);
    const ownership = calculateWarrantyQuarantine(
      warranty,
      linkedLines.reduce((sum, line) => sum + line.quarantinedQuantity, 0),
      linkedLines.reduce((sum, line) => sum + line.openQuarantinedQuantity, 0),
    ).unassignedQuantity;
    warrantyOwnedByProduct.set(warranty.productId, (warrantyOwnedByProduct.get(warranty.productId) ?? 0) + ownership);
    if (warranty.id === customerWarrantyId) targetWarrantyOwnedByProduct.set(warranty.productId, ownership);
  }
  for (const line of requested) {
    const available = (quarantinedByProduct.get(line.productId) ?? 0)
      - (allocatedByProduct.get(line.productId) ?? 0)
      - (warrantyOwnedByProduct.get(line.productId) ?? 0)
      + (targetWarrantyOwnedByProduct.get(line.productId) ?? 0);
    if (line.quarantinedQuantity > available) throw new SupplierClaimError("QUARANTINE_EXCEEDED", "Claim exceeds unallocated quarantined stock at this location", 409);
  }
}

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
  if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new SupplierClaimError("INVALID_LINES", "A product may appear only once", 400);
  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`;
    if (input.sourceReceiptId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sourceReceiptId}))`;
    if (input.customerWarrantyId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.customerWarrantyId}))`;
    const existing = await tx.supplierClaim.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: detailInclude });
    if (existing) {
      assertLocation(actor, existing.locationId);
      assertCreateReplay(existing, input);
      return existing;
    }
    const [supplier, location, products, receipt, warranty, sourceClaim] = await Promise.all([
      tx.supplier.findUnique({ where: { id: input.supplierId } }),
      tx.location.findUnique({ where: { id: input.locationId } }),
      tx.product.findMany({ where: { id: { in: input.lines.map((line) => line.productId) } } }),
      input.sourceReceiptId ? tx.stockReceipt.findUnique({ where: { id: input.sourceReceiptId }, include: { lines: true } }) : null,
      input.customerWarrantyId ? tx.customerWarranty.findUnique({ where: { id: input.customerWarrantyId } }) : null,
      input.sourceReceiptId ? tx.supplierClaim.findUnique({ where: { sourceReceiptId: input.sourceReceiptId }, select: { id: true } }) : null,
    ]);
    if (!supplier || !location?.isActive || products.length !== input.lines.length) throw new SupplierClaimError("INVALID_INPUT", "Supplier, location, or product is invalid", 400);
    if (receipt && (receipt.supplierId !== supplier.id || receipt.locationId !== location.id)) throw new SupplierClaimError("INVALID_SOURCE", "Source receipt does not match supplier and location", 409);
    if (input.sourceReceiptId && !receipt) throw new SupplierClaimError("INVALID_SOURCE", "Source receipt not found", 404);
    if (receipt) {
      const receiptLines = new Map(receipt.lines.map((line) => [line.productId, line]));
      for (const line of input.lines) {
        const sourceLine = receiptLines.get(line.productId);
        if (!sourceLine || line.quarantinedQuantity > sourceLine.quarantinedQuantity || line.missingQuantity > sourceLine.missingQuantity) throw new SupplierClaimError("INVALID_SOURCE", "Claim lines must match quarantined or missing exceptions on the source receipt", 409);
      }
    }
    if (sourceClaim) throw new SupplierClaimError("INVALID_SOURCE", "Source receipt already has a supplier claim", 409);
    if (warranty && warranty.locationId !== location.id) throw new SupplierClaimError("INVALID_SOURCE", "Customer warranty location does not match", 409);
    if (input.customerWarrantyId && !warranty) throw new SupplierClaimError("INVALID_SOURCE", "Customer warranty not found", 404);
    if (warranty) {
      if (!["APPROVED_REPLACEMENT", "WAITING_STOCK", "READY"].includes(warranty.status)) throw new SupplierClaimError("INVALID_WARRANTY_STATE", "Customer warranty is not ready for supplier recovery", 409);
      if (!warranty.productId || input.lines.some((line) => line.productId !== warranty.productId)) throw new SupplierClaimError("INVALID_SOURCE", "Supplier claim lines must match the linked warranty product", 409);
      const allocated = await tx.supplierClaimLine.aggregate({ where: { claim: { customerWarrantyId: warranty.id } }, _sum: { claimedQuantity: true, quarantinedQuantity: true } });
      const claimedQuantity = input.lines.reduce((sum, line) => sum + line.quarantinedQuantity + line.missingQuantity, 0);
      const quarantinedQuantity = input.lines.reduce((sum, line) => sum + line.quarantinedQuantity, 0);
      if ((allocated._sum.claimedQuantity ?? 0) + claimedQuantity > warranty.claimQuantity) throw new SupplierClaimError("QUANTITY_EXCEEDED", "Supplier claims exceed the linked warranty quantity", 409);
      if ((allocated._sum.quarantinedQuantity ?? 0) + quarantinedQuantity > warranty.receivedQuantity - warranty.returnedQuantity) throw new SupplierClaimError("QUARANTINE_EXCEEDED", "Supplier claims exceed current quarantine received for the linked warranty", 409);
    }
    await assertQuarantineAvailable(tx, location.id, input.lines, input.customerWarrantyId);
    const byId = new Map(products.map((product) => [product.id, product]));
     const created = await tx.supplierClaim.create({ data: { reference: claimReference(), idempotencyKey: input.idempotencyKey, supplierId: supplier.id, supplierName: supplier.name, locationId: location.id, locationCode: location.code, locationName: location.name, sourceReceiptId: input.sourceReceiptId, customerWarrantyId: input.customerWarrantyId, notes: input.notes, targetDate: input.targetDate ? new Date(input.targetDate) : undefined, createdById: actor.userId, lines: { create: input.lines.map((line) => { const product = byId.get(line.productId)!; return { ...line, claimedQuantity: line.quarantinedQuantity + line.missingQuantity, openQuarantinedQuantity: line.quarantinedQuantity, openMissingQuantity: line.missingQuantity, productItemCode: product.itemCode, productName: product.name, unitCost: new Prisma.Decimal(line.unitCost) }; }) } }, include: detailInclude });
     const recipients = await findWorkflowNotificationRecipients(tx, location.id);
     await createNotifications(tx, recipients.map(({ id: userId }) => ({ userId, title: "Supplier claim created", description: `${created.reference} (${location.code}) requires supplier follow-up.`, type: "INFO" as const, relatedType: "SUPPLIER_CLAIM" as const, relatedId: created.id, relatedReference: created.reference })));
     return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await prisma.supplierClaim.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: detailInclude });
    if (existing) { assertLocation(actor, existing.locationId); assertCreateReplay(existing, input); return existing; }
    if (input.sourceReceiptId && await prisma.supplierClaim.findUnique({ where: { sourceReceiptId: input.sourceReceiptId }, select: { id: true } })) throw new SupplierClaimError("INVALID_SOURCE", "Source receipt already has a supplier claim", 409);
    throw new SupplierClaimError("UNIQUE_CONFLICT", "Supplier claim conflicts with an existing record", 409);
  }
}

function movementType(action: SupplierClaimAction): InventoryMovementType | null {
  const types: Partial<Record<SupplierClaimAction, InventoryMovementType>> = { "return-to-supplier": "SUPPLIER_CLAIM_RETURN", "send-repair": "SUPPLIER_CLAIM_REPAIR_SEND", "receive-replacement": "SUPPLIER_CLAIM_REPLACEMENT_RECEIPT", "release-repaired": "SUPPLIER_CLAIM_REPAIRED_RECEIPT", "receive-repaired": "SUPPLIER_CLAIM_REPAIRED_RECEIPT", writeoff: "SUPPLIER_CLAIM_WRITEOFF" };
  return types[action] ?? null;
}

const quarantineActions = new Set<SupplierClaimAction>(["return-to-supplier", "send-repair", "release-repaired", "writeoff"]);
const externalActions = new Set<SupplierClaimAction>(["receive-replacement", "receive-repaired"]);

export async function actOnSupplierClaim(actor: AuthContext, claimId: string, action: SupplierClaimAction, input: SupplierClaimActionInput) {
  assertCapability(actor, supplierClaimActionCapabilities[action]);
  const requestHash = hash({ action, ...input });
  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claimId}))`;
    const claim = await tx.supplierClaim.findUnique({ where: { id: claimId }, include: { lines: true, evidence: { select: { contentType: true } } } });
    if (!claim) throw new SupplierClaimError("NOT_FOUND", "Supplier claim not found", 404);
    if (claim.customerWarrantyId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claim.customerWarrantyId}))`;
    assertLocation(actor, claim.locationId);
    const prior = await tx.supplierClaimAction.findUnique({ where: { claimId_idempotencyKey: { claimId, idempotencyKey: input.idempotencyKey } } });
    if (prior) {
      if (prior.action !== action || prior.requestHash !== requestHash) throw new SupplierClaimError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused for another action", 409);
      return tx.supplierClaim.findUniqueOrThrow({ where: { id: claimId }, include: detailInclude });
    }
    const actionProductIds = input.lines.map((line) => line.productId);
    if (new Set(actionProductIds).size !== actionProductIds.length) throw new SupplierClaimError("INVALID_LINES", "A product may appear only once in an action", 400);
    const claimLinesByProduct = new Map(claim.lines.map((line) => [line.productId, line]));
    if (actionProductIds.some((productId) => !claimLinesByProduct.has(productId))) throw new SupplierClaimError("INVALID_LINES", "Action contains a product outside this claim", 400);
    const inventoryAction = quarantineActions.has(action) || externalActions.has(action);
    if (inventoryAction && input.lines.length === 0) throw new SupplierClaimError("INVALID_LINES", "Select at least one claim line", 400);
    if (!inventoryAction && input.lines.length > 0) throw new SupplierClaimError("INVALID_LINES", "This action does not accept claim lines", 400);
    for (const requested of input.lines) {
      const line = claimLinesByProduct.get(requested.productId)!;
      const openQuantity = quarantineActions.has(action) ? line.openQuarantinedQuantity : line.openMissingQuantity;
      if (openQuantity === 0) throw new SupplierClaimError("INVALID_LINES", "Action line has no applicable open quantity", 400);
      if (requested.quantity > openQuantity) throw new SupplierClaimError("QUANTITY_EXCEEDED", "Action exceeds the applicable open claim quantity", 409);
    }
    if (claim.version !== input.version) throw new SupplierClaimError("VERSION_CONFLICT", "Claim changed; reload and retry", 409);
    if (input.targetDate && new Date(input.targetDate) <= new Date()) throw new SupplierClaimError("INVALID_TARGET", "Follow-up target date must be in the future", 400);
    let status: SupplierClaimStatus = claim.status;
    const lineActions = new Map(input.lines.map((line) => [line.productId, line.quantity]));
    if (action === "submit" && claim.status === "DRAFT") {
      const targetDate = input.targetDate ? new Date(input.targetDate) : claim.targetDate;
      if (!targetDate || targetDate <= new Date()) throw new SupplierClaimError("TARGET_REQUIRED", "Enter a future follow-up target date before submission", 400);
      const requiresPhoto = claim.lines.some((line) => line.reason === "DAMAGE" || line.reason === "DEFECT");
      if (requiresPhoto && !claim.evidence.some((item) => item.contentType.startsWith("image/"))) throw new SupplierClaimError("EVIDENCE_REQUIRED", "Damage and defect claims require photo evidence before submission", 400);
      status = "PENDING";
    }
    else if (action === "wait-replacement" && ["PENDING", "PARTIAL"].includes(claim.status)) status = "WAITING_REPLACEMENT";
    else if (action === "reject" && ["DRAFT", "PENDING", "WAITING_REPLACEMENT", "PARTIAL"].includes(claim.status)) {
      if (claim.lines.some((line) => line.openQuarantinedQuantity > 0)) throw new SupplierClaimError("QUARANTINE_DISPOSITION_REQUIRED", "Return, release, or write off quarantined stock before rejecting the claim", 409);
      await tx.supplierClaimLine.updateMany({ where: { claimId, openMissingQuantity: { gt: 0 } }, data: { openMissingQuantity: 0 } });
      status = "REJECTED";
    }
    else if (action === "cancel" && claim.status === "DRAFT") {
      if (claim.lines.some((line) => line.openQuarantinedQuantity > 0)) throw new SupplierClaimError("QUARANTINE_DISPOSITION_REQUIRED", "Return, release, or write off quarantined stock before cancelling the claim", 409);
      await tx.supplierClaimLine.updateMany({ where: { claimId, openMissingQuantity: { gt: 0 } }, data: { openMissingQuantity: 0 } });
      status = "CANCELLED";
    }
    else if (action === "complete" && ["PENDING", "PARTIAL", "REPLACEMENT_RECEIVED"].includes(claim.status)) {
      if (claim.lines.some((line) => line.openQuarantinedQuantity + line.openMissingQuantity > 0)) throw new SupplierClaimError("UNRESOLVED_LINES", "Resolve every claimed quantity before completion", 409);
      status = "COMPLETED";
    } else if (inventoryAction && ["PENDING", "WAITING_REPLACEMENT", "PARTIAL"].includes(claim.status)) {
      for (const line of claim.lines) {
        const quantity = lineActions.get(line.productId);
        if (!quantity) continue;
        const consumesQuarantine = quarantineActions.has(action);
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
    await tx.supplierClaim.update({ where: { id: claimId }, data: { status, version: { increment: 1 }, ...(input.targetDate ? { targetDate: new Date(input.targetDate) } : {}), ...(action === "submit" ? { submittedAt: new Date() } : {}), ...(action === "complete" ? { completedAt: new Date() } : {}) } });
    await tx.supplierClaimAction.create({ data: { claimId, idempotencyKey: input.idempotencyKey, action, requestHash, fromStatus: claim.status, toStatus: status, detailsJson: input, actorId: actor.userId } });
    return tx.supplierClaim.findUniqueOrThrow({ where: { id: claimId }, include: detailInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const [prior, claim] = await Promise.all([
      prisma.supplierClaimAction.findUnique({ where: { claimId_idempotencyKey: { claimId, idempotencyKey: input.idempotencyKey } } }),
      prisma.supplierClaim.findUnique({ where: { id: claimId }, include: detailInclude }),
    ]);
    if (!claim) throw new SupplierClaimError("NOT_FOUND", "Supplier claim not found", 404);
    assertLocation(actor, claim.locationId);
    if (!prior || prior.action !== action || prior.requestHash !== requestHash) throw new SupplierClaimError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused for another action", 409);
    return claim;
  }
}

export async function addSupplierClaimSettlement(actor: AuthContext, claimId: string, input: SupplierClaimSettlementInput) {
  assertCapability(actor, "supplier-claims:record-monetary-resolution");
  const actionKey = `settlement:${input.idempotencyKey}`;
  const requestHash = hash(normalizedSettlementRequest(input));
  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claimId}))`;
    const claim = await tx.supplierClaim.findUnique({ where: { id: claimId }, include: { lines: true } });
    if (!claim) throw new SupplierClaimError("NOT_FOUND", "Supplier claim not found", 404);
    assertLocation(actor, claim.locationId);

    const [existing, priorAction] = await Promise.all([
      tx.supplierClaimSettlement.findUnique({ where: { claimId_idempotencyKey: { claimId, idempotencyKey: input.idempotencyKey } } }),
      tx.supplierClaimAction.findUnique({ where: { claimId_idempotencyKey: { claimId, idempotencyKey: actionKey } } }),
    ]);
    if (existing || priorAction) {
      if (!existing || !priorAction || priorAction.requestHash !== requestHash) throw new SupplierClaimError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused with a different settlement payload", 409);
      return existing;
    }
    if (!["PENDING", "WAITING_REPLACEMENT", "PARTIAL"].includes(claim.status)) throw new SupplierClaimError("INVALID_STATE", `Cannot record a settlement for a ${claim.status.toLowerCase()} claim`, 409);

    const byProduct = new Map(claim.lines.map((line) => [line.productId, line]));
    for (const requested of input.lines) {
      const line = byProduct.get(requested.productId);
      if (!line) throw new SupplierClaimError("INVALID_LINES", "Settlement contains a product outside this claim", 400);
      if (requested.quantity > line.openMissingQuantity) throw new SupplierClaimError("QUANTITY_EXCEEDED", "Settlement exceeds the outstanding external claim quantity", 409);
      await tx.supplierClaimLine.update({ where: { id: line.id }, data: { openMissingQuantity: { decrement: requested.quantity } } });
    }

    const remaining = await tx.supplierClaimLine.aggregate({ where: { claimId }, _sum: { openQuarantinedQuantity: true, openMissingQuantity: true } });
    const unresolved = (remaining._sum.openQuarantinedQuantity ?? 0) + (remaining._sum.openMissingQuantity ?? 0);
    const status: SupplierClaimStatus = unresolved === 0 ? "PENDING" : "PARTIAL";
    const settlement = await tx.supplierClaimSettlement.create({ data: { claimId, idempotencyKey: input.idempotencyKey, type: input.type, amount: new Prisma.Decimal(input.amount), currency: input.currency.toUpperCase(), reference: input.reference, notes: input.notes, actorId: actor.userId } });
    await tx.supplierClaim.update({ where: { id: claimId }, data: { status, version: { increment: 1 } } });
    await tx.supplierClaimAction.create({ data: { claimId, idempotencyKey: actionKey, action: `settlement:${input.type.toLowerCase()}`, requestHash, fromStatus: claim.status, toStatus: status, detailsJson: input, actorId: actor.userId } });
    return settlement;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const [existing, priorAction, claim] = await Promise.all([
      prisma.supplierClaimSettlement.findUnique({ where: { claimId_idempotencyKey: { claimId, idempotencyKey: input.idempotencyKey } } }),
      prisma.supplierClaimAction.findUnique({ where: { claimId_idempotencyKey: { claimId, idempotencyKey: actionKey } } }),
      prisma.supplierClaim.findUnique({ where: { id: claimId }, select: { locationId: true } }),
    ]);
    if (!claim) throw new SupplierClaimError("NOT_FOUND", "Supplier claim not found", 404);
    assertLocation(actor, claim.locationId);
    if (!existing || !priorAction || priorAction.requestHash !== requestHash) throw new SupplierClaimError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused with a different settlement payload", 409);
    return existing;
  }
}

export async function addSupplierClaimEvidence(actor: AuthContext, claimId: string, evidence: { key: string; contentType: string; fileName: string; size: number }, caption?: string) {
  assertCapability(actor, "supplier-claims:evidence");
  await getSupplierClaim(actor, claimId);
  return prisma.supplierClaimEvidence.create({ data: { claimId, storageKey: evidence.key, contentType: evidence.contentType, fileName: evidence.fileName, size: evidence.size, caption, uploadedById: actor.userId } });
}
