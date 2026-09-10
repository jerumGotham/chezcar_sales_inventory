import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type CustomerWarrantyResolution, type CustomerWarrantyStatus } from "@prisma/client";

import type { WarrantyActionInput, WarrantyCreateFields } from "@/lib/contracts/customer-warranties";
import type { AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";
import { hashStoredWarrantyEvidence } from "@/lib/server/services/warranty-evidence";
import { calculateWarrantyQuarantine } from "@/lib/server/services/warranty-quarantine";
import { createNotifications, findWorkflowNotificationRecipients } from "@/lib/server/services/notifications";

export class CustomerWarrantyError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

type Evidence = { key: string; contentHash: string; contentType: string; fileName: string };
type Action = "receive-quarantine" | "return-to-customer" | "approve-repair" | "approve-replacement" | "waiting-stock" | "mark-ready" | "release" | "complete" | "reject" | "cancel";
type ReplacementProduct = { id: string; itemCode: string; name: string };

const detailInclude = {
  events: { orderBy: { occurredAt: "asc" as const }, include: { actor: { select: { name: true } } } },
} satisfies Prisma.CustomerWarrantyInclude;

function scopedWhere(actor: AuthContext) {
  return hasAllLocationAccess(actor) ? {} : { locationId: { in: [...actor.locationIds] } };
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function createRequestHash(actor: AuthContext, input: WarrantyCreateFields, evidence: Evidence | null) {
  return hash({
    actorId: actor.userId,
    fields: {
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
      saleLineId: input.saleLineId ?? null,
      productId: input.productId ?? null,
      claimQuantity: input.claimQuantity,
      concern: input.concern,
      warrantyBasisMonths: input.warrantyBasisMonths ?? null,
      warrantyBasisReason: input.warrantyBasisReason ?? null,
      quantityOverrideReason: input.quantityOverrideReason ?? null,
      legacyCustomerName: input.legacyCustomerName ?? null,
      legacySaleReference: input.legacySaleReference ?? null,
      legacyReason: input.legacyReason ?? null,
    },
    evidence: evidence ? { contentHash: evidence.contentHash, contentType: evidence.contentType, fileName: evidence.fileName } : null,
  });
}
function reference() { return `CW-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`; }
function assertLocation(actor: AuthContext, locationId: string) { if (!canAccessLocation(actor, locationId)) throw new CustomerWarrantyError("FORBIDDEN", "Warranty location is outside your assignment", 403); }
function isUniqueConstraintError(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
async function warrantyQuarantine(tx: Prisma.TransactionClient, warranty: { id: string; productId: string | null; receivedQuantity: number; returnedQuantity: number; resolution: CustomerWarrantyResolution | null; status: CustomerWarrantyStatus }) {
  if (!warranty.productId || warranty.receivedQuantity === warranty.returnedQuantity) return { unassignedQuantity: 0, unresolvedQuantity: 0 };
  const linked = await tx.supplierClaimLine.aggregate({
    where: { productId: warranty.productId, claim: { customerWarrantyId: warranty.id } },
    _sum: { quarantinedQuantity: true, openQuarantinedQuantity: true },
  });
  return calculateWarrantyQuarantine(warranty, linked._sum.quarantinedQuantity ?? 0, linked._sum.openQuarantinedQuantity ?? 0);
}

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
  const replacementProducts = actor.isOwner ? await prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, itemCode: true, name: true }, orderBy: { itemCode: "asc" } }) : [];
  return { ...warranty, replacementProducts };
}

