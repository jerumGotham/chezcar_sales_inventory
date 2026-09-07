import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type BackjobStatus } from "@prisma/client";

import type {
  CompleteBackjobInput,
  CoverageBackjobInput,
  CreateBackjobInput,
  IssueBackjobPartInput,
  PlanBackjobPartsInput,
  ReconcileBackjobPartInput,
  ScheduleBackjobInput,
} from "@/lib/contracts/backjobs";
import type { AuthContext } from "@/lib/server/authorization";
import { assertCapability } from "@/lib/server/authorization";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";

export type BackjobCapability = "backjobs:view" | "backjobs:create" | "backjobs:update" | "backjobs:schedule" | "backjobs:complete" | "backjobs:parts:issue" | "backjobs:parts:return" | "backjobs:print";

export class BackjobError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "BackjobError";
  }
}

const BACKJOB_INCLUDE = {
  parts: {
    include: {
      product: { select: { id: true } },
      movements: { select: { id: true, type: true, quantity: true, occurredAt: true }, orderBy: { occurredAt: "asc" as const } },
    },
    orderBy: { productItemCode: "asc" as const },
  },
  events: { include: { actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" as const } },
  schedules: { include: { actor: { select: { name: true } } }, orderBy: { recordedAt: "desc" as const } },
  attachments: { select: { id: true, fileName: true, contentType: true, caption: true, uploadedAt: true }, orderBy: { uploadedAt: "desc" as const } },
} satisfies Prisma.BackjobInclude;

type BackjobRecord = Prisma.BackjobGetPayload<{ include: typeof BACKJOB_INCLUDE }>;

export async function assertBackjobCapability(actor: AuthContext, capability: BackjobCapability) {
  assertCapability(actor, capability);
}

function scope(actor: AuthContext): Prisma.BackjobWhereInput {
  return hasAllLocationAccess(actor) ? {} : { locationId: { in: [...actor.locationIds] } };
}

function assertScope(actor: AuthContext, locationId: string) {
  if (!canAccessLocation(actor, locationId)) throw new BackjobError("FORBIDDEN", "Backjob is outside your assigned locations", 403);
}

function serialize(row: BackjobRecord) {
  return {
    ...row,
    chargeableAmount: Number(row.chargeableAmount),
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    events: row.events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
    schedules: row.schedules.map((item) => ({ ...item, previousSchedule: item.previousSchedule?.toISOString() ?? null, newSchedule: item.newSchedule.toISOString(), recordedAt: item.recordedAt.toISOString() })),
    attachments: row.attachments.map((item) => ({ ...item, uploadedAt: item.uploadedAt.toISOString() })),
    parts: row.parts.map((part) => ({ ...part, movements: part.movements.map((movement) => ({ ...movement, occurredAt: movement.occurredAt.toISOString() })) })),
  };
}

async function lockBackjob(tx: Prisma.TransactionClient, actor: AuthContext, id: string, version: number) {
  await tx.$queryRaw`SELECT id FROM "Backjob" WHERE id = ${id} FOR UPDATE`;
  const row = await tx.backjob.findUnique({ where: { id }, include: BACKJOB_INCLUDE });
  if (!row) throw new BackjobError("NOT_FOUND", "Backjob not found", 404);
  assertScope(actor, row.locationId);
  if (row.version !== version) throw new BackjobError("STALE_VERSION", "Backjob changed; reload before retrying");
  return row;
}

async function event(tx: Prisma.TransactionClient, backjobId: string, actorId: string, type: string, fromStatus?: BackjobStatus, toStatus?: BackjobStatus, reason?: string, detailsJson?: Prisma.InputJsonValue) {
  await tx.backjobEvent.create({ data: { backjobId, actorId, type, fromStatus, toStatus, reason, detailsJson } });
}

export async function listBackjobs(actor: AuthContext, query: { page: number; pageSize: number; search: string; status: string }) {
  await assertBackjobCapability(actor, "backjobs:view");
  const where: Prisma.BackjobWhereInput = {
    ...scope(actor),
    ...(query.status === "ALL" ? {} : { status: query.status as BackjobStatus }),
    ...(query.search ? { OR: [
      { reference: { contains: query.search, mode: "insensitive" } },
      { customerName: { contains: query.search, mode: "insensitive" } },
      { originalReceiptNumber: { contains: query.search, mode: "insensitive" } },
      { affectedProductItemCode: { contains: query.search, mode: "insensitive" } },
    ] } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.backjob.count({ where }),
    prisma.backjob.findMany({ where, include: BACKJOB_INCLUDE, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { data: rows.map(serialize), meta: { ...query, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
}

export async function getBackjob(actor: AuthContext, id: string) {
  await assertBackjobCapability(actor, "backjobs:view");
  const row = await prisma.backjob.findFirst({ where: { id, ...scope(actor) }, include: BACKJOB_INCLUDE });
  if (!row) throw new BackjobError("NOT_FOUND", "Backjob not found", 404);
  const [installers, balances, chargeSales] = await Promise.all([
    prisma.personnel.findMany({ where: { locationId: row.locationId, status: "ACTIVE", type: { in: ["INSTALLER", "BOTH"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.inventoryBalance.findMany({ where: { locationId: row.locationId, product: { status: "ACTIVE" } }, select: { version: true, onHand: true, reserved: true, quarantined: true, product: { select: { id: true, itemCode: true, name: true } } }, orderBy: { product: { itemCode: "asc" } } }),
    prisma.sale.findMany({ where: { locationId: row.locationId, customerId: row.customerId, status: "POSTED" }, select: { id: true, reference: true, manualReceiptNumber: true, totalAmount: true }, orderBy: { postedAt: "desc" }, take: 50 }),
  ]);
  return { ...serialize(row), options: { installers, products: balances.map((balance) => ({ ...balance.product, balanceVersion: balance.version, availableQuantity: balance.onHand - balance.reserved - balance.quarantined })), chargeSales: chargeSales.map((sale) => ({ ...sale, totalAmount: Number(sale.totalAmount) })) } };
}

export async function listBackjobOptions(actor: AuthContext) {
  await assertBackjobCapability(actor, "backjobs:create");
  const locationWhere = hasAllLocationAccess(actor) ? {} : { id: { in: [...actor.locationIds] } };
  const [locations, customers, sales] = await Promise.all([
    prisma.location.findMany({ where: { ...locationWhere, type: "BRANCH", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.customer.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, mobile: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.sale.findMany({ where: { locationId: hasAllLocationAccess(actor) ? undefined : { in: [...actor.locationIds] }, status: "POSTED", customerId: { not: null } }, select: { id: true, reference: true, manualReceiptNumber: true, customerId: true, locationId: true, customer: { select: { name: true } }, lines: { select: { id: true, productId: true, productItemCode: true, productName: true } } }, orderBy: { postedAt: "desc" }, take: 250 }),
  ]);
  return { locations, customers, sales: sales.map((sale) => ({ id: sale.id, reference: sale.reference, receiptNumber: sale.manualReceiptNumber, customerId: sale.customerId!, customerName: sale.customer!.name, locationId: sale.locationId, lines: sale.lines.map((line) => ({ id: line.id, productId: line.productId, itemCode: line.productItemCode, name: line.productName })) })) };
}

export async function createBackjob(actor: AuthContext, input: CreateBackjobInput) {
  await assertBackjobCapability(actor, "backjobs:create");
  if (input.isLegacy && !actor.isOwner) throw new BackjobError("FORBIDDEN", "Only the owner can create legacy Backjobs", 403);
  return prisma.$transaction(async (tx) => {
    let data: Prisma.BackjobUncheckedCreateInput;
    if (!input.isLegacy) {
      const sale = await tx.sale.findFirst({ where: { id: input.saleId, status: "POSTED", customerId: { not: null }, lines: { some: { id: input.saleLineId } } }, include: { location: true, customer: true, lines: { where: { id: input.saleLineId } } } });
      if (!sale || !sale.customer || sale.lines.length !== 1) throw new BackjobError("INVALID_ORIGINAL_SALE", "Select a posted sale line with a customer", 400);
      assertScope(actor, sale.locationId);
      const line = sale.lines[0];
      data = { reference: `BJ-${randomUUID()}`, locationId: sale.locationId, customerId: sale.customer.id, originalSaleId: sale.id, originalSaleLineId: line.id, affectedProductId: line.productId, originalSaleReference: sale.reference, originalReceiptNumber: sale.manualReceiptNumber, customerName: sale.customer.name, customerMobile: sale.customer.mobile, affectedProductItemCode: line.productItemCode, affectedProductName: line.productName, locationCode: sale.location.code, locationName: sale.location.name, concern: input.concern, notes: input.notes, createdById: actor.userId };
    } else {
      const [location, customer] = await Promise.all([tx.location.findFirst({ where: { id: input.locationId, type: "BRANCH", isActive: true } }), tx.customer.findUnique({ where: { id: input.customerId } })]);
      if (!location || !customer) throw new BackjobError("INVALID_LEGACY_SOURCE", "Select an active branch and customer", 400);
      assertScope(actor, location.id);
      data = { reference: `BJ-${randomUUID()}`, isLegacy: true, legacyReference: input.legacyReference, legacyReason: input.legacyReason, legacyProductDescription: input.legacyProductDescription, locationId: location.id, customerId: customer.id, customerName: customer.name, customerMobile: customer.mobile, locationCode: location.code, locationName: location.name, concern: input.concern, notes: input.notes, createdById: actor.userId };
    }
    const row = await tx.backjob.create({ data, include: BACKJOB_INCLUDE });
    await event(tx, row.id, actor.userId, "CREATED", undefined, "DRAFT", input.isLegacy ? input.legacyReason : undefined);
    return serialize(row);
  }, { isolationLevel: "Serializable" });
}

async function transition(actor: AuthContext, id: string, version: number, allowed: BackjobStatus[], toStatus: BackjobStatus, type: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const row = await lockBackjob(tx, actor, id, version);
    if (!allowed.includes(row.status)) throw new BackjobError("INVALID_STATUS", `Cannot ${type.toLowerCase()} a ${row.status.toLowerCase()} Backjob`);
    const data: Prisma.BackjobUncheckedUpdateInput = { status: toStatus, version: { increment: 1 }, updatedById: actor.userId };
    if (toStatus === "CANCELLED") Object.assign(data, { cancelledById: actor.userId, cancelledAt: new Date() });
    if (toStatus === "REJECTED") Object.assign(data, { rejectedById: actor.userId, rejectedAt: new Date() });
    await tx.backjob.update({ where: { id }, data });
    await event(tx, id, actor.userId, type, row.status, toStatus, reason);
    return getLockedResult(tx, id);
  });
}

async function getLockedResult(tx: Prisma.TransactionClient, id: string) {
  return serialize(await tx.backjob.findUniqueOrThrow({ where: { id }, include: BACKJOB_INCLUDE }));
}

export async function scheduleBackjob(actor: AuthContext, id: string, input: ScheduleBackjobInput) {
  await assertBackjobCapability(actor, "backjobs:schedule");
  return prisma.$transaction(async (tx) => {
    const row = await lockBackjob(tx, actor, id, input.version);
    if (!["DRAFT", "SCHEDULED"].includes(row.status)) throw new BackjobError("INVALID_STATUS", "Only draft or scheduled Backjobs can be scheduled");
    const installer = await tx.personnel.findFirst({ where: { id: input.installerId, locationId: row.locationId, status: "ACTIVE", type: { in: ["INSTALLER", "BOTH"] } }, include: { location: true } });
    if (!installer) throw new BackjobError("INVALID_INSTALLER", "Select an active installer from the same branch", 400);
    const scheduledFor = new Date(input.scheduledFor);
    if (scheduledFor <= new Date()) throw new BackjobError("INVALID_SCHEDULE", "Schedule must be in the future", 400);
    if (row.status === "SCHEDULED" && !input.reason) throw new BackjobError("RESCHEDULE_REASON_REQUIRED", "Enter a reason for rescheduling", 400);
    await tx.backjob.update({ where: { id }, data: { status: "SCHEDULED", scheduledFor, installerId: installer.id, installerName: installer.fullName, installerLocationId: installer.locationId, installerLocationCode: installer.location.code, installerLocationName: installer.location.name, version: { increment: 1 }, updatedById: actor.userId } });
    await tx.backjobScheduleHistory.create({ data: { backjobId: id, previousSchedule: row.scheduledFor, newSchedule: scheduledFor, reason: input.reason, actorId: actor.userId } });
    await event(tx, id, actor.userId, row.status === "DRAFT" ? "SCHEDULED" : "RESCHEDULED", row.status, "SCHEDULED", input.reason);
    return getLockedResult(tx, id);
  });
}

export async function startBackjob(actor: AuthContext, id: string, version: number) {
  await assertBackjobCapability(actor, "backjobs:update");
  return transition(actor, id, version, ["SCHEDULED"], "IN_PROGRESS", "STARTED");
}
export async function cancelBackjob(actor: AuthContext, id: string, version: number, reason: string) {
  await assertBackjobCapability(actor, "backjobs:update");
  const current = await getBackjob(actor, id);
  if (current.parts.some((part) => part.issuedQuantity !== part.returnedQuantity || (part.usedQuantity ?? 0) > 0)) throw new BackjobError("PARTS_NOT_RECONCILED", "Return all issued parts before cancelling");
  return transition(actor, id, version, ["DRAFT", "SCHEDULED", "IN_PROGRESS"], "CANCELLED", "CANCELLED", reason);
}
export async function rejectBackjob(actor: AuthContext, id: string, version: number, reason: string) {
  await assertBackjobCapability(actor, "backjobs:update");
  return transition(actor, id, version, ["DRAFT"], "REJECTED", "REJECTED", reason);
}

export async function setBackjobCoverage(actor: AuthContext, id: string, input: CoverageBackjobInput) {
  await assertBackjobCapability(actor, "backjobs:update");
  return prisma.$transaction(async (tx) => {
    const row = await lockBackjob(tx, actor, id, input.version);
    if (["COMPLETED", "CANCELLED", "REJECTED"].includes(row.status)) throw new BackjobError("INVALID_STATUS", "Coverage cannot be changed after closure");
    if (input.coverage === "CHARGEABLE") {
      if (input.chargeableAmount <= 0) throw new BackjobError("INVALID_CHARGE", "Chargeable work requires a positive amount", 400);
      const sale = await tx.sale.findFirst({ where: { id: input.chargeSaleId, status: "POSTED", locationId: row.locationId, customerId: row.customerId } });
      if (!sale) throw new BackjobError("INVALID_CHARGE_SALE", "Charge sale must be posted for the same branch and customer", 400);
    }
    await tx.backjob.update({ where: { id }, data: { coverage: input.coverage, chargeSaleId: input.coverage === "CHARGEABLE" ? input.chargeSaleId : null, chargeableAmount: input.coverage === "CHARGEABLE" ? input.chargeableAmount : 0, version: { increment: 1 }, updatedById: actor.userId } });
    await event(tx, id, actor.userId, "COVERAGE_SET", row.status, row.status, undefined, { coverage: input.coverage, chargeSaleId: input.chargeSaleId ?? null, amount: input.chargeableAmount });
    return getLockedResult(tx, id);
  });
}

export async function planBackjobParts(actor: AuthContext, id: string, input: PlanBackjobPartsInput) {
  await assertBackjobCapability(actor, "backjobs:update");
  return prisma.$transaction(async (tx) => {
    const row = await lockBackjob(tx, actor, id, input.version);
    if (!["DRAFT", "SCHEDULED"].includes(row.status) || row.parts.some((part) => part.issuedQuantity > 0)) throw new BackjobError("INVALID_PART_PLAN", "Parts can only be planned before issue");
    const products = await tx.product.findMany({ where: { id: { in: input.parts.map((part) => part.productId) }, status: "ACTIVE" }, select: { id: true, itemCode: true, name: true } });
    if (products.length !== input.parts.length) throw new BackjobError("INVALID_PRODUCT", "Every planned part must be active", 400);
    await tx.backjobPart.deleteMany({ where: { backjobId: id } });
    if (input.parts.length) await tx.backjobPart.createMany({ data: input.parts.map((part) => { const product = products.find((item) => item.id === part.productId)!; return { backjobId: id, productId: part.productId, productItemCode: product.itemCode, productName: product.name, plannedQuantity: part.plannedQuantity }; }) });
    await tx.backjob.update({ where: { id }, data: { version: { increment: 1 }, updatedById: actor.userId } });
    await event(tx, id, actor.userId, "PARTS_PLANNED", row.status, row.status, undefined, { parts: input.parts });
    return getLockedResult(tx, id);
  });
}

export async function issueBackjobPart(actor: AuthContext, id: string, input: IssueBackjobPartInput) {
  await assertBackjobCapability(actor, "backjobs:parts:issue");
  return prisma.$transaction(async (tx) => {
    const row = await lockBackjob(tx, actor, id, input.version);
    if (!["SCHEDULED", "IN_PROGRESS"].includes(row.status)) throw new BackjobError("INVALID_STATUS", "Parts can only be issued to scheduled or in-progress work");
    const part = row.parts.find((item) => item.id === input.partId);
    if (!part || part.issuedQuantity + input.quantity > part.plannedQuantity) throw new BackjobError("INVALID_PART_QUANTITY", "Issue cannot exceed the planned quantity", 400);
    const currentBalance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: row.locationId, productId: part.productId } } });
    if (!currentBalance || currentBalance.version !== input.balanceVersion || currentBalance.onHand - currentBalance.reserved - currentBalance.quarantined < input.quantity) throw new BackjobError("STALE_OR_INSUFFICIENT_STOCK", "Available stock changed; reload before retrying");
    const result = await tx.inventoryBalance.updateMany({ where: { id: currentBalance.id, version: input.balanceVersion, onHand: { gte: currentBalance.reserved + currentBalance.quarantined + input.quantity } }, data: { onHand: { decrement: input.quantity }, version: { increment: 1 } } });
    if (result.count !== 1) throw new BackjobError("STALE_OR_INSUFFICIENT_STOCK", "Available stock changed; reload before retrying");
    const balance = await tx.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: row.locationId, productId: part.productId } }, select: { onHand: true, reserved: true, quarantined: true } });
    if (balance.onHand < balance.reserved + balance.quarantined) throw new BackjobError("INSUFFICIENT_STOCK", "Quarantined or reserved stock is not available");
    await tx.backjobPart.update({ where: { id: part.id }, data: { issuedQuantity: { increment: input.quantity } } });
    await tx.inventoryMovement.create({ data: { backjobPartId: part.id, productId: part.productId, locationId: row.locationId, quantity: -input.quantity, type: "BACKJOB_PART_ISSUE", actorId: actor.userId, reference: row.reference, remarks: `Issued for ${row.reference}` } });
    await tx.backjob.update({ where: { id }, data: { version: { increment: 1 }, updatedById: actor.userId } });
    await event(tx, id, actor.userId, "PART_ISSUED", row.status, row.status, undefined, { partId: part.id, quantity: input.quantity });
    return getLockedResult(tx, id);
  });
}

export async function reconcileBackjobPart(actor: AuthContext, id: string, input: ReconcileBackjobPartInput) {
  await assertBackjobCapability(actor, "backjobs:update");
  return prisma.$transaction(async (tx) => {
    const row = await lockBackjob(tx, actor, id, input.version);
    if (row.status !== "IN_PROGRESS") throw new BackjobError("INVALID_STATUS", "Usage is recorded during in-progress work");
    const part = row.parts.find((item) => item.id === input.partId);
    if (!part || input.usedQuantity + part.returnedQuantity > part.issuedQuantity) throw new BackjobError("INVALID_PART_QUANTITY", "Used plus returned cannot exceed issued quantity", 400);
    await tx.backjobPart.update({ where: { id: input.partId }, data: { usedQuantity: input.usedQuantity } });
    await tx.backjob.update({ where: { id }, data: { version: { increment: 1 }, updatedById: actor.userId } });
    await event(tx, id, actor.userId, "PART_USAGE_RECORDED", row.status, row.status, undefined, { partId: input.partId, usedQuantity: input.usedQuantity });
    return getLockedResult(tx, id);
  });
}

export async function returnBackjobPart(actor: AuthContext, id: string, input: IssueBackjobPartInput) {
  await assertBackjobCapability(actor, "backjobs:parts:return");
  return prisma.$transaction(async (tx) => {
    const row = await lockBackjob(tx, actor, id, input.version);
    if (row.status !== "IN_PROGRESS") throw new BackjobError("INVALID_STATUS", "Parts can only be returned during in-progress work");
    const part = row.parts.find((item) => item.id === input.partId);
    const used = part?.usedQuantity ?? 0;
    if (!part || part.returnedQuantity + input.quantity + used > part.issuedQuantity) throw new BackjobError("INVALID_PART_QUANTITY", "Return exceeds unreconciled issued quantity", 400);
    const result = await tx.inventoryBalance.updateMany({ where: { locationId: row.locationId, productId: part.productId, version: input.balanceVersion }, data: { onHand: { increment: input.quantity }, version: { increment: 1 } } });
    if (result.count !== 1) throw new BackjobError("STALE_BALANCE", "Inventory changed; reload before retrying");
    await tx.backjobPart.update({ where: { id: part.id }, data: { returnedQuantity: { increment: input.quantity } } });
    await tx.inventoryMovement.create({ data: { backjobPartId: part.id, productId: part.productId, locationId: row.locationId, quantity: input.quantity, type: "BACKJOB_PART_RETURN", actorId: actor.userId, reference: row.reference, remarks: `Returned unused part from ${row.reference}` } });
    await tx.backjob.update({ where: { id }, data: { version: { increment: 1 }, updatedById: actor.userId } });
    await event(tx, id, actor.userId, "PART_RETURNED", row.status, row.status, undefined, { partId: part.id, quantity: input.quantity });
    return getLockedResult(tx, id);
  });
}

export async function completeBackjob(actor: AuthContext, id: string, input: CompleteBackjobInput) {
  await assertBackjobCapability(actor, "backjobs:complete");
  return prisma.$transaction(async (tx) => {
    const row = await lockBackjob(tx, actor, id, input.version);
    if (row.status !== "IN_PROGRESS") throw new BackjobError("INVALID_STATUS", "Only in-progress work can be completed");
    if (row.coverage === "PENDING") throw new BackjobError("COVERAGE_REQUIRED", "Set covered or chargeable coverage before completion");
    if (row.coverage === "CHARGEABLE") {
      const chargeSale = row.chargeSaleId ? await tx.sale.findFirst({ where: { id: row.chargeSaleId, status: "POSTED", locationId: row.locationId, customerId: row.customerId }, select: { id: true } }) : null;
      if (!chargeSale) throw new BackjobError("CHARGE_SALE_REQUIRED", "Link a currently posted charge sale for the same branch and customer before completion");
    }
    if (row.parts.some((part) => part.issuedQuantity > 0 && (part.usedQuantity === null || part.issuedQuantity !== part.usedQuantity + part.returnedQuantity))) throw new BackjobError("PARTS_NOT_RECONCILED", "Record usage and return every unused issued part before completion");
    if (input.acknowledgementMethod === "DECLINED" && !input.acknowledgementNote) throw new BackjobError("ACKNOWLEDGEMENT_REQUIRED", "Enter a reason when acknowledgement is declined", 400);
    const now = new Date();
    await tx.backjob.update({ where: { id }, data: { status: "COMPLETED", workPerformed: input.workPerformed, completionNotes: input.completionNotes, acknowledgementMethod: input.acknowledgementMethod, acknowledgedByName: input.acknowledgedByName, acknowledgementNote: input.acknowledgementNote, acknowledgedAt: now, completedAt: now, completedById: actor.userId, updatedById: actor.userId, version: { increment: 1 } } });
    await event(tx, id, actor.userId, "COMPLETED", row.status, "COMPLETED");
    return getLockedResult(tx, id);
  });
}
