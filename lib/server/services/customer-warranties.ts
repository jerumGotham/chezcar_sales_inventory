import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type CustomerWarrantyStatus } from "@prisma/client";

import type { WarrantyActionInput, WarrantyCreateFields } from "@/lib/contracts/customer-warranties";
import type { AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";

export class CustomerWarrantyError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

type Evidence = { key: string; contentType: string; fileName: string };
type Action = "receive-quarantine" | "approve-repair" | "approve-replacement" | "waiting-stock" | "mark-ready" | "release" | "complete" | "reject" | "cancel";

const detailInclude = {
  events: { orderBy: { occurredAt: "asc" as const }, include: { actor: { select: { name: true } } } },
} satisfies Prisma.CustomerWarrantyInclude;

function scopedWhere(actor: AuthContext) {
  return hasAllLocationAccess(actor) ? {} : { locationId: { in: [...actor.locationIds] } };
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function reference() { return `CW-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function assertLocation(actor: AuthContext, locationId: string) { if (!canAccessLocation(actor, locationId)) throw new CustomerWarrantyError("FORBIDDEN", "Warranty location is outside your assignment", 403); }

export async function listCustomerWarranties(actor: AuthContext, query: { page: number; pageSize: number; status?: CustomerWarrantyStatus }) {
  const where = { ...scopedWhere(actor), ...(query.status ? { status: query.status } : {}) };
  const [total, items] = await Promise.all([
    prisma.customerWarranty.count({ where }),
    prisma.customerWarranty.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
}

export async function getCustomerWarranty(actor: AuthContext, warrantyId: string) {
  const warranty = await prisma.customerWarranty.findFirst({ where: { id: warrantyId, ...scopedWhere(actor) }, include: detailInclude });
  if (!warranty) throw new CustomerWarrantyError("NOT_FOUND", "Warranty not found", 404);
  return warranty;
}

export async function createCustomerWarranty(actor: AuthContext, input: WarrantyCreateFields, evidence: Evidence) {
  assertLocation(actor, input.locationId);
  const existing = await prisma.customerWarranty.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: detailInclude });
  if (existing) {
    assertLocation(actor, existing.locationId);
    return { warranty: existing, evidenceUsed: false };
  }
  const legacy = Boolean(input.legacyReason);
  if (legacy && !actor.isOwner) throw new CustomerWarrantyError("FORBIDDEN", "Only the owner may record a legacy warranty", 403);

  const warranty = await prisma.$transaction(async (tx) => {
    let source: {
      customerId: string | null; customerName: string; saleId: string | null; saleLineId: string | null; saleReference: string | null;
      receiptNumber: string | null; productId: string; productItemCode: string; productName: string; soldQuantity: number | null;
      warrantyDurationMonths: number | null; warrantyExpiresAt: Date | null;
    };
    if (legacy) {
      const product = await tx.product.findUnique({ where: { id: input.productId! }, select: { id: true, itemCode: true, name: true, warrantyDurationMonths: true } });
      if (!product) throw new CustomerWarrantyError("INVALID_INPUT", "Legacy warranty product not found", 400);
      source = { customerId: null, customerName: input.legacyCustomerName!, saleId: null, saleLineId: null, saleReference: input.legacySaleReference ?? null, receiptNumber: null, productId: product.id, productItemCode: product.itemCode, productName: product.name, soldQuantity: null, warrantyDurationMonths: product.warrantyDurationMonths, warrantyExpiresAt: null };
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.saleLineId!}))`;
      const line = await tx.saleLine.findUnique({ where: { id: input.saleLineId! }, include: { product: true, sale: { include: { customer: true, accountingReview: true } } } });
      if (!line || line.sale.status !== "POSTED" || line.sale.accountingReview?.status !== "VERIFIED" || !line.sale.customer) throw new CustomerWarrantyError("INVALID_SALE", "Warranty requires a verified posted customer sale line", 409);
      if (line.sale.locationId !== input.locationId) throw new CustomerWarrantyError("INVALID_LOCATION", "Warranty must be received at the sale location", 409);
      const claimed = await tx.customerWarranty.aggregate({ where: { saleLineId: line.id, status: { notIn: ["REJECTED", "CANCELLED"] } }, _sum: { claimQuantity: true } });
      if ((claimed._sum.claimQuantity ?? 0) + input.claimQuantity > line.quantity) throw new CustomerWarrantyError("QUANTITY_EXCEEDED", "Cumulative warranty quantity exceeds the sold quantity", 409);
      const duration = line.warrantyDurationMonths ?? line.product.warrantyDurationMonths;
      const expiry = line.warrantyExpiresAt ?? (duration === null ? null : new Date(new Date(line.sale.postedAt).setMonth(line.sale.postedAt.getMonth() + duration)));
      if (expiry && expiry < new Date()) throw new CustomerWarrantyError("WARRANTY_EXPIRED", "Product warranty has expired", 409);
      source = { customerId: line.sale.customer.id, customerName: line.sale.customer.name, saleId: line.sale.id, saleLineId: line.id, saleReference: line.sale.reference, receiptNumber: line.sale.manualReceiptNumber, productId: line.productId, productItemCode: line.productItemCode, productName: line.productName, soldQuantity: line.quantity, warrantyDurationMonths: duration, warrantyExpiresAt: expiry };
    }
    const location = await tx.location.findUnique({ where: { id: input.locationId }, select: { code: true, name: true, isActive: true } });
    if (!location?.isActive) throw new CustomerWarrantyError("INVALID_LOCATION", "Active warranty location not found", 400);
    const created = await tx.customerWarranty.create({ data: { reference: reference(), idempotencyKey: input.idempotencyKey, locationId: input.locationId, ...source, claimQuantity: input.claimQuantity, concern: input.concern, isLegacy: legacy, legacyCustomerName: input.legacyCustomerName, legacySaleReference: input.legacySaleReference, legacyReason: input.legacyReason, locationCode: location.code, locationName: location.name, intakePhotoKey: evidence.key, intakePhotoType: evidence.contentType, intakePhotoName: evidence.fileName, createdById: actor.userId } });
    await tx.customerWarrantyEvent.create({ data: { warrantyId: created.id, type: "CREATED", toStatus: "ASSESSMENT", actorId: actor.userId, detailsJson: { claimQuantity: input.claimQuantity } } });
    return tx.customerWarranty.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { warranty, evidenceUsed: true };
}

export async function actOnCustomerWarranty(actor: AuthContext, warrantyId: string, action: Action, input: WarrantyActionInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${warrantyId}))`;
    const warranty = await tx.customerWarranty.findUnique({ where: { id: warrantyId } });
    if (!warranty) throw new CustomerWarrantyError("NOT_FOUND", "Warranty not found", 404);
    assertLocation(actor, warranty.locationId);
    const requestHash = hash({ action, ...input });
    const prior = await tx.customerWarrantyAction.findUnique({ where: { warrantyId_idempotencyKey: { warrantyId, idempotencyKey: input.idempotencyKey } } });
    if (prior) {
      if (prior.action !== action || prior.requestHash !== requestHash) throw new CustomerWarrantyError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different request", 409);
      return tx.customerWarranty.findUniqueOrThrow({ where: { id: warrantyId }, include: detailInclude });
    }
    if (warranty.version !== input.version) throw new CustomerWarrantyError("VERSION_CONFLICT", "Warranty changed; reload and retry", 409);
    let toStatus: CustomerWarrantyStatus;
    const data: Prisma.CustomerWarrantyUpdateInput = { version: { increment: 1 } };
    if (action === "receive-quarantine" && warranty.status === "ASSESSMENT") {
      const quantity = input.quantity ?? warranty.claimQuantity;
      if (warranty.receivedQuantity + quantity > warranty.claimQuantity) throw new CustomerWarrantyError("QUANTITY_EXCEEDED", "Received quantity exceeds this warranty claim", 409);
      await tx.inventoryBalance.upsert({ where: { locationId_productId: { locationId: warranty.locationId, productId: warranty.productId! } }, create: { locationId: warranty.locationId, productId: warranty.productId!, onHand: quantity, quarantined: quantity }, update: { onHand: { increment: quantity }, quarantined: { increment: quantity }, version: { increment: 1 } } });
      await tx.inventoryMovement.create({ data: { warrantyId, productId: warranty.productId!, locationId: warranty.locationId, quantity, type: "WARRANTY_RECEIPT", actorId: actor.userId, reference: warranty.reference, remarks: "Customer warranty item received into quarantine" } });
      toStatus = warranty.status; data.receivedQuantity = { increment: quantity }; data.receivedAt = new Date();
    } else if (action === "approve-repair" && warranty.status === "ASSESSMENT") { toStatus = "APPROVED_REPAIR"; data.resolution = "REPAIR"; data.assessmentNotes = input.notes; if (input.targetDate) data.targetDate = new Date(input.targetDate); }
    else if (action === "approve-replacement" && warranty.status === "ASSESSMENT") {
      const replacementId = input.replacementProductId ?? warranty.productId;
      if (!replacementId) throw new CustomerWarrantyError("INVALID_INPUT", "Replacement product is required", 400);
      if (replacementId !== warranty.productId && !input.replacementReason) throw new CustomerWarrantyError("INVALID_INPUT", "Equivalent replacement requires a reason", 400);
      const product = await tx.product.findUnique({ where: { id: replacementId }, select: { id: true, itemCode: true, name: true, status: true } });
      if (!product || product.status !== "ACTIVE") throw new CustomerWarrantyError("INVALID_INPUT", "Active replacement product not found", 400);
      toStatus = "APPROVED_REPLACEMENT"; data.resolution = "REPLACEMENT"; data.assessmentNotes = input.notes; if (input.targetDate) data.targetDate = new Date(input.targetDate); data.replacementProduct = { connect: { id: product.id } }; data.replacementReason = input.replacementReason; data.replacementItemCode = product.itemCode; data.replacementProductName = product.name;
    } else if (action === "waiting-stock" && warranty.status === "APPROVED_REPLACEMENT") toStatus = "WAITING_STOCK";
    else if (action === "mark-ready" && ["APPROVED_REPAIR", "APPROVED_REPLACEMENT", "WAITING_STOCK"].includes(warranty.status)) { toStatus = "READY"; data.readyAt = new Date(); }
    else if (action === "release" && warranty.status === "READY") {
      toStatus = "RELEASED"; data.releasedAt = new Date();
      const releaseProductId = warranty.resolution === "REPLACEMENT" ? warranty.replacementProductId : warranty.productId;
      if (!releaseProductId) throw new CustomerWarrantyError("INVALID_STATE", "Release product is missing", 409);
      const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: warranty.locationId, productId: releaseProductId } } });
      const repair = warranty.resolution === "REPAIR";
      const available = balance ? balance.onHand - balance.reserved - balance.quarantined : 0;
      if (!balance || (repair ? balance.quarantined < warranty.claimQuantity || warranty.receivedQuantity < warranty.claimQuantity : available < warranty.claimQuantity)) throw new CustomerWarrantyError("INSUFFICIENT_STOCK", "Insufficient stock for warranty release", 409);
      const updated = await tx.inventoryBalance.updateMany({ where: repair
        ? { id: balance.id, version: balance.version, onHand: { gte: warranty.claimQuantity }, quarantined: { gte: warranty.claimQuantity } }
        : { id: balance.id, version: balance.version, onHand: { gte: balance.reserved + balance.quarantined + warranty.claimQuantity } }, data: { onHand: { decrement: warranty.claimQuantity }, ...(repair ? { quarantined: { decrement: warranty.claimQuantity } } : {}), version: { increment: 1 } } });
      if (updated.count !== 1) throw new CustomerWarrantyError("INVENTORY_CONFLICT", "Inventory changed before warranty release; reload and retry", 409);
      await tx.inventoryMovement.create({ data: { warrantyId, productId: releaseProductId, locationId: warranty.locationId, quantity: -warranty.claimQuantity, type: "WARRANTY_RELEASE", actorId: actor.userId, reference: warranty.reference, remarks: repair ? "Repaired customer item released" : "Warranty replacement released" } });
    } else if (action === "complete" && warranty.status === "RELEASED") { toStatus = "COMPLETED"; data.completedAt = new Date(); }
    else if (action === "reject" && warranty.status === "ASSESSMENT") { toStatus = "REJECTED"; data.assessmentNotes = input.notes; }
    else if (action === "cancel" && warranty.status === "ASSESSMENT") toStatus = "CANCELLED";
    else throw new CustomerWarrantyError("INVALID_STATE", `Cannot ${action} a ${warranty.status.toLowerCase()} warranty`, 409);
    data.status = toStatus;
    await tx.customerWarranty.update({ where: { id: warrantyId }, data });
    await tx.customerWarrantyAction.create({ data: { warrantyId, idempotencyKey: input.idempotencyKey, action, requestHash, actorId: actor.userId } });
    await tx.customerWarrantyEvent.create({ data: { warrantyId, type: action.toUpperCase().replaceAll("-", "_"), fromStatus: warranty.status, toStatus, actorId: actor.userId, detailsJson: input.notes ? { notes: input.notes } : undefined } });
    return tx.customerWarranty.findUniqueOrThrow({ where: { id: warrantyId }, include: detailInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