export async function createCustomerWarranty(actor: AuthContext, input: WarrantyCreateFields, evidence: Evidence | null = null) {
  assertLocation(actor, input.locationId);
  const legacy = Boolean(input.legacyReason);
  if (legacy && !actor.isOwner) throw new CustomerWarrantyError("FORBIDDEN", "Only the owner may create a claim without a linked system sale", 403);
  const requestHash = createRequestHash(actor, input, evidence);

  try {
    const warranty = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))`;
    const existing = await tx.customerWarranty.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: detailInclude });
    if (existing) {
      assertLocation(actor, existing.locationId);
      if (existing.requestHash !== null) {
        if (existing.requestHash !== requestHash) throw new CustomerWarrantyError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different warranty request", 409);
      } else {
        const createdDetails = existing.events.find((event) => event.type === "CREATED")?.detailsJson;
        const details: Record<string, unknown> = createdDetails && typeof createdDetails === "object" && !Array.isArray(createdDetails) ? createdDetails : {};
        const storedContentHash = existing.intakePhotoKey ? await hashStoredWarrantyEvidence(existing.intakePhotoKey).catch(() => null) : null;
        const sameHistoricalRequest = existing.createdById === actor.userId
          && existing.locationId === input.locationId
          && existing.saleLineId === (input.saleLineId ?? null)
          && existing.productId === (input.productId ?? existing.productId)
          && existing.claimQuantity === input.claimQuantity
          && existing.concern === input.concern
          && existing.legacyCustomerName === (input.legacyCustomerName ?? null)
          && existing.legacySaleReference === (input.legacySaleReference ?? null)
          && existing.legacyReason === (input.legacyReason ?? null)
          && existing.warrantyDurationMonths === (input.warrantyBasisMonths ?? existing.warrantyDurationMonths)
          && (details.warrantyBasisReason ?? null) === (input.warrantyBasisReason ?? null)
          && (details.quantityOverrideReason ?? null) === (input.quantityOverrideReason ?? null)
          && Boolean(existing.intakePhotoKey) === Boolean(evidence)
          && existing.intakePhotoType === (evidence?.contentType ?? null)
          && existing.intakePhotoName === (evidence?.fileName ?? null)
          && storedContentHash === (evidence?.contentHash ?? null);
        if (!sameHistoricalRequest) throw new CustomerWarrantyError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different warranty request", 409);
      }
      return { record: { ...existing, replacementProducts: [] as ReplacementProduct[] }, evidenceUsed: false, created: false };
    }
    let source: {
      customerId: string | null; customerName: string; saleId: string | null; saleLineId: string | null; saleReference: string | null;
      receiptNumber: string | null; productId: string; productItemCode: string; productName: string; soldQuantity: number | null;
      warrantyDurationMonths: number | null; warrantyExpiresAt: Date | null;
    };
    if (legacy) {
      const product = await tx.product.findUnique({ where: { id: input.productId! }, select: { id: true, itemCode: true, name: true } });
      if (!product) throw new CustomerWarrantyError("INVALID_INPUT", "The selected product was not found", 400);
      if (!input.warrantyBasisMonths || !input.warrantyBasisReason) throw new CustomerWarrantyError("WARRANTY_BASIS_REQUIRED", "Enter the warranty period and explain why it applies to this claim", 400);
      source = { customerId: null, customerName: input.legacyCustomerName!, saleId: null, saleLineId: null, saleReference: input.legacySaleReference ?? null, receiptNumber: null, productId: product.id, productItemCode: product.itemCode, productName: product.name, soldQuantity: null, warrantyDurationMonths: input.warrantyBasisMonths, warrantyExpiresAt: null };
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.saleLineId!}))`;
      const line = await tx.saleLine.findUnique({ where: { id: input.saleLineId! }, include: { product: true, sale: { include: { customer: true, accountingReview: true } } } });
      if (!line || line.sale.status !== "POSTED" || line.sale.accountingReview?.status !== "VERIFIED" || !line.sale.customer) throw new CustomerWarrantyError("INVALID_SALE", "Select an item from a posted customer sale verified by Accounting", 409);
      if (line.sale.locationId !== input.locationId) throw new CustomerWarrantyError("INVALID_LOCATION", "The claim location does not match the original sale location. Reload the form and select the purchased item again; its sale location must be used for this claim", 409);
      const claimed = await tx.customerWarranty.aggregate({ where: { saleLineId: line.id, status: { notIn: ["REJECTED", "CANCELLED"] } }, _sum: { claimQuantity: true } });
      const quantityExceeded = (claimed._sum.claimQuantity ?? 0) + input.claimQuantity > line.quantity;
      if (quantityExceeded && (!actor.isOwner || !input.quantityOverrideReason)) throw new CustomerWarrantyError("QUANTITY_EXCEEDED", actor.isOwner ? "This claim plus earlier claims exceeds the purchased quantity. Enter a reason to allow the extra quantity" : "This claim plus earlier claims exceeds the purchased quantity. Ask the owner to record the exception", 409);
      if (line.warrantyDurationMonths === null && (!actor.isOwner || !input.warrantyBasisMonths || !input.warrantyBasisReason)) throw new CustomerWarrantyError("WARRANTY_BASIS_REQUIRED", actor.isOwner ? "No warranty period was saved with the sale. Enter the period for this claim and explain why it applies" : "No warranty period was saved with the sale. Ask the owner to create the claim and explain the coverage", actor.isOwner ? 400 : 403);
      const duration = line.warrantyDurationMonths ?? input.warrantyBasisMonths!;
      const expiry = line.warrantyExpiresAt ?? new Date(new Date(line.sale.postedAt).setMonth(line.sale.postedAt.getMonth() + duration));
      if (expiry && expiry < new Date()) throw new CustomerWarrantyError("WARRANTY_EXPIRED", "Product warranty has expired", 409);
      source = { customerId: line.sale.customer.id, customerName: line.sale.customer.name, saleId: line.sale.id, saleLineId: line.id, saleReference: line.sale.reference, receiptNumber: line.sale.manualReceiptNumber, productId: line.productId, productItemCode: line.productItemCode, productName: line.productName, soldQuantity: line.quantity, warrantyDurationMonths: duration, warrantyExpiresAt: expiry };
    }
    const location = await tx.location.findUnique({ where: { id: input.locationId }, select: { code: true, name: true, isActive: true } });
    if (!location?.isActive) throw new CustomerWarrantyError("INVALID_LOCATION", "Active warranty location not found", 400);
    const created = await tx.customerWarranty.create({ data: { reference: reference(), idempotencyKey: input.idempotencyKey, requestHash, locationId: input.locationId, ...source, claimQuantity: input.claimQuantity, concern: input.concern, isLegacy: legacy, legacyCustomerName: input.legacyCustomerName, legacySaleReference: input.legacySaleReference, legacyReason: input.legacyReason, locationCode: location.code, locationName: location.name, intakePhotoKey: evidence?.key ?? null, intakePhotoType: evidence?.contentType ?? null, intakePhotoName: evidence?.fileName ?? null, createdById: actor.userId } });
    await tx.customerWarrantyEvent.create({ data: { warrantyId: created.id, type: "CREATED", toStatus: "ASSESSMENT", actorId: actor.userId, detailsJson: { claimQuantity: input.claimQuantity, ...(input.warrantyBasisReason ? { warrantyBasisMonths: input.warrantyBasisMonths, warrantyBasisReason: input.warrantyBasisReason } : {}), ...(input.quantityOverrideReason ? { quantityOverrideReason: input.quantityOverrideReason } : {}) } } });
     const recipients = await findWorkflowNotificationRecipients(tx, input.locationId);
     await createNotifications(tx, recipients.map(({ id: userId }) => ({ userId, title: "Customer warranty created", description: `${created.reference} (${location.code}) requires assessment.`, type: "INFO" as const, relatedType: "CUSTOMER_WARRANTY" as const, relatedId: created.id, relatedReference: created.reference })));
     const result = await tx.customerWarranty.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
    return { record: { ...result, replacementProducts: [] as ReplacementProduct[] }, evidenceUsed: Boolean(evidence), created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return { warranty: warranty.record, evidenceUsed: warranty.evidenceUsed, created: warranty.created };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await prisma.customerWarranty.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: detailInclude });
    if (!existing) throw new CustomerWarrantyError("UNIQUE_CONFLICT", "Warranty conflicts with an existing record", 409);
    assertLocation(actor, existing.locationId);
    if (existing.requestHash !== requestHash) throw new CustomerWarrantyError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different warranty request", 409);
    return { warranty: { ...existing, replacementProducts: [] as ReplacementProduct[] }, evidenceUsed: false, created: false };
  }
}

export async function actOnCustomerWarranty(actor: AuthContext, warrantyId: string, action: Action, input: WarrantyActionInput) {
  const requestHash = hash({ action, ...input });
  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${warrantyId}))`;
    const warranty = await tx.customerWarranty.findUnique({ where: { id: warrantyId } });
    if (!warranty) throw new CustomerWarrantyError("NOT_FOUND", "Warranty not found", 404);
    assertLocation(actor, warranty.locationId);
    const prior = await tx.customerWarrantyAction.findUnique({ where: { warrantyId_idempotencyKey: { warrantyId, idempotencyKey: input.idempotencyKey } } });
    if (prior) {
      if (prior.action !== action || prior.requestHash !== requestHash) throw new CustomerWarrantyError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different request", 409);
     const result = await tx.customerWarranty.findUniqueOrThrow({ where: { id: warrantyId }, include: detailInclude });
      const replacementProducts = actor.isOwner ? await tx.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, itemCode: true, name: true }, orderBy: { itemCode: "asc" } }) : [];
      return { ...result, replacementProducts };
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
    } else if (action === "return-to-customer" && warranty.status === "ASSESSMENT") {
      const quantity = input.quantity;
      if (!quantity || !input.notes?.trim()) throw new CustomerWarrantyError("INVALID_INPUT", "Return quantity and reason are required", 400);
      if (!warranty.productId) throw new CustomerWarrantyError("INVALID_STATE", "Warranty product is missing", 409);
      const custody = await warrantyQuarantine(tx, warranty);
      if (quantity > custody.unassignedQuantity) throw new CustomerWarrantyError("QUARANTINE_EXCEEDED", "Return exceeds warranty quarantine not allocated to a Supplier Claim", 409);
      const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: warranty.locationId, productId: warranty.productId } } });
      if (!balance) throw new CustomerWarrantyError("INSUFFICIENT_STOCK", "Warranty quarantine balance is missing", 409);
      const updated = await tx.inventoryBalance.updateMany({ where: { id: balance.id, version: balance.version, onHand: { gte: quantity }, quarantined: { gte: quantity } }, data: { onHand: { decrement: quantity }, quarantined: { decrement: quantity }, version: { increment: 1 } } });
      if (updated.count !== 1) throw new CustomerWarrantyError("INVENTORY_CONFLICT", "Warranty quarantine changed; reload and retry", 409);
      await tx.inventoryMovement.create({ data: { warrantyId, productId: warranty.productId, locationId: warranty.locationId, quantity: -quantity, type: "WARRANTY_RELEASE", actorId: actor.userId, reference: warranty.reference, remarks: "Unrepaired warranty item returned to customer" } });
      toStatus = warranty.status; data.returnedQuantity = { increment: quantity };
    } else if (action === "approve-repair" && warranty.status === "ASSESSMENT") { if (warranty.returnedQuantity > 0) throw new CustomerWarrantyError("RETURN_ALREADY_STARTED", "A warranty cannot be approved after intake stock has been returned to the customer", 409); if (!input.targetDate || new Date(input.targetDate) <= new Date()) throw new CustomerWarrantyError("TARGET_DATE_REQUIRED", "Approval requires a future operational target date", 400); toStatus = "APPROVED_REPAIR"; data.resolution = "REPAIR"; data.assessmentNotes = input.notes; data.targetDate = new Date(input.targetDate); }
    else if (action === "approve-replacement" && warranty.status === "ASSESSMENT") {
      if (warranty.returnedQuantity > 0) throw new CustomerWarrantyError("RETURN_ALREADY_STARTED", "A warranty cannot be approved after intake stock has been returned to the customer", 409);
      if (!input.targetDate || new Date(input.targetDate) <= new Date()) throw new CustomerWarrantyError("TARGET_DATE_REQUIRED", "Approval requires a future operational target date", 400);
      const replacementId = input.replacementProductId ?? warranty.productId;
      if (!replacementId) throw new CustomerWarrantyError("INVALID_INPUT", "Replacement product is required", 400);
      if (replacementId !== warranty.productId && (!actor.isOwner || !input.replacementReason)) throw new CustomerWarrantyError("EQUIVALENT_REPLACEMENT_FORBIDDEN", actor.isOwner ? "Equivalent replacement requires an Admin reason" : "Only Admin may approve an equivalent replacement", actor.isOwner ? 400 : 403);
      const product = await tx.product.findUnique({ where: { id: replacementId }, select: { id: true, itemCode: true, name: true, status: true } });
      if (!product || product.status !== "ACTIVE") throw new CustomerWarrantyError("INVALID_INPUT", "Active replacement product not found", 400);
      toStatus = "APPROVED_REPLACEMENT"; data.resolution = "REPLACEMENT"; data.assessmentNotes = input.notes; data.targetDate = new Date(input.targetDate); data.replacementProduct = { connect: { id: product.id } }; data.replacementReason = input.replacementReason; data.replacementItemCode = product.itemCode; data.replacementProductName = product.name;
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
    else if (action === "reject" && warranty.status === "ASSESSMENT") { if ((await warrantyQuarantine(tx, warranty)).unresolvedQuantity > 0) throw new CustomerWarrantyError("QUARANTINE_UNRESOLVED", "Current warranty quarantine must be physically resolved before rejection", 409); toStatus = "REJECTED"; data.assessmentNotes = input.notes; }
    else if (action === "cancel" && warranty.status === "ASSESSMENT") { if ((await warrantyQuarantine(tx, warranty)).unresolvedQuantity > 0) throw new CustomerWarrantyError("QUARANTINE_UNRESOLVED", "Current warranty quarantine must be physically resolved before cancellation", 409); toStatus = "CANCELLED"; }
    else throw new CustomerWarrantyError("INVALID_STATE", `Cannot ${action} a ${warranty.status.toLowerCase()} warranty`, 409);
    data.status = toStatus;
    await tx.customerWarranty.update({ where: { id: warrantyId }, data });
    await tx.customerWarrantyAction.create({ data: { warrantyId, idempotencyKey: input.idempotencyKey, action, requestHash, actorId: actor.userId } });
     await tx.customerWarrantyEvent.create({ data: { warrantyId, type: action.toUpperCase().replaceAll("-", "_"), fromStatus: warranty.status, toStatus, actorId: actor.userId, detailsJson: input.notes || input.quantity || input.targetDate || input.replacementReason ? { ...(input.notes ? { notes: input.notes } : {}), ...(input.quantity ? { quantity: input.quantity } : {}), ...(input.targetDate ? { targetDate: input.targetDate } : {}), ...(input.replacementProductId ? { replacementProductId: input.replacementProductId } : {}), ...(input.replacementReason ? { replacementReason: input.replacementReason } : {}) } : undefined } });
     const recipients = await findWorkflowNotificationRecipients(tx, warranty.locationId);
     await createNotifications(tx, recipients.map(({ id: userId }) => ({ userId, title: `Customer warranty ${action.replaceAll("-", " ")}`, description: `${warranty.reference} (${warranty.locationName}) was updated.`, type: ["reject", "cancel"].includes(action) ? "WARNING" as const : ["complete", "release"].includes(action) ? "SUCCESS" as const : "INFO" as const, relatedType: "CUSTOMER_WARRANTY" as const, relatedId: warranty.id, relatedReference: warranty.reference })));
    const result = await tx.customerWarranty.findUniqueOrThrow({ where: { id: warrantyId }, include: detailInclude });
    const replacementProducts = actor.isOwner ? await tx.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, itemCode: true, name: true }, orderBy: { itemCode: "asc" } }) : [];
    return { ...result, replacementProducts };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const [warranty, prior] = await Promise.all([
      prisma.customerWarranty.findUnique({ where: { id: warrantyId }, include: detailInclude }),
      prisma.customerWarrantyAction.findUnique({ where: { warrantyId_idempotencyKey: { warrantyId, idempotencyKey: input.idempotencyKey } } }),
    ]);
    if (!warranty) throw new CustomerWarrantyError("NOT_FOUND", "Warranty not found", 404);
    assertLocation(actor, warranty.locationId);
    if (!prior || prior.action !== action || prior.requestHash !== requestHash) throw new CustomerWarrantyError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for a different request", 409);
    const replacementProducts = actor.isOwner ? await prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, itemCode: true, name: true }, orderBy: { itemCode: "asc" } }) : [];
    return { ...warranty, replacementProducts };
  }
}
