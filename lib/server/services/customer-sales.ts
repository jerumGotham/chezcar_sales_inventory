import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type CustomerOrderStatus, type CustomerOrderType, type PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { availableStock } from "@/lib/inventory-quantity";

import {
  ACCOUNTING_RESOLUTION_ACTIONS,
  BRANCH_MISMATCH_RESPONSES,
  branchSaleCorrectionRequestSchema,
  receiptComparisonSchema,
  saleCorrectionResolutionSchema,
  soldAtBounds,
  soldAtSchema,
  type ReceiptComparison,
  type SaleCorrectionRequestDto,
} from "../../contracts/sales";
import {
  customerTypeSchema,
  DEFAULT_CUSTOMER_TYPE,
} from "../../contracts/customers";
import { cancelOrderSettlementSchema } from "../../contracts/refunds";
import {
  assertAnyCapability,
  assertCapability,
  AuthorizationError,
  type AuthContext,
} from "../authorization";
import { prisma } from "../prisma";
import { recordAuditLog } from "./audit-log";
import { findActiveBranch, listActiveBranches } from "../locations";
import { canAccessLocation, hasAllLocationAccess } from "../policy/access";
import { createNotifications, notifyInventoryThresholdChange } from "./notifications";
import { parseReceiptOcrDraft } from "./receipt-ocr";
import { receiptEvidenceVersion } from "./receipt-evidence";
import { recordPayment, syncSalePaymentReview, voidSalePayment } from "./payments";
import { resolveActiveSalespersonForTransaction } from "./personnel";

const positiveInt = z.coerce.number().int().positive();
const money = z.coerce.number().min(0);

export const customerMutationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /**
   * Optional rather than defaulted, so the inferred input stays assignable for
   * the callers that post only a name — the offline sale payload and the order
   * forms. A customer with no stated type is a person, which is what every
   * customer captured before this was.
   */
  type: customerTypeSchema.optional(),
  mobile: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  source: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1_000).optional(),
});

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  name: z.string().trim().max(200).default(""),
  status: z.enum(["all", "active", "inactive"]).default("all"),
});

export const receiptVerificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
  search: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().max(200).optional()),
  reviewStatus: z.preprocess((value) => value === "" ? undefined : value, z.enum(["all", "UNVERIFIED", "VERIFIED", "MISMATCH_REPORTED"]).default("all")),
  saleStatus: z.preprocess((value) => value === "" ? undefined : value, z.enum(["all", "POSTED", "VOIDED"]).default("all")),
  locationId: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().max(100).optional()),
  dateFrom: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date").optional()),
  dateTo: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date").optional()),
  saleId: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(100).optional()),
}).superRefine((input, context) => {
  if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "End date must be on or after start date" });
  }
});

export const customerOrderMutationSchema = z.object({
  customer: customerMutationSchema.extend({ id: z.string().optional() }),
  type: z.enum(["RESERVATION_NO_DP", "RESERVATION_WITH_DP", "WAITING_STOCK"]),
  expectedReleaseDate: z.string().optional(),
  locationId: z.string().optional(),
  salespersonId: z.string().trim().min(1, "Select a salesperson"),
  source: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1_000).optional(),
  downpaymentAmount: money.default(0),
  downpaymentReceiptNumber: z.string().trim().max(100).optional(),
  downpaymentMethod: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).optional(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: positiveInt, finalUnitPrice: money.optional() })).min(1),
});

/**
 * What an order may be changed to before it is released. The customer is not
 * editable here: changing who an order belongs to is a different act from
 * changing what is on it.
 */
export const customerOrderLinesSchema = z.object({
  lines: z.array(z.object({
    productId: z.string().min(1),
    quantity: positiveInt,
    /** Left out, the line takes the branch's price. Below it, the gap is the discount. */
    finalUnitPrice: money.optional(),
  })).min(1, "An order needs at least one line"),
  /**
   * Taken off the whole order rather than off a line, the way a POS sale is
   * discounted. Left out, the order keeps whatever discount it already had.
   */
  discountAmount: money.optional(),
  /** Required only when the change hands money back. */
  acknowledgementNumber: z.string().trim().max(100).optional(),
  refundMethod: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).optional(),
  note: z.string().trim().max(1_000).optional(),
});

export const customerOrderSalespersonSchema = z.object({
  salespersonId: z.string().trim().min(1, "Select a salesperson"),
});

export const releaseOrderSchema = z.object({
  /**
   * Left out when the order is already paid in full. A receipt is the record of
   * money received, and releasing goods that were paid for earlier takes none,
   * so there is nothing to write a number on.
   */
  finalReceiptNumber: z.string().trim().min(1).max(100).optional(),
  amountPaid: money,
  paymentMethod: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).default("CASH"),
  notes: z.string().trim().max(1_000).optional(),
});

/**
 * Cancelling. The settlement dropdown decides what happens to money already
 * collected: the branch keeps it, or it goes back and sales fall by that much.
 * Defined in lib/contracts/refunds so the dialog and the server agree.
 */
export const cancelOrderSchema = cancelOrderSettlementSchema;

export const orderPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(9_999_999_999.99),
  // Every peso collected is backed by a receipt the branch hands over, and
  // Accounting verifies that receipt, so the number is not optional.
  reference: z.string().trim().min(1, "Receipt number is required").max(100),
  method: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).optional(),
});

export const directSaleSchema = z.object({
  locationId: z.string().optional(),
  customerId: z.string().optional(),
  customer: customerMutationSchema.optional(),
  salespersonId: z.string().trim().min(1, "Select a salesperson"),
  receiptBooklet: z.string().trim().max(50).default(""),
  manualReceiptNumber: z.string().trim().min(1).max(100),
  soldAt: soldAtSchema,
  paymentMethod: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).default("CASH"),
  discountAmount: money.default(0),
  amountPaid: money,
  notes: z.string().trim().max(1_000).optional(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: positiveInt, unitPrice: money.optional() })).min(1),
});

/**
 * Turns the calendar day a branch typed into an instant to store. A late entry
 * lands at the end of that day so it sorts after anything encoded earlier, and
 * a sale encoded on the spot simply keeps the current time.
 */
function resolveSoldAt(value: string | undefined, now: Date = new Date()): Date {
  if (!value) return now;
  const { earliest, latest } = soldAtBounds(now);
  const [year, month, day] = value.split("-").map(Number);
  const sold = new Date(year, month - 1, day, 23, 59, 59, 999);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const soldDay = new Date(year, month - 1, day);
  if (soldDay > startOfToday) {
    throw new CustomerSalesError("INVALID_SOLD_DATE", "A sale cannot be dated in the future", 400);
  }
  if (soldDay < new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate())) {
    throw new CustomerSalesError("INVALID_SOLD_DATE", "That sale date is too far back to encode", 400);
  }
  // Today's own entries keep the real clock time, so same-day ordering holds.
  return soldDay.getTime() === startOfToday.getTime() ? now : (sold > latest ? now : sold);
}

export const accountingReviewSchema = z.object({
  status: z.enum(["VERIFIED", "MISMATCH_REPORTED"]),
  mismatchCategory: z.enum(["PRICE_MISMATCH", "QUANTITY_MISMATCH", "ITEM_MISMATCH", "TOTAL_MISMATCH", "RECEIPT_NOT_FOUND", "OTHER"]).optional(),
  notes: z.string().trim().max(5_000).optional(),
  comparison: receiptComparisonSchema,
}).superRefine((input, context) => {
  if (input.status === "MISMATCH_REPORTED" && !input.mismatchCategory) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mismatchCategory"], message: "Mismatch category is required" });
  }
  if (input.status === "MISMATCH_REPORTED" && !input.notes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Notes are required" });
  }
});

export const branchMismatchResponseSchema = z.object({
  response: z.enum(BRANCH_MISMATCH_RESPONSES),
  note: z.string().trim().min(1).max(5_000),
  replacementReceiptNumber: z.string().trim().min(1).max(100).optional(),
  replacementEvidenceKey: z.string().trim().min(1).max(100).optional(),
}).superRefine((input, context) => {
  if (input.response === "RECEIPT_CORRECTION_NEEDED" && !input.replacementReceiptNumber) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["replacementReceiptNumber"],
      message: "Replacement receipt number is required when correction is needed",
    });
  }
  if (input.response === "WRONG_RECEIPT_PHOTO" && !input.replacementEvidenceKey) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["replacementEvidenceKey"],
      message: "A newly uploaded replacement receipt photo is required",
    });
  }
});

export const dashboardSalesFiltersSchema = z.object({
  salesPeriod: z
    .enum(["today", "last7Days", "monthToDate"])
    .optional(),
  salesBranchId: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(100).optional(),
  ),
});

export type DashboardSalesFilters = z.infer<
  typeof dashboardSalesFiltersSchema
>;
type DashboardSalesPeriod = NonNullable<
  DashboardSalesFilters["salesPeriod"]
> | "last30Days";

export const accountingResolutionSchema = z.object({
  action: z.enum(ACCOUNTING_RESOLUTION_ACTIONS),
  note: z.string().trim().min(1).max(5_000),
  replacement: receiptComparisonSchema.optional(),
}).superRefine((input, context) => {
  if (input.action === "VOIDED_REPLACED" && !input.replacement) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["replacement"], message: "Replacement sale details are required" });
  }
});

export class CustomerSalesError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

function assertOperationalActor(actor: AuthContext) {
  if (!hasAllLocationAccess(actor) && actor.locationIds.length === 0) throw new CustomerSalesError("FORBIDDEN", "A location assignment is required", 403);
}

function assertAccounting(actor: AuthContext) {
  void actor;
}

function operationalLocationId(actor: AuthContext, requestedLocationId?: string) {
  assertOperationalActor(actor);
  if (!requestedLocationId || !canAccessLocation(actor, requestedLocationId)) {
    throw new CustomerSalesError("FORBIDDEN", "Select an assigned active location", 403);
  }
  return requestedLocationId;
}

function assertOperationalResource(actor: AuthContext, locationId: string) {
  assertOperationalActor(actor);
  if (!canAccessLocation(actor, locationId)) {
    throw new CustomerSalesError("FORBIDDEN", "Resource is outside assigned locations", 403);
  }
}

function locationIdFilter(actor: AuthContext): Prisma.StringFilter | undefined {
  return hasAllLocationAccess(actor) ? undefined : { in: [...actor.locationIds] };
}

function decimal(value: number) { return new Prisma.Decimal(value); }
function serializeMoney(value: Prisma.Decimal) { return value.toNumber(); }

export function compareReceipt(sale: {
  manualReceiptNumber: string;
  receiptBooklet: string;
  paymentMethod: PaymentMethod;
  discountAmount: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  lines: Array<{ productItemCode: string; quantity: number; unitPrice: Prisma.Decimal }>;
}, comparison: ReceiptComparison) {
  const differences: string[] = [];
  if (sale.manualReceiptNumber !== comparison.receiptNumber || sale.receiptBooklet !== comparison.receiptBooklet) differences.push("Receipt identity does not match");
  if (sale.paymentMethod !== comparison.paymentMethod) differences.push("Payment method does not match");
  if (Math.round(sale.discountAmount.toNumber() * 100) !== Math.round(comparison.discountAmount * 100)) differences.push("Discount does not match");
  if (Math.round(sale.amountPaid.toNumber() * 100) !== Math.round(comparison.amountPaid * 100)) differences.push("Amount paid does not match");
  if (Math.round(sale.totalAmount.toNumber() * 100) !== Math.round(comparison.totalAmount * 100)) differences.push("Total amount does not match");
  const saleLines = new Map(sale.lines.map((line) => [line.productItemCode, line]));
  const paperLines = new Map(comparison.lines.map((line) => [line.itemCode, line]));
  for (const [itemCode, line] of saleLines) {
    const paperLine = paperLines.get(itemCode);
    if (!paperLine) {
      differences.push(`Missing receipt line: ${itemCode}`);
      continue;
    }
    if (line.quantity !== paperLine.quantity) differences.push(`Quantity does not match: ${itemCode}`);
    if (Math.round(line.unitPrice.toNumber() * 100) !== Math.round(paperLine.unitPrice * 100)) differences.push(`Price does not match: ${itemCode}`);
  }
  for (const itemCode of paperLines.keys()) if (!saleLines.has(itemCode)) differences.push(`Unexpected receipt line: ${itemCode}`);
  return differences;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function assertUniqueComparisonLines(comparison: ReceiptComparison) {
  const itemCodes = comparison.lines.map((line) => line.itemCode);
  if (new Set(itemCodes).size !== itemCodes.length) {
    throw new CustomerSalesError("INVALID_LINES", "A receipt item may appear only once", 400);
  }
}

async function notifySaleParties(tx: Prisma.TransactionClient, sale: { id: string; reference: string; manualReceiptNumber: string; postedById: string; locationId: string }, title: string, description: string, additionalRecipientIds: readonly string[] = []) {
  const recipients = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      accessRole: { OR: [{ isOwner: true }, { permissions: { has: "sales:mismatch:respond" } }] },
      OR: [
        { accessRole: { isOwner: true } },
        { accessRole: { permissions: { has: "locations:all" } } },
        { locationAssignments: { some: { locationId: sale.locationId } } },
      ],
    },
    select: { id: true },
  });
  const recipientIds = new Set(recipients.map((recipient) => recipient.id));
  recipientIds.add(sale.postedById);
  additionalRecipientIds.forEach((userId) => recipientIds.add(userId));
  await createNotifications(tx, Array.from(recipientIds).map((userId) => ({ userId, title, description, type: "WARNING" as const, relatedType: "SALE" as const, relatedId: sale.id, relatedReference: sale.reference })));
}

async function saleCorrectionResolvers(tx: Prisma.TransactionClient, locationId: string) {
  return tx.user.findMany({
    where: {
      status: "ACTIVE",
      accessRole: { OR: [{ isOwner: true }, { permissions: { has: "sales:void-replace" } }] },
      OR: [
        { accessRole: { isOwner: true } },
        { accessRole: { permissions: { has: "locations:all" } } },
        { locationAssignments: { some: { locationId } } },
      ],
    },
    select: { id: true },
  });
}

async function updateSaleInventory(tx: Prisma.TransactionClient, locationId: string, lines: Array<{ productId: string; quantity: number }>, direction: "reverse" | "deduct", actorId: string, reference: string, remarks?: string) {
  for (const line of lines) {
    const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId, productId: line.productId } } });
    if (!balance) {
      // Naming the product matters: the reader has to know which line to take
      // off, and that the fix is to receive it into this branch first.
      const missing = await tx.product.findUnique({ where: { id: line.productId }, select: { itemCode: true, name: true } });
      throw new CustomerSalesError(
        "INVENTORY_NOT_FOUND",
        `${missing ? `${missing.itemCode} - ${missing.name}` : "That product"} has no stock record at this branch, so the sale cannot be changed to include it. Receive it into this branch first.`,
        409,
      );
    }
    if (direction === "deduct" && availableStock(balance) < line.quantity) {
      const short = await tx.product.findUnique({ where: { id: line.productId }, select: { itemCode: true, name: true } });
      throw new CustomerSalesError(
        "INSUFFICIENT_STOCK",
        `${short ? `${short.itemCode} - ${short.name}` : "That product"} has only ${availableStock(balance)} available at this branch, and the change needs ${line.quantity}.`,
        409,
      );
    }
    if (direction === "reverse") {
      await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: { increment: line.quantity }, version: { increment: 1 } } });
    } else {
      const updated = await tx.inventoryBalance.updateMany({
        where: { id: balance.id, version: balance.version, onHand: { gte: balance.reserved + balance.quarantined + line.quantity } },
        data: { onHand: { decrement: line.quantity }, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Corrected sale stock changed before posting", 409);
    }
    await tx.inventoryMovement.create({ data: { productId: line.productId, locationId, quantity: direction === "reverse" ? line.quantity : -line.quantity, type: direction === "reverse" ? "SALE_CORRECTION_REVERSAL" : "SALE_CORRECTION", actorId, reference, remarks } });
  }
}

async function resolveCustomer(tx: Prisma.TransactionClient, actor: AuthContext, input: z.infer<typeof customerMutationSchema> & { id?: string }) {
  if (input.id) {
    const customer = await tx.customer.findFirst({ where: { id: input.id, status: "ACTIVE" } });
    if (!customer) throw new CustomerSalesError("INVALID_CUSTOMER", "Customer not found", 404);
    return customer.id;
  }
  const customer = await tx.customer.create({ data: { name: input.name, type: input.type ?? DEFAULT_CUSTOMER_TYPE, mobile: input.mobile || null, email: input.email || null, address: input.address || null, source: input.source || null, notes: input.notes || null, createdById: actor.userId } });
  return customer.id;
}

async function reserveLines(tx: Prisma.TransactionClient, locationId: string, lines: Array<{ productId: string; quantity: number }>) {
  for (const line of lines) {
    const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId, productId: line.productId } }, include: { product: { select: { itemCode: true, name: true, reorderLevel: true } }, location: { select: { name: true } } } });
    if (!balance || availableStock(balance) < line.quantity) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Not enough available branch stock", 409);
    const updated = await tx.inventoryBalance.updateMany({
      where: { id: balance.id, version: balance.version, onHand: { gte: balance.reserved + balance.quarantined + line.quantity } },
      data: { reserved: { increment: line.quantity }, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Available stock changed before reservation", 409);
    await notifyInventoryThresholdChange(tx, { balanceId: balance.id, locationId, locationName: balance.location.name, productItemCode: balance.product.itemCode, productName: balance.product.name, reorderLevel: balance.product.reorderLevel, previousAvailable: availableStock(balance), nextAvailable: availableStock(balance) - line.quantity });
  }
}

async function releaseReservedLines(tx: Prisma.TransactionClient, locationId: string, lines: Array<{ productId: string; quantity: number }>) {
  for (const line of lines) {
    const result = await tx.inventoryBalance.updateMany({
      where: { locationId, productId: line.productId, reserved: { gte: line.quantity }, onHand: { gte: line.quantity } },
      data: { onHand: { decrement: line.quantity }, reserved: { decrement: line.quantity }, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Reserved stock is no longer releasable", 409);
  }
}

async function deductSaleLines(tx: Prisma.TransactionClient, locationId: string, lines: Array<{ productId: string; quantity: number }>) {
  for (const line of lines) {
    const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId, productId: line.productId } }, include: { product: { select: { itemCode: true, name: true, reorderLevel: true } }, location: { select: { name: true } } } });
    if (!balance || availableStock(balance) < line.quantity) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Not enough available branch stock", 409);
    const updated = await tx.inventoryBalance.updateMany({
      where: { id: balance.id, version: balance.version, onHand: { gte: balance.reserved + balance.quarantined + line.quantity } },
      data: { onHand: { decrement: line.quantity }, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Available stock changed before sale posting", 409);
    await notifyInventoryThresholdChange(tx, { balanceId: balance.id, locationId, locationName: balance.location.name, productItemCode: balance.product.itemCode, productName: balance.product.name, reorderLevel: balance.product.reorderLevel, previousAvailable: availableStock(balance), nextAvailable: availableStock(balance) - line.quantity });
  }
}

async function registerReceipt(tx: Prisma.TransactionClient, number: string, purpose: string, ids: { orderId?: string; saleId?: string; locationId?: string; receiptBooklet?: string }) {
  if (!number) return;
  try {
    await tx.manualReceipt.create({
      data: {
        number,
        purpose,
        orderId: ids.orderId,
        saleId: ids.saleId,
        locationId: ids.locationId ?? null,
        receiptBooklet: ids.receiptBooklet ?? "",
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerSalesError("DUPLICATE_RECEIPT", "Manual receipt number already exists", 409);
    throw error;
  }
}

/**
 * The products a transaction may charge for, priced for the branch making it.
 *
 * price is resolved here rather than at each caller: a branch that sets its own
 * price sells at that price everywhere the transaction touches it, and leaving
 * the substitution to the callers is how a total and the line it came from
 * drift apart. A branch with no price of its own keeps the product's.
 */
async function activeProducts(tx: Prisma.TransactionClient, ids: string[], locationId: string) {
  const products = await tx.product.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: {
      id: true, itemCode: true, name: true, price: true, warrantyDurationMonths: true,
      branchPrices: { where: { locationId }, select: { price: true } },
    },
  });
  if (products.length !== new Set(ids).size) throw new CustomerSalesError("INVALID_LINES", "Every line must reference an active product", 400);
  return new Map(products.map((product) => [
    product.id,
    { ...product, price: product.branchPrices[0]?.price ?? product.price },
  ]));
}

export async function createCustomer(actor: AuthContext, input: z.infer<typeof customerMutationSchema>) {
  assertCapability(actor, "customers:create");
  const created = await prisma.customer.create({ data: { name: input.name, type: input.type ?? DEFAULT_CUSTOMER_TYPE, mobile: input.mobile || null, email: input.email || null, address: input.address || null, source: input.source || null, notes: input.notes || null, createdById: actor.userId } });
  await recordAuditLog({ category: "Master Data", action: "Customer Created", actorId: actor.userId, reference: created.name, details: `${created.name}${created.mobile ? `, ${created.mobile}` : ""}` });
  return created;
}

export async function updateCustomer(actor: AuthContext, id: string, input: z.infer<typeof customerMutationSchema>) {
  assertCapability(actor, "customers:update");
  try {
    const updated = await prisma.customer.update({
      where: { id },
      // Written only when stated. Falling back to the default here would
      // quietly demote a Company back to Individual on any update that
      // left the field out.
      data: { name: input.name, ...(input.type ? { type: input.type } : {}), mobile: input.mobile || null, email: input.email || null, address: input.address || null, source: input.source || null, notes: input.notes || null },
    });
    await recordAuditLog({ category: "Master Data", action: "Customer Updated", actorId: actor.userId, reference: updated.name, details: `${updated.name}${updated.mobile ? `, ${updated.mobile}` : ""}` });
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new CustomerSalesError("NOT_FOUND", "Customer not found", 404);
    throw error;
  }
}

export const customerStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

export async function deactivateCustomer(actor: AuthContext, id: string) {
  return setCustomerStatus(actor, id, "INACTIVE");
}

export async function setCustomerStatus(actor: AuthContext, id: string, status: "ACTIVE" | "INACTIVE") {
  assertCapability(actor, "customers:deactivate");
  try {
    const changed = await prisma.customer.update({ where: { id }, data: { status } });
    await recordAuditLog({ category: "Master Data", action: `Customer ${status === "ACTIVE" ? "Activated" : "Deactivated"}`, actorId: actor.userId, reference: changed.name, details: changed.name });
    return changed;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new CustomerSalesError("NOT_FOUND", "Customer not found", 404);
    throw error;
  }
}

export async function listCustomers(actor: AuthContext, query: z.infer<typeof customerListQuerySchema> = customerListQuerySchema.parse({})) {
  assertCapability(actor, "customers:view");
  const where: Prisma.CustomerWhereInput = {
    status: query.status === "all" ? undefined : query.status === "active" ? "ACTIVE" : "INACTIVE",
    name: query.name ? { contains: query.name, mode: "insensitive" } : undefined,
  };
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      orders: { orderBy: { createdAt: "desc" }, include: { location: { select: { name: true } } } },
      sales: { where: { status: "POSTED" }, orderBy: { postedAt: "desc" }, include: { location: { select: { name: true } } } },
    },
  });
  const total = customers.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const rows = customers.slice((page - 1) * query.pageSize, page * query.pageSize);
  return {
    data: rows.map((customer) => {
      const latestSale = customer.sales[0];
      const latestOrder = customer.orders[0];
      const latest = latestSale && latestOrder
        ? latestSale.postedAt > latestOrder.createdAt ? latestSale : latestOrder
        : latestSale ?? latestOrder;
      return {
        id: customer.id,
        name: customer.name,
        type: customer.type,
        mobile: customer.mobile ?? "",
        email: customer.email,
        city: customer.address ?? "",
        status: customer.status === "ACTIVE" ? "Active" : "Inactive",
        lastTransaction: latest ? ("postedAt" in latest ? latest.postedAt : latest.createdAt).toISOString().slice(0, 10) : "-",
        branch: latest?.location.name,
        totalSpend: customer.sales.reduce((sum, sale) => sum + sale.totalAmount.toNumber(), 0),
        pendingOrders: customer.orders.filter((order) => ["RESERVED", "WAITING_STOCK", "READY_FOR_RELEASE"].includes(order.status)).length,
        activeJobOrders: 0,
        source: customer.source,
        notes: customer.notes,
        createdAt: customer.createdAt.toISOString(),
      };
    }),
    meta: { page, pageSize: query.pageSize, total, totalPages },
    summary: {
      totalCustomers: await prisma.customer.count(),
      activeCustomers: await prisma.customer.count({ where: { status: "ACTIVE" } }),
      customersWithPendingOrders: customers.filter((customer) => customer.orders.some((order) => ["RESERVED", "WAITING_STOCK", "READY_FOR_RELEASE"].includes(order.status))).length,
      activeJobOrders: 0,
    },
  };
}

export async function getCustomerHistory(actor: AuthContext, id: string) {
  assertCapability(actor, "customers:view");
  const locationFilter = { locationId: locationIdFilter(actor) };
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      sales: { where: { ...locationFilter, status: "POSTED" }, orderBy: { postedAt: "desc" }, include: { location: true, lines: true } },
      orders: { where: locationFilter, orderBy: { createdAt: "desc" }, include: { location: true, lines: true } },
    },
  });
  if (!customer) throw new CustomerSalesError("NOT_FOUND", "Customer not found", 404);
  return {
    customer: { id: customer.id, name: customer.name, mobile: customer.mobile, email: customer.email, address: customer.address, source: customer.source, notes: customer.notes, status: customer.status },
    sales: customer.sales.map((sale) => ({ reference: sale.reference, receiptNumber: sale.manualReceiptNumber, date: sale.postedAt.toISOString(), branch: sale.location.name, total: sale.totalAmount.toNumber(), paymentMethod: sale.paymentMethod, lines: sale.lines.map((line) => ({ name: line.productName, quantity: line.quantity, unitPrice: line.unitPrice.toNumber() })) })),
    orders: customer.orders.map((order) => ({ reference: order.reference, date: order.createdAt.toISOString(), branch: order.location.name, status: order.status, total: order.totalAmount.toNumber(), downpayment: order.downpaymentAmount.toNumber(), remaining: order.remainingBalance.toNumber(), releaseDate: order.expectedReleaseDate?.toISOString() ?? null, lines: order.lines.map((line) => ({ name: line.productName, quantity: line.quantity, unitPrice: line.finalUnitPrice.toNumber() })) })),
  };
}

/**
 * Changes what is on an order that has not been released.
 *
 * A customer who comes back to add, drop or renegotiate an item is the ordinary
 * case, and the only way to serve it used to be cancelling the order and taking
 * it again, which lost the reference, the downpayment receipt and the place in
 * the queue.
 *
 * Reservations are moved by the difference rather than released and retaken:
 * dropping the lot and re-reserving would hand the stock to whoever asked in
 * between, for an order that already held it.
 *
 * Money already collected is honoured. If the new total falls below it, the
 * excess goes back through the refund ledger on today's date, so a period
 * already reported does not change underneath.
 */
export async function updateCustomerOrderLines(
  actor: AuthContext,
  orderId: string,
  input: z.infer<typeof customerOrderLinesSchema>,
) {
  assertCapability(actor, "customer-orders:update");
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new CustomerSalesError("INVALID_LINES", "A product may appear only once", 400);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CustomerOrder" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.customerOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
    assertOperationalResource(actor, order.locationId);

    if (!["RESERVED", "WAITING_STOCK", "READY_FOR_RELEASE"].includes(order.status)) {
      throw new CustomerSalesError(
        "ORDER_NOT_EDITABLE",
        `A ${order.status.toLowerCase().replace("_", " ")} order can no longer be changed`,
        409,
      );
    }

    const products = await activeProducts(tx, productIds, order.locationId);

    /*
     * Only RESERVED and READY_FOR_RELEASE hold stock; a waiting-stock order
     * holds none, which is what waiting means. Its lines move freely.
     */
    const holdsStock = order.status === "RESERVED" || order.status === "READY_FOR_RELEASE";
    if (holdsStock) {
      const before = new Map(order.lines.map((line) => [line.productId, line.quantity]));
      const after = new Map(input.lines.map((line) => [line.productId, line.quantity]));

      for (const [productId, quantity] of after) {
        const delta = quantity - (before.get(productId) ?? 0);
        if (delta > 0) await reserveLines(tx, order.locationId, [{ productId, quantity: delta }]);
      }
      for (const [productId, quantity] of before) {
        const delta = (after.get(productId) ?? 0) - quantity;
        if (delta < 0) {
          // Reserved only: the goods never left, so on hand does not move.
          await tx.inventoryBalance.update({
            where: { locationId_productId: { locationId: order.locationId, productId } },
            data: { reserved: { decrement: -delta }, version: { increment: 1 } },
          });
        }
      }
    }

    const subtotal = input.lines.reduce((sum, line) => {
      const product = products.get(line.productId)!;
      return sum + line.quantity * (line.finalUnitPrice ?? product.price?.toNumber() ?? 0);
    }, 0);
    // One figure off the whole order, which is how the branch gives a discount
    // and how a POS sale already records one.
    const discountAmount = input.discountAmount ?? order.discountAmount.toNumber();
    if (discountAmount > subtotal) {
      throw new CustomerSalesError("INVALID_DISCOUNT", "Discount cannot exceed the order subtotal", 400);
    }
    const total = Math.round((subtotal - discountAmount) * 100) / 100;

    const collected = (await tx.payment.aggregate({
      where: { orderId: order.id },
      _sum: { amount: true },
    }))._sum.amount?.toNumber() ?? 0;
    const refunded = (await tx.refund.aggregate({
      where: { orderId: order.id },
      _sum: { amount: true },
    }))._sum.amount?.toNumber() ?? 0;
    const paid = collected - refunded;

    // Rounded to centavos before comparing: a total built from several lines
    // can land a fraction of a centavo away from what was collected.
    const excess = Math.round((paid - total) * 100) / 100;
    // Only an overpayment is handed back. A total that went up is a balance to
    // collect, not a negative refund.
    const handedBack = excess > 0 ? excess : 0;
    let refund = null;
    if (excess > 0) {
      if (!input.acknowledgementNumber || !input.note) {
        throw new CustomerSalesError(
          "REFUND_DETAILS_REQUIRED",
          `This change hands back ${excess.toFixed(2)}. Enter the acknowledgement number and the reason.`,
          400,
        );
      }
      refund = await tx.refund.create({
        data: {
          reference: `REF-${randomUUID()}`,
          kind: "AMENDED_ORDER",
          locationId: order.locationId,
          customerId: order.customerId,
          orderId: order.id,
          amount: decimal(excess),
          method: (input.refundMethod ?? "CASH") as PaymentMethod,
          acknowledgementNumber: input.acknowledgementNumber,
          reason: input.note,
          salespersonId: order.salespersonId,
          salespersonName: order.salespersonName,
          salespersonLocationId: order.salespersonLocationId,
          salespersonLocationCode: order.salespersonLocationCode,
          salespersonLocationName: order.salespersonLocationName,
          refundedById: actor.userId,
        },
      });
    }

    await tx.customerOrderLine.deleteMany({ where: { orderId: order.id } });
    await tx.customerOrderLine.createMany({
      data: input.lines.map((line) => {
        const product = products.get(line.productId)!;
        const unit = line.finalUnitPrice ?? product.price?.toNumber() ?? 0;
        return {
          orderId: order.id,
          productId: product.id,
          productItemCode: product.itemCode,
          productName: product.name,
          quantity: line.quantity,
          baseUnitPrice: product.price ?? decimal(0),
          finalUnitPrice: decimal(unit),
        };
      }),
    });

    const updated = await tx.customerOrder.update({
      where: { id: order.id },
      data: {
        totalAmount: decimal(total),
        discountAmount: decimal(discountAmount),
        // What is still owed after whatever has just been handed back. Never
        // negative: an overpayment is returned rather than carried.
        remainingBalance: decimal(Math.max(Math.round((total - (paid - handedBack)) * 100) / 100, 0)),
      },
      include: ORDER_INCLUDE,
    });

    await recordAuditLog({
      category: "Sales",
      action: "Customer Order Amended",
      actorId: actor.userId,
      reference: order.reference,
      details: `${order.lines.length} line(s) to ${input.lines.length}, total ${order.totalAmount.toNumber()} to ${total}, discount ${order.discountAmount.toNumber()} to ${discountAmount}${refund ? `, refunded ${excess}` : ""}`,
    });

    return serializeOrder(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createCustomerOrder(actor: AuthContext, input: z.infer<typeof customerOrderMutationSchema>) {
  assertCapability(actor, "customer-orders:create");
  const locationId = operationalLocationId(actor, input.locationId);
  if (!locationId) throw new CustomerSalesError("LOCATION_REQUIRED", "Select a destination branch", 400);
  if (input.type === "RESERVATION_WITH_DP" && (!input.downpaymentReceiptNumber || input.downpaymentAmount <= 0)) throw new CustomerSalesError("DOWNPAYMENT_REQUIRED", "Downpayment orders require amount and receipt", 400);
  if (input.type !== "RESERVATION_WITH_DP" && input.downpaymentAmount > 0) throw new CustomerSalesError("INVALID_DOWNPAYMENT", "Only DP reservations may carry downpayment", 400);
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) throw new CustomerSalesError("INVALID_LINES", "A product may appear only once", 400);

  try {
    return await prisma.$transaction(async (tx) => {
    const location = await findActiveBranch(locationId, tx);
    if (!location) throw new CustomerSalesError("INVALID_LOCATION", "Select an active branch", 400);
    const salesperson = await resolveActiveSalespersonForTransaction(tx, actor, input.salespersonId, locationId);
    if (!salesperson) throw new CustomerSalesError("INVALID_SALESPERSON", "Select an active salesperson within your authorized locations", 409);
    const products = await activeProducts(tx, productIds, locationId);
    const customerId = await resolveCustomer(tx, actor, input.customer);
    const total = input.lines.reduce((sum, line) => {
      const product = products.get(line.productId)!;
      return sum + line.quantity * (line.finalUnitPrice ?? product.price?.toNumber() ?? 0);
    }, 0);
    const status: CustomerOrderStatus = input.type === "WAITING_STOCK" ? "WAITING_STOCK" : "RESERVED";
    if (status === "RESERVED") await reserveLines(tx, locationId, input.lines);
    const order = await tx.customerOrder.create({
      data: {
        reference: `CO-${randomUUID()}`,
        locationId,
        customerId,
        salespersonId: salesperson.id,
        salespersonName: salesperson.fullName,
        salespersonLocationId: salesperson.location.id,
        salespersonLocationCode: salesperson.location.code,
        salespersonLocationName: salesperson.location.name,
        type: input.type as CustomerOrderType,
        status,
        downpaymentAmount: decimal(input.downpaymentAmount),
        downpaymentReceiptNumber: input.downpaymentReceiptNumber || null,
        totalAmount: decimal(total),
        remainingBalance: decimal(Math.max(total - input.downpaymentAmount, 0)),
        expectedReleaseDate: input.expectedReleaseDate ? new Date(input.expectedReleaseDate) : null,
        source: input.source || null,
        notes: input.notes || null,
        createdById: actor.userId,
        lines: { create: input.lines.map((line) => { const product = products.get(line.productId)!; const unit = line.finalUnitPrice ?? product.price?.toNumber() ?? 0; return { productId: product.id, productItemCode: product.itemCode, productName: product.name, quantity: line.quantity, baseUnitPrice: product.price ?? decimal(0), finalUnitPrice: decimal(unit) }; }) },
      },
      include: ORDER_INCLUDE,
    });
    if (input.downpaymentReceiptNumber) await registerReceipt(tx, input.downpaymentReceiptNumber, "CUSTOMER_ORDER_DOWNPAYMENT", { orderId: order.id, locationId, receiptBooklet: "" });
    /*
     * Handed back so the branch can attach the receipt photo straight after
     * recording the money, instead of going to Accounting's queue to find the
     * row. Nothing depends on it: it stays optional.
     */
    let downpaymentPaymentId: string | null = null;
    if (input.downpaymentAmount > 0 && input.downpaymentReceiptNumber) {
      downpaymentPaymentId = (await recordPayment(tx, {
        kind: "ORDER_DOWNPAYMENT",
        locationId,
        customerId,
        orderId: order.id,
        amount: input.downpaymentAmount,
        method: (input.downpaymentMethod ?? "CASH") as PaymentMethod,
        receiptNumber: input.downpaymentReceiptNumber,
        salesperson: {
          id: salesperson.id,
          name: salesperson.fullName,
          locationId: salesperson.location.id,
          locationCode: salesperson.location.code,
          locationName: salesperson.location.name,
        },
        collectedById: actor.userId,
      })).id;
    }
    if (input.downpaymentAmount > 0) {
      // The booking entry is derived from the order row, whose downpayment total
      // moves with later payments, so the first one needs its own fixed record.
      await recordAuditLog({
        category: "Customer Orders",
        action: "Payment Recorded",
        actorId: actor.userId,
        reference: order.reference,
        locationLabel: order.location.name,
        details: `₱${input.downpaymentAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} downpayment by ${order.customer.name}${input.downpaymentReceiptNumber ? ` on receipt ${input.downpaymentReceiptNumber}` : ""}. Balance ₱${order.remainingBalance.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        items: order.lines.map((line) => ({ name: `${line.productItemCode} ${line.productName}`, quantity: line.quantity, amount: `₱${line.finalUnitPrice.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` })),
        facts: [
          { label: "Customer", value: order.customer.name },
          { label: "Payment", value: `₱${input.downpaymentAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
          { label: "Receipt number", value: input.downpaymentReceiptNumber ?? "-" },
          { label: "Order total", value: `₱${order.totalAmount.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
          { label: "Balance after payment", value: `₱${order.remainingBalance.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
        ],
      }, tx);
    }
    return { ...serializeOrder(order), downpaymentPaymentId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerSalesError("DUPLICATE_RECEIPT", "Manual receipt number already exists", 409);
    throw error;
  }
}

const ORDER_INCLUDE = { customer: true, location: true, lines: true } as const;

export async function listCustomerOrders(actor: AuthContext) {
  assertCapability(actor, "customer-orders:view");
  const where = { locationId: locationIdFilter(actor) };
  const orders = await prisma.customerOrder.findMany({ where, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE, take: 200 });
  return orders.map(serializeOrder);
}

// List screens stay capped at 200 recent rows; a PDF copy pulls the whole
// filtered set within one bounded request.
const EXPORT_TAKE = 5000;

export type CustomerOrderExportFilters = {
  orderNo?: string;
  customer?: string;
  status?: string;
  paymentStatus?: string;
};

/**
 * Every authorized order matching the filters the screen applies. Status and
 * payment status are derived labels, so they are matched after serialization.
 */
export async function exportCustomerOrders(actor: AuthContext, filters: CustomerOrderExportFilters) {
  assertCapability(actor, "customer-orders:view");
  const orderNo = filters.orderNo?.trim();
  const customer = filters.customer?.trim();
  const where: Prisma.CustomerOrderWhereInput = {
    locationId: locationIdFilter(actor),
    reference: orderNo ? { contains: orderNo, mode: "insensitive" } : undefined,
    customer: customer ? { is: { name: { contains: customer, mode: "insensitive" } } } : undefined,
  };
  const orders = await prisma.customerOrder.findMany({ where, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE, take: EXPORT_TAKE });
  const status = filters.status && filters.status !== "all" ? filters.status : null;
  const paymentStatus = filters.paymentStatus && filters.paymentStatus !== "all" ? filters.paymentStatus : null;
  return orders
    .map(serializeOrder)
    .filter((order) => (!status || order.status === status) && (!paymentStatus || order.paymentStatus === paymentStatus));
}

/** Every authorized posted direct sale matching the screen's search keyword. */
export async function exportDirectSales(actor: AuthContext, filters: { search?: string }) {
  assertCapability(actor, "sales:view");
  const search = filters.search?.trim();
  const where: Prisma.SaleWhereInput = {
    locationId: locationIdFilter(actor),
    status: "POSTED",
    orderId: null,
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" as const } },
            { manualReceiptNumber: { contains: search, mode: "insensitive" as const } },
            { customer: { is: { name: { contains: search, mode: "insensitive" as const } } } },
            { location: { is: { name: { contains: search, mode: "insensitive" as const } } } },
            { salespersonName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const sales = await prisma.sale.findMany({ where, orderBy: { postedAt: "desc" }, include: SALE_INCLUDE, take: EXPORT_TAKE });
  return sales.map(serializeSaleWithCorrection);
}

export async function getCustomerOrderById(actor: AuthContext, id: string) {
  assertCapability(actor, "customer-orders:view");
  const order = await prisma.customerOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
  assertOperationalResource(actor, order.locationId);
  return serializeOrder(order);
}

export async function updateCustomerOrderSalesperson(
  actor: AuthContext,
  id: string,
  input: z.infer<typeof customerOrderSalespersonSchema>,
) {
  assertAnyCapability(actor, ["customer-orders:create", "customer-orders:release"]);
  assertOperationalActor(actor);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CustomerOrder" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.customerOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
    assertOperationalResource(actor, order.locationId);
    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw new CustomerSalesError("INVALID_STATUS", "Completed or cancelled orders cannot change salesperson", 409);
    }
    const salesperson = await resolveActiveSalespersonForTransaction(tx, actor, input.salespersonId, order.locationId);
    if (!salesperson) throw new CustomerSalesError("INVALID_SALESPERSON", "Select an active salesperson within your authorized locations", 409);
    if (order.salespersonId === salesperson.id) return serializeOrder(order);
    const changedAt = new Date();
    await tx.customerOrderSalespersonEvent.create({
      data: {
        orderId: order.id,
        previousSalespersonId: order.salespersonId,
        previousSalespersonName: order.salespersonName,
        previousSalespersonLocationId: order.salespersonLocationId,
        previousSalespersonLocationCode: order.salespersonLocationCode,
        previousSalespersonLocationName: order.salespersonLocationName,
        newSalespersonId: salesperson.id,
        newSalespersonName: salesperson.fullName,
        newSalespersonLocationId: salesperson.location.id,
        newSalespersonLocationCode: salesperson.location.code,
        newSalespersonLocationName: salesperson.location.name,
        actorId: actor.userId,
        occurredAt: changedAt,
      },
    });
    const reassigned = await tx.customerOrder.update({
      where: { id },
      data: {
        salespersonId: salesperson.id,
        salespersonName: salesperson.fullName,
        salespersonLocationId: salesperson.location.id,
        salespersonLocationCode: salesperson.location.code,
        salespersonLocationName: salesperson.location.name,
        salespersonUpdatedById: actor.userId,
        salespersonUpdatedAt: changedAt,
      },
      include: ORDER_INCLUDE,
    });
    await recordAuditLog({
      category: "Customer Orders",
      action: "Customer Order Salesperson Changed",
      actorId: actor.userId,
      reference: reassigned.reference,
      locationLabel: reassigned.location.name,
      details: `${order.salespersonName ?? "Not recorded"} to ${salesperson.fullName}`,
      facts: [
        { label: "Previous branch", value: order.salespersonLocationName ?? "-" },
        { label: "New branch", value: salesperson.location.name },
      ],
    }, tx);
    return serializeOrder(reassigned);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const saleSalespersonSchema = z.object({
  salespersonId: z.string().trim().min(1, "Select a salesperson"),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Re-credits a posted sale to the right salesperson. The sale keeps its money
 * and its stock movement untouched; only who gets credit changes. The payment
 * ledger row carries its own salesperson snapshot and is what the salesperson
 * report reads, so it has to move with the sale or the two disagree.
 */
export async function changeSaleSalesperson(
  actor: AuthContext,
  id: string,
  input: z.infer<typeof saleSalespersonSchema>,
) {
  assertCapability(actor, "sales:salesperson:update");
  assertOperationalActor(actor);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${id} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    if (sale.status !== "POSTED") {
      throw new CustomerSalesError("INVALID_STATUS", "A voided sale cannot change salesperson", 409);
    }
    const salesperson = await resolveActiveSalespersonForTransaction(tx, actor, input.salespersonId, sale.locationId);
    if (!salesperson) throw new CustomerSalesError("INVALID_SALESPERSON", "Select an active salesperson within your authorized locations", 409);
    if (sale.salespersonId === salesperson.id) return serializeSaleWithCorrection(sale);

    const changedAt = new Date();
    await tx.saleSalespersonEvent.create({
      data: {
        saleId: sale.id,
        previousSalespersonId: sale.salespersonId,
        previousSalespersonName: sale.salespersonName,
        previousSalespersonLocationId: sale.salespersonLocationId,
        previousSalespersonLocationCode: sale.salespersonLocationCode,
        previousSalespersonLocationName: sale.salespersonLocationName,
        newSalespersonId: salesperson.id,
        newSalespersonName: salesperson.fullName,
        newSalespersonLocationId: salesperson.location.id,
        newSalespersonLocationCode: salesperson.location.code,
        newSalespersonLocationName: salesperson.location.name,
        reason: input.reason ?? null,
        actorId: actor.userId,
        occurredAt: changedAt,
      },
    });

    const snapshot = {
      salespersonId: salesperson.id,
      salespersonName: salesperson.fullName,
      salespersonLocationId: salesperson.location.id,
      salespersonLocationCode: salesperson.location.code,
      salespersonLocationName: salesperson.location.name,
    };
    const updated = await tx.sale.update({ where: { id }, data: snapshot, include: SALE_INCLUDE });
    await tx.payment.updateMany({ where: { saleId: sale.id }, data: snapshot });

    await recordAuditLog({
      category: "Sales",
      action: "Sale Salesperson Corrected",
      actorId: actor.userId,
      reference: sale.manualReceiptNumber,
      locationLabel: sale.location.name,
      details: `${sale.salespersonName ?? "Unassigned"} to ${salesperson.fullName}`,
      facts: [
        { label: "Receipt", value: sale.manualReceiptNumber },
        { label: "Previously credited", value: sale.salespersonName ?? "Unassigned" },
        { label: "Now credited", value: salesperson.fullName },
        ...(input.reason ? [{ label: "Reason", value: input.reason }] : []),
      ],
    });
    return serializeSaleWithCorrection(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reserveCustomerOrder(actor: AuthContext, id: string) {
  assertCapability(actor, "customer-orders:reserve");
  assertOperationalActor(actor);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CustomerOrder" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.customerOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
    assertOperationalResource(actor, order.locationId);
    if (order.status !== "WAITING_STOCK") throw new CustomerSalesError("INVALID_STATUS", "Only waiting-stock orders can be reserved", 409);

    const productIds = order.lines.map((line) => line.productId).sort();
    await tx.$queryRaw`SELECT id FROM "InventoryBalance" WHERE "locationId" = ${order.locationId} AND "productId" IN (${Prisma.join(productIds)}) ORDER BY "productId" FOR UPDATE`;
    await reserveLines(tx, order.locationId, order.lines);

    return serializeOrder(await tx.customerOrder.update({ where: { id: order.id }, data: { status: "RESERVED" }, include: ORDER_INCLUDE }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function releaseCustomerOrder(actor: AuthContext, id: string, input: z.infer<typeof releaseOrderSchema>) {
  assertCapability(actor, "customer-orders:release");
  assertOperationalActor(actor);
  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CustomerOrder" WHERE id = ${id} FOR UPDATE`;
    const order = await tx.customerOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
    assertOperationalResource(actor, order.locationId);
    if (order.status !== "RESERVED" && order.status !== "READY_FOR_RELEASE") throw new CustomerSalesError("INVALID_STATUS", "Only reserved orders can be released", 409);
    if (!order.salespersonId || !order.salespersonName || !order.salespersonLocationId || !order.salespersonLocationCode || !order.salespersonLocationName) {
      throw new CustomerSalesError("INVALID_SALESPERSON", "Assign an active salesperson before releasing this order", 409);
    }
    const salesperson = await resolveActiveSalespersonForTransaction(tx, actor, order.salespersonId, order.locationId);
    if (!salesperson) throw new CustomerSalesError("INVALID_SALESPERSON", "Assign an active salesperson within your authorized locations before release", 409);
    if (input.amountPaid !== order.remainingBalance.toNumber()) throw new CustomerSalesError("INVALID_BALANCE", "Amount paid must match remaining balance", 400);
    /*
     * Money decides whether there is a receipt. A balance settled at release is
     * collected now and needs one; an order already paid in full takes nothing,
     * and its money was receipted and verified when it came in.
     */
    const collectsMoney = order.remainingBalance.toNumber() > 0;
    if (collectsMoney && !input.finalReceiptNumber) {
      throw new CustomerSalesError("RECEIPT_REQUIRED", "This release collects the remaining balance, so it needs a receipt number", 400);
    }
    if (!collectsMoney && input.finalReceiptNumber) {
      throw new CustomerSalesError("RECEIPT_NOT_EXPECTED", "This order is already paid in full, so releasing it issues no receipt", 400);
    }
    /*
     * With no receipt the sale still needs an identity of its own, and the order
     * reference is unique, so it stands in without pretending to be a receipt
     * number. receiptIssued is what says which it is.
     */
    const saleReceiptNumber = input.finalReceiptNumber ?? order.reference;
    const releasedAt = new Date();
    await releaseReservedLines(tx, order.locationId, order.lines);
    const sale = await tx.sale.create({ data: { reference: `SALE-${randomUUID()}`, manualReceiptNumber: saleReceiptNumber, receiptIssued: collectsMoney, receiptBooklet: "", locationId: order.locationId, customerId: order.customerId, orderId: order.id, salespersonId: order.salespersonId, salespersonName: order.salespersonName, salespersonLocationId: order.salespersonLocationId, salespersonLocationCode: order.salespersonLocationCode, salespersonLocationName: order.salespersonLocationName, paymentMethod: input.paymentMethod as PaymentMethod, totalAmount: order.totalAmount, discountAmount: order.discountAmount, amountPaid: decimal(input.amountPaid), notes: input.notes || null, postedById: actor.userId, lines: { create: order.lines.map((line) => ({ productId: line.productId, productItemCode: line.productItemCode, productName: line.productName, quantity: line.quantity, unitPrice: line.finalUnitPrice })) }, accountingReview: { create: collectsMoney ? {} : {
      /*
       * Nothing to verify: no receipt was written, and the money this order
       * collected was verified on the receipts that brought it in. Leaving it
       * unverified would park a sale in Accounting's queue that no one can ever
       * compare against anything.
       */
      status: "VERIFIED",
      verifiedAt: releasedAt,
      reviewedById: actor.userId,
      reviewedAt: releasedAt,
      notes: "No receipt issued: the order was paid in full before release.",
    } } } });
    const warrantyProducts = await tx.product.findMany({ where: { id: { in: order.lines.map((line) => line.productId) } }, select: { id: true, warrantyDurationMonths: true } });
    for (const product of warrantyProducts) await tx.saleLine.updateMany({ where: { saleId: sale.id, productId: product.id }, data: { warrantyDurationMonths: product.warrantyDurationMonths } });
    if (collectsMoney) {
      await registerReceipt(tx, saleReceiptNumber, "CUSTOMER_ORDER_FINAL", { orderId: order.id, saleId: sale.id, locationId: order.locationId, receiptBooklet: "" });
    }
    // Only the balance settled at release goes on this row. The downpayment and
    // any later payment already have their own rows, so the order's ledger adds
    // up to its total exactly once. The row is written even when the customer
    // already paid in full and the balance is zero, because the release receipt
    // is the document that hands the goods over: it is what carries the units
    // sold into the report, and it still has to be verified as a sale receipt.
    await recordPayment(tx, {
      kind: "ORDER_FINAL",
      locationId: order.locationId,
      customerId: order.customerId,
      orderId: order.id,
      saleId: sale.id,
      amount: input.amountPaid,
      method: input.paymentMethod as PaymentMethod,
      receiptNumber: saleReceiptNumber,
      salesperson: {
        id: order.salespersonId,
        name: order.salespersonName,
        locationId: order.salespersonLocationId,
        locationCode: order.salespersonLocationCode,
        locationName: order.salespersonLocationName,
      },
      collectedById: actor.userId,
      mirrorsSaleReview: true,
    });
    // The ledger row mirrors the sale's review, so a settled review has to be
    // carried onto it or the report would hold the release back as unverified.
    if (!collectsMoney) {
      await syncSalePaymentReview(tx, sale.id, { status: "VERIFIED", verifiedAt: releasedAt, reviewedById: actor.userId, reviewedAt: releasedAt });
    }
    for (const line of order.lines) await tx.inventoryMovement.create({ data: { productId: line.productId, locationId: order.locationId, quantity: -line.quantity, type: "CUSTOMER_ORDER_RELEASE", actorId: actor.userId, reference: saleReceiptNumber, remarks: `Released order ${order.reference}` } });
    const updated = await tx.customerOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", finalReceiptNumber: input.finalReceiptNumber ?? null, remainingBalance: decimal(0), releasedById: actor.userId, releasedAt }, include: ORDER_INCLUDE });
    await recordAuditLog({
      category: "Customer Orders",
      action: "Customer Order Released",
      actorId: actor.userId,
      reference: order.reference,
      locationLabel: updated.location.name,
      details: collectsMoney
        ? `Released against receipt ${saleReceiptNumber}, collecting ${input.amountPaid}`
        : "Released with no receipt: the order was paid in full before release",
      items: order.lines.map((line) => ({ name: `${line.productItemCode} ${line.productName}`, quantity: line.quantity })),
      facts: [
        { label: "Sale", value: sale.reference },
        { label: "Customer", value: updated.customer.name },
        { label: "Salesperson", value: order.salespersonName ?? "-" },
        { label: "Order total", value: String(order.totalAmount.toNumber()) },
        { label: "Collected at release", value: String(input.amountPaid) },
      ],
    }, tx);
    return serializeOrder(updated);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerSalesError("DUPLICATE_RECEIPT", "Manual receipt number already exists", 409);
    throw error;
  }
}

export async function cancelCustomerOrder(actor: AuthContext, id: string, input: z.infer<typeof cancelOrderSchema>) {
  assertOperationalActor(actor);
  return prisma.$transaction(async (tx) => {
    const order = await tx.customerOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
    assertOperationalResource(actor, order.locationId);
    if (order.status === "COMPLETED" || order.status === "CANCELLED") throw new CustomerSalesError("INVALID_STATUS", "Completed or cancelled orders cannot be cancelled", 409);
    if (order.downpaymentAmount.toNumber() > 0) {
      try {
        assertCapability(actor, "customer-orders:cancel-paid");
      } catch (error) {
        if (error instanceof AuthorizationError) {
          throw new CustomerSalesError("DP_CANCEL_ADMIN_ONLY", "Cancelling a paid order requires the cancel-paid grant", 403);
        }
        throw error;
      }
    } else {
      assertCapability(actor, "customer-orders:cancel");
    }
    if (order.downpaymentAmount.toNumber() > 0 && !input.note) throw new CustomerSalesError("CANCELLATION_NOTE_REQUIRED", "A cancellation note is required for an order with a downpayment", 400);
    if (order.status === "RESERVED" || order.status === "READY_FOR_RELEASE") {
      for (const line of order.lines) await tx.inventoryBalance.update({ where: { locationId_productId: { locationId: order.locationId, productId: line.productId } }, data: { reserved: { decrement: line.quantity }, version: { increment: 1 } } });
    }

    // Money already collected. Forfeited, it stays revenue, which is what this
    // workflow always did. Refunded, it goes back and the reports subtract it
    // on today's date, leaving any period already reported untouched.
    if (input.settlement === "REFUNDED") {
      assertCapability(actor, "customer-orders:refund");
      const collected = await tx.payment.aggregate({
        where: { orderId: id, status: "ACTIVE" },
        _sum: { amount: true },
      });
      const collectedAmount = collected._sum.amount?.toNumber() ?? 0;
      if (collectedAmount <= 0) {
        throw new CustomerSalesError("NOTHING_COLLECTED", "This order has no collected money to refund", 409);
      }
      const refundAmount = input.refundAmount ?? 0;
      if (refundAmount > collectedAmount) {
        throw new CustomerSalesError(
          "REFUND_EXCEEDS_COLLECTED",
          `This order only collected ${collectedAmount.toFixed(2)}`,
          409,
        );
      }
      const refund = await tx.refund.create({
        data: {
          reference: `REF-${randomUUID()}`,
          kind: "CANCELLED_ORDER",
          locationId: order.locationId,
          customerId: order.customerId,
          orderId: order.id,
          amount: decimal(refundAmount),
          method: (input.refundMethod ?? "CASH") as PaymentMethod,
          acknowledgementNumber: input.acknowledgementNumber!,
          reason: input.note!,
          salespersonId: order.salespersonId,
          salespersonName: order.salespersonName,
          salespersonLocationId: order.salespersonLocationId,
          salespersonLocationCode: order.salespersonLocationCode,
          salespersonLocationName: order.salespersonLocationName,
          refundedById: actor.userId,
        },
      });
      await recordAuditLog({
        category: "Customer Orders",
        action: "Cancelled Order Refunded",
        actorId: actor.userId,
        reference: order.reference,
        details: `${refundAmount.toFixed(2)} of ${collectedAmount.toFixed(2)} collected was handed back`,
        facts: [
          { label: "Refund reference", value: refund.reference },
          { label: "Collected on this order", value: collectedAmount.toFixed(2) },
          { label: "Handed back", value: refundAmount.toFixed(2) },
          { label: "Acknowledgement slip", value: input.acknowledgementNumber! },
          { label: "Reason", value: input.note! },
        ],
      });
    }

    return serializeOrder(await tx.customerOrder.update({ where: { id }, data: { status: "CANCELLED", cancellationNote: input.note || null, cancelledById: actor.userId, cancelledAt: new Date() }, include: ORDER_INCLUDE }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recordCustomerOrderPayment(
  actor: AuthContext,
  id: string,
  input: z.infer<typeof orderPaymentSchema>,
) {
  assertCapability(actor, "customer-orders:record-payment");
  assertOperationalActor(actor);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CustomerOrder" WHERE id = ${id} FOR UPDATE`;
      const order = await tx.customerOrder.findUnique({
        where: { id },
        include: ORDER_INCLUDE,
      });
      if (!order) {
        throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
      }
      assertOperationalResource(actor, order.locationId);
      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        throw new CustomerSalesError(
          "INVALID_STATUS",
          "Completed or cancelled orders cannot accept payments",
          409,
        );
      }
      const remainingBalance = order.remainingBalance.toNumber();
      if (input.amount > remainingBalance) {
        throw new CustomerSalesError(
          "INVALID_PAYMENT",
          "Payment cannot exceed the remaining balance",
          400,
        );
      }

      await registerReceipt(tx, input.reference, "CUSTOMER_ORDER_PAYMENT", {
        orderId: order.id,
        locationId: order.locationId,
        receiptBooklet: "",
      });
      // Handed back so the branch can attach the receipt photo straight away.
      const payment = await recordPayment(tx, {
        kind: "ORDER_PAYMENT",
        locationId: order.locationId,
        customerId: order.customerId,
        orderId: order.id,
        amount: input.amount,
        method: (input.method ?? "CASH") as PaymentMethod,
        receiptNumber: input.reference,
        salesperson: {
          id: order.salespersonId,
          name: order.salespersonName,
          locationId: order.salespersonLocationId,
          locationCode: order.salespersonLocationCode,
          locationName: order.salespersonLocationName,
        },
        collectedById: actor.userId,
      });
      const currentDownpayment = order.downpaymentAmount.toNumber();
      const updated = await tx.customerOrder.update({
        where: { id: order.id },
        data: {
          downpaymentAmount: decimal(currentDownpayment + input.amount),
          remainingBalance: decimal(remainingBalance - input.amount),
          downpaymentReceiptNumber:
            order.downpaymentReceiptNumber ?? input.reference,
          type:
            order.type === "RESERVATION_NO_DP"
              ? "RESERVATION_WITH_DP"
              : order.type,
        },
        include: ORDER_INCLUDE,
      });
      await recordAuditLog({
        category: "Customer Orders",
        action: "Payment Recorded",
        actorId: actor.userId,
        reference: order.reference,
        locationLabel: updated.location.name,
        details: `₱${input.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} paid by ${updated.customer.name} on receipt ${input.reference}. Balance ₱${updated.remainingBalance.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        items: updated.lines.map((line) => ({ name: `${line.productItemCode} ${line.productName}`, quantity: line.quantity, amount: `₱${line.finalUnitPrice.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` })),
        facts: [
          { label: "Customer", value: updated.customer.name },
          { label: "Payment", value: `₱${input.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
          { label: "Receipt number", value: input.reference },
          { label: "Total paid to date", value: `₱${updated.downpaymentAmount.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
          { label: "Order total", value: `₱${updated.totalAmount.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
          { label: "Balance after payment", value: `₱${updated.remainingBalance.toNumber().toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
        ],
      }, tx);
      return { ...serializeOrder(updated), paymentId: payment.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new CustomerSalesError(
        "DUPLICATE_RECEIPT",
        "Payment reference already exists",
        409,
      );
    }
    throw error;
  }
}

/**
 * Removes a voided sale so the branch can encode it again.
 *
 * Voiding already undid the money and put the stock back; what is left is a
 * record of a receipt that should not have been entered, and a receipt number
 * the branch cannot reuse while it is still registered. This clears both.
 *
 * It refuses a sale that another record of its own stands on -- a refund, a
 * customer warranty, a backjob, or the replacement sale that records this one
 * as what it replaced -- because deleting the row would leave that record
 * describing nothing.
 */
export async function deleteVoidedSale(actor: AuthContext, saleId: string) {
  assertCapability(actor, "sales:delete-voided");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true, reference: true, manualReceiptNumber: true, status: true, locationId: true,
        totalAmount: true,
        location: { select: { name: true } },
        corrections: { select: { manualReceiptNumber: true } },
        _count: { select: { lines: true, refunds: true, warranties: true, originalBackjobs: true, chargeBackjobs: true } },
      },
    });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    if (sale.status !== "VOIDED") {
      throw new CustomerSalesError("INVALID_STATUS", "Only a voided sale can be deleted. Void it first.", 409);
    }

    const standingOn: Array<[number, string]> = [
      [sale._count.refunds, "refund(s) recording money handed back against it"],
      [sale._count.warranties, "customer warranty case(s) raised against it"],
      [sale._count.originalBackjobs, "backjob(s) naming it as the original sale"],
      [sale._count.chargeBackjobs, "backjob(s) charged to it"],
    ];
    for (const [count, description] of standingOn) {
      if (count > 0) {
        throw new CustomerSalesError(
          "SALE_IN_USE",
          `${count} ${description} still point at this sale, so it cannot be deleted.`,
          409,
        );
      }
    }
    if (sale.corrections.length > 0) {
      throw new CustomerSalesError(
        "SALE_IN_USE",
        `The replacement receipt ${sale.corrections.map((other) => other.manualReceiptNumber).join(", ")} records this sale as what it replaced, so it cannot be deleted.`,
        409,
      );
    }

    /*
     * SaleSalespersonEvent refuses its own deletion through a trigger. The
     * trigger steps aside for this setting rather than being disabled, so it
     * stays armed against every other connection meanwhile.
     */
    await tx.$executeRaw`SELECT set_config('chezcar.operational_data_reset', 'true', true)`;
    await tx.saleCorrectionRequest.deleteMany({ where: { saleId: sale.id } });
    await tx.saleSalespersonEvent.deleteMany({ where: { saleId: sale.id } });
    await tx.saleAccountingReview.deleteMany({ where: { saleId: sale.id } });
    await tx.saleLine.deleteMany({ where: { saleId: sale.id } });
    await tx.payment.deleteMany({ where: { saleId: sale.id } });
    // The registry holds the number itself; left behind, it stays taken and the
    // branch cannot write that receipt again.
    await tx.manualReceipt.deleteMany({ where: { saleId: sale.id } });
    await tx.sale.delete({ where: { id: sale.id } });

    await recordAuditLog({
      category: "Receipt Verification",
      action: "Voided Sale Deleted",
      actorId: actor.userId,
      reference: sale.manualReceiptNumber,
      locationLabel: sale.location.name,
      details: `Deleted the voided sale ${sale.reference} so the receipt number can be used again`,
      facts: [
        { label: "Lines removed", value: String(sale._count.lines) },
        { label: "Recorded total", value: String(sale.totalAmount.toNumber()) },
      ],
    }, tx);

    return { deleted: true, manualReceiptNumber: sale.manualReceiptNumber };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createDirectSale(actor: AuthContext, rawInput: z.input<typeof directSaleSchema>) {
  assertCapability(actor, "sales:post");
  return createDirectSaleForActor(actor, rawInput);
}

export async function createOfflineDirectSale(actor: AuthContext, rawInput: z.input<typeof directSaleSchema>) {
  assertCapability(actor, "offline-sales:sync");
  return createDirectSaleForActor(actor, rawInput);
}

async function createDirectSaleForActor(actor: AuthContext, rawInput: z.input<typeof directSaleSchema>) {
  const input = directSaleSchema.parse(rawInput);
  const locationId = operationalLocationId(actor, input.locationId);
  if (!locationId) throw new CustomerSalesError("LOCATION_REQUIRED", "Select a branch before posting a sale", 400);
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) throw new CustomerSalesError("INVALID_LINES", "A product may appear only once", 400);
  const soldAt = resolveSoldAt(input.soldAt);
  try {
    return await prisma.$transaction(async (tx) => {
    const location = await findActiveBranch(locationId, tx);
    if (!location) throw new CustomerSalesError("INVALID_LOCATION", "Select an active branch", 400);
    const products = await activeProducts(tx, productIds, locationId);
    const customerId = input.customerId ?? (input.customer ? await resolveCustomer(tx, actor, input.customer) : null);
    const salesperson = await resolveActiveSalespersonForTransaction(tx, actor, input.salespersonId, locationId);
    if (!salesperson) throw new CustomerSalesError("INVALID_SALESPERSON", "Select an active salesperson within your authorized locations", 409);
    const subtotal = input.lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice ?? products.get(line.productId)!.price?.toNumber() ?? 0), 0);
    if (input.discountAmount > subtotal) throw new CustomerSalesError("INVALID_DISCOUNT", "Discount cannot exceed sale subtotal", 400);
    const total = subtotal - input.discountAmount;
    if (input.amountPaid !== total) throw new CustomerSalesError("INVALID_PAYMENT", "Direct sale payment must match total", 400);
    await deductSaleLines(tx, locationId, input.lines);
    const sale = await tx.sale.create({ data: { reference: `SALE-${randomUUID()}`, manualReceiptNumber: input.manualReceiptNumber, receiptBooklet: input.receiptBooklet ?? "", locationId, customerId, salespersonId: salesperson.id, salespersonName: salesperson.fullName, salespersonLocationId: salesperson.location.id, salespersonLocationCode: salesperson.location.code, salespersonLocationName: salesperson.location.name, paymentMethod: input.paymentMethod as PaymentMethod, totalAmount: decimal(total), discountAmount: decimal(input.discountAmount), amountPaid: decimal(input.amountPaid), notes: input.notes || null, postedById: actor.userId, soldAt, lines: { create: input.lines.map((line) => { const product = products.get(line.productId)!; return { productId: product.id, productItemCode: product.itemCode, productName: product.name, quantity: line.quantity, unitPrice: decimal(line.unitPrice ?? product.price?.toNumber() ?? 0) }; }) }, accountingReview: { create: {} } }, include: SALE_INCLUDE });
    for (const product of products.values()) await tx.saleLine.updateMany({ where: { saleId: sale.id, productId: product.id }, data: { warrantyDurationMonths: product.warrantyDurationMonths } });
    await registerReceipt(tx, input.manualReceiptNumber, "DIRECT_SALE", { saleId: sale.id, locationId, receiptBooklet: input.receiptBooklet ?? "" });
    await recordPayment(tx, {
      kind: "DIRECT_SALE",
      locationId,
      customerId,
      saleId: sale.id,
      amount: input.amountPaid,
      method: input.paymentMethod as PaymentMethod,
      receiptNumber: input.manualReceiptNumber,
      receiptBooklet: input.receiptBooklet ?? "",
      salesperson: {
        id: salesperson.id,
        name: salesperson.fullName,
        locationId: salesperson.location.id,
        locationCode: salesperson.location.code,
        locationName: salesperson.location.name,
      },
      collectedById: actor.userId,
      // The sales reports date a receipt by this row, so a late entry has to
      // carry the day the goods were sold, not the day it was typed in.
      collectedAt: soldAt,
      mirrorsSaleReview: true,
    });
    for (const line of input.lines) await tx.inventoryMovement.create({ data: { productId: line.productId, locationId, quantity: -line.quantity, type: "DIRECT_SALE", actorId: actor.userId, reference: input.receiptBooklet ? `${input.receiptBooklet}-${input.manualReceiptNumber}` : input.manualReceiptNumber, remarks: `Direct sale ${sale.reference}` } });
    await recordAuditLog({
      category: "Sales",
      action: "Direct Sale Posted",
      actorId: actor.userId,
      reference: sale.manualReceiptNumber,
      locationLabel: sale.location.name,
      details: `${input.lines.length} line(s), total ${total}, paid ${input.amountPaid} by ${input.paymentMethod}`,
      items: sale.lines.map((line) => ({ name: `${line.productItemCode} ${line.productName}`, quantity: line.quantity, amount: String(line.unitPrice.toNumber()) })),
      facts: [
        { label: "Sale", value: sale.reference },
        { label: "Customer", value: sale.customer?.name ?? "Guest" },
        { label: "Salesperson", value: salesperson.fullName },
        { label: "Discount", value: String(input.discountAmount) },
        { label: "Sold on", value: soldAt.toISOString().slice(0, 10) },
      ],
    }, tx);
    return serializeSaleWithCorrection(sale);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerSalesError("DUPLICATE_RECEIPT", "Manual receipt number already exists", 409);
    throw error;
  }
}

const SALE_INCLUDE = {
  customer: true,
  location: true,
  lines: true,
  accountingReview: true,
  correctionRequests: {
    orderBy: { requestedAt: "desc" },
    take: 1,
    include: {
      requestedBy: { select: { name: true } },
      resolvedBy: { select: { name: true } },
    },
  },
  postedBy: { select: { name: true } },
  refunds: {
    orderBy: { refundedAt: "desc" },
    include: {
      lines: true,
      stockLocation: { select: { code: true, name: true } },
      refundedBy: { select: { name: true } },
    },
  },
} as const;

export async function listSales(actor: AuthContext) {
  assertCapability(actor, "sales:view");
  const where = { locationId: locationIdFilter(actor), status: "POSTED" as const };
  const sales = await prisma.sale.findMany({ where, orderBy: { postedAt: "desc" }, include: SALE_INCLUDE, take: 200 });
  return sales.map(serializeSaleWithCorrection);
}

export async function getDirectSalesOverview(actor: AuthContext, rawFilters: unknown = {}) {
  assertCapability(actor, "sales:view");
  /*
   * The same filters the dashboard carries, so the list opened from a metric
   * card answers for the figure that was clicked. Measured the same way too:
   * the dashboard's own window helper, and postedAt, which is the basis its
   * filtered total uses.
   */
  const filters = dashboardSalesFiltersSchema.parse(rawFilters);
  if (!actor.isOwner && (filters.salesPeriod || filters.salesBranchId)) {
    throw new AuthorizationError("Sales filters are Admin-only");
  }
  let branchLabel = "All branches";
  let locationId: Prisma.SaleWhereInput["locationId"] = locationIdFilter(actor);
  if (filters.salesBranchId) {
    const branch = (await listActiveBranches()).find((row) => row.id === filters.salesBranchId);
    if (!branch) throw new CustomerSalesError("INVALID_BRANCH", "Select an active sales branch", 400);
    locationId = branch.id;
    branchLabel = branch.name;
  }
  const now = new Date();
  const window = filters.salesPeriod ? dashboardSalesWindow(filters.salesPeriod, now) : null;
  const where = {
    locationId,
    status: "POSTED" as const,
    orderId: null,
    ...(window ? { postedAt: { gte: window.start, lte: now } } : {}),
  };
  const [sales, totals, refunds] = await prisma.$transaction([
    prisma.sale.findMany({ where, orderBy: { postedAt: "desc" }, include: SALE_INCLUDE, take: 200 }),
    prisma.sale.aggregate({
      where,
      _count: { _all: true },
      _sum: { totalAmount: true, discountAmount: true, amountPaid: true },
    }),
    // Money handed back on these same sales. A refund never edits the sale it
    // reverses, so totalling Sale.totalAmount alone keeps showing money the
    // branch no longer has.
    prisma.refund.aggregate({
      where: { kind: "POSTED_SALE", sale: where },
      _sum: { amount: true },
    }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const refundedAmount = refunds._sum.amount?.toNumber() ?? 0;
  return {
    data: sales.map(serializeSaleWithCorrection),
    summary: {
      totalSales: totals._count._all,
      totalAmount: (totals._sum.totalAmount?.toNumber() ?? 0) - refundedAmount,
      totalDiscounts: totals._sum.discountAmount?.toNumber() ?? 0,
      totalAmountPaid: (totals._sum.amountPaid?.toNumber() ?? 0) - refundedAmount,
      totalRefunded: refundedAmount,
    },
    // Said back so the page can state what it is showing rather than leaving a
    // short list looking like the whole of it.
    appliedFilter: window || filters.salesBranchId
      ? { periodLabel: window?.label ?? "All time", branchLabel }
      : null,
  };
}

function receiptDate(value: string, endOfDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + (endOfDay ? 1 : 0)));
}

function receiptVerificationWhere(
  input: z.input<typeof receiptVerificationListQuerySchema>,
  includeReviewStatus: boolean,
): Prisma.SaleWhereInput {
  const parsed = receiptVerificationListQuerySchema.parse(input);
  const where: Prisma.SaleWhereInput = {
    location: { type: "BRANCH" },
    /*
     * Releasing an order that was already paid in full writes no receipt,
     * because no money changes hands. There is no paper for Accounting to
     * compare, so such a sale has no business in this queue: it would sit here
     * forever showing evidence pending against a photo that will never exist,
     * and it would be counted as work nobody can finish. The money it settled
     * was verified on the receipts that collected it.
     */
    receiptIssued: true,
  };

  if (parsed.search) {
    where.OR = [
      { manualReceiptNumber: { contains: parsed.search, mode: "insensitive" } },
      { receiptBooklet: { contains: parsed.search, mode: "insensitive" } },
      { reference: { contains: parsed.search, mode: "insensitive" } },
      { customer: { is: { name: { contains: parsed.search, mode: "insensitive" } } } },
      { location: { name: { contains: parsed.search, mode: "insensitive" } } },
      { location: { code: { contains: parsed.search, mode: "insensitive" } } },
    ];
  }
  if (parsed.locationId) where.locationId = parsed.locationId;
  if (parsed.saleId) where.id = parsed.saleId;
  if (parsed.saleStatus !== "all") where.status = parsed.saleStatus;
  if (includeReviewStatus && parsed.reviewStatus !== "all") where.accountingReview = { status: parsed.reviewStatus };
  if (parsed.dateFrom || parsed.dateTo) {
    where.postedAt = {
      ...(parsed.dateFrom ? { gte: receiptDate(parsed.dateFrom) } : {}),
      ...(parsed.dateTo ? { lt: receiptDate(parsed.dateTo, true) } : {}),
    };
  }
  return where;
}

export async function listReceiptVerifications(actor: AuthContext, rawInput: unknown) {
  assertCapability(actor, "sales:verify:view");
  assertAccounting(actor);
  const input = receiptVerificationListQuerySchema.parse(rawInput);
  const baseWhere = receiptVerificationWhere(input, false);
  const filteredWhere = receiptVerificationWhere(input, true);
  const permittedLocationIds = locationIdFilter(actor);
  if (permittedLocationIds) {
    baseWhere.locationId = permittedLocationIds;
    filteredWhere.locationId = permittedLocationIds;
  }
  const [totalItems, unverified, verified, mismatches, missingEvidence] = await Promise.all([
    prisma.sale.count({ where: filteredWhere }),
    prisma.sale.count({ where: { ...baseWhere, status: "POSTED", accountingReview: { status: "UNVERIFIED" } } }),
    prisma.sale.count({ where: { ...baseWhere, status: "POSTED", accountingReview: { status: "VERIFIED" } } }),
    prisma.sale.count({ where: { ...baseWhere, status: "POSTED", accountingReview: { status: "MISMATCH_REPORTED" } } }),
    prisma.sale.count({
      where: {
        ...baseWhere,
        status: "POSTED",
        accountingReview: { receiptPhotoKey: null },
        correctionRequests: { none: { status: "PENDING" } },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / input.pageSize));
  const page = Math.min(input.page, totalPages);
  const sales = await prisma.sale.findMany({
    where: filteredWhere,
    orderBy: { postedAt: "desc" },
    skip: (page - 1) * input.pageSize,
    take: input.pageSize,
    include: SALE_INCLUDE,
  });

  return {
    data: sales.map(serializeSaleWithCorrection),
    meta: { page, pageSize: input.pageSize, totalItems, totalPages, unverified, verified, mismatches, missingEvidence },
  };
}

export async function getSaleById(actor: AuthContext, saleId: string) {
  assertCapability(actor, "sales:view");
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE });
  if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
  assertOperationalResource(actor, sale.locationId);
  return serializeSaleWithCorrection(sale);
}

export async function reportSaleCorrection(
  actor: AuthContext,
  saleId: string,
  rawInput: z.input<typeof branchSaleCorrectionRequestSchema>,
) {
  assertCapability(actor, "sales:correction:request");
  const input = branchSaleCorrectionRequestSchema.parse(rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          accountingReview: true,
          correctionRequests: { where: { status: "PENDING" }, take: 1 },
        },
      });
      if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
      assertOperationalResource(actor, sale.locationId);
      if (sale.orderId) {
        throw new CustomerSalesError("INVALID_SALE_SOURCE", "Only direct sales can be reported through this workflow", 409);
      }
      if (sale.status !== "POSTED") {
        throw new CustomerSalesError("INVALID_STATE", "Only posted direct sales can be reported", 409);
      }
      if (sale.accountingReview?.status === "MISMATCH_REPORTED" && !sale.accountingReview.resolvedAt) {
        throw new CustomerSalesError("INVALID_STATE", "This sale already has an unresolved receipt mismatch", 409);
      }
      if (sale.correctionRequests.length > 0) {
        throw new CustomerSalesError("CORRECTION_ALREADY_PENDING", "A correction request is already pending for this sale", 409);
      }

      const request = await tx.saleCorrectionRequest.create({
        data: {
          saleId: sale.id,
          reason: input.reason,
          note: input.note,
          requestedById: actor.userId,
        },
        include: {
          requestedBy: { select: { name: true } },
          resolvedBy: { select: { name: true } },
        },
      });
      const resolvers = await saleCorrectionResolvers(tx, sale.locationId);
      await createNotifications(tx, resolvers.map(({ id: userId }) => ({
        userId,
        title: "Sale correction requested",
        description: `${sale.manualReceiptNumber}: Branch reported ${input.reason.toLowerCase().replaceAll("_", " ")}. Inventory remains deducted until Admin resolves the request.`,
        type: "WARNING" as const,
        relatedType: "SALE" as const,
        relatedId: sale.id,
        relatedReference: sale.reference,
      })));
      return serializeSaleCorrectionRequest(request);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CustomerSalesError("CORRECTION_ALREADY_PENDING", "A correction request is already pending for this sale", 409);
    }
    throw error;
  }
}

export async function resolveSaleCorrection(
  actor: AuthContext,
  saleId: string,
  rawInput: z.input<typeof saleCorrectionResolutionSchema>,
) {
  assertCapability(actor, "sales:void-replace");
  const input = saleCorrectionResolutionSchema.parse(rawInput);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: true,
        correctionRequests: {
          where: { status: "PENDING" },
          orderBy: { requestedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    if (sale.orderId) {
      throw new CustomerSalesError("INVALID_SALE_SOURCE", "Only direct sales can use this correction workflow", 409);
    }
    if (sale.status !== "POSTED") {
      throw new CustomerSalesError("INVALID_STATE", "Only posted direct sales can be resolved", 409);
    }
    const request = sale.correctionRequests[0];
    if (!request) {
      throw new CustomerSalesError("CORRECTION_NOT_PENDING", "No pending correction request was found", 409);
    }
    if (request.id !== input.correctionRequestId) {
      throw new CustomerSalesError("STALE_CORRECTION_REQUEST", "The correction request changed; reload before resolving it", 409);
    }
    if (
      input.action === "VOID_SALE" &&
      !["ACCIDENTAL_SUBMISSION", "DUPLICATE_SUBMISSION", "SALE_DID_NOT_HAPPEN"].includes(request.reason)
    ) {
      throw new CustomerSalesError(
        "VOID_REQUIRES_NONSALE_REASON",
        "Wrong-information and other reports must use receipt verification and void-and-replace when a real sale occurred",
        409,
      );
    }

    const now = new Date();
    if (input.action === "VOID_SALE") {
      await updateSaleInventory(
        tx,
        sale.locationId,
        sale.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        "reverse",
        actor.userId,
        `VOID-${sale.reference}`,
        `Admin-approved reversal for correction request ${request.id}`,
      );
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: "VOIDED", correctedById: actor.userId, correctedAt: now },
      });
      await voidSalePayment(tx, sale.id, `Correction request ${request.id} was approved`, actor.userId);
    }

    const updated = await tx.saleCorrectionRequest.update({
      where: { id: request.id },
      data: {
        status: "RESOLVED",
        resolution: input.action === "VOID_SALE" ? "VOIDED" : "KEPT",
        resolutionNote: input.note,
        resolvedById: actor.userId,
        resolvedAt: now,
      },
      include: {
        requestedBy: { select: { name: true } },
        resolvedBy: { select: { name: true } },
      },
    });
    const recipientIds = new Set([request.requestedById, sale.postedById]);
    await createNotifications(tx, Array.from(recipientIds).map((userId) => ({
      userId,
      title: input.action === "VOID_SALE" ? "Sale correction approved" : "Sale correction dismissed",
      description: input.action === "VOID_SALE"
        ? `${sale.manualReceiptNumber} was voided and its inventory deduction was reversed.`
        : `${sale.manualReceiptNumber} remains posted. Admin did not approve a reversal.`,
      type: input.action === "VOID_SALE" ? "SUCCESS" as const : "INFO" as const,
      relatedType: "SALE" as const,
      relatedId: sale.id,
      relatedReference: sale.reference,
    })));
    return {
      action: input.action,
      saleId: sale.id,
      saleStatus: input.action === "VOID_SALE" ? "VOIDED" as const : "POSTED" as const,
      correctionRequest: serializeSaleCorrectionRequest(updated),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reviewSale(actor: AuthContext, saleId: string, input: z.infer<typeof accountingReviewSchema>) {
  assertCapability(actor, "sales:verify");
  assertCapability(actor, "sales:evidence:view");
  assertAccounting(actor);
  assertUniqueComparisonLines(input.comparison);
  return prisma.$transaction(async (tx) => {
    // Lock sale and review for Serializable safety
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        accountingReview: true,
        lines: true,
        correctionRequests: { where: { status: "PENDING" }, take: 1 },
      },
    });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    if (sale.status !== "POSTED") throw new CustomerSalesError("INVALID_STATE", "Only posted sales can be verified", 409);
    const review = sale.accountingReview ?? await tx.saleAccountingReview.findUnique({ where: { saleId } });
    if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    // Lock review row as well
    await tx.$queryRaw`SELECT id FROM "SaleAccountingReview" WHERE id = ${review.id} FOR UPDATE`;
    const freshReview = await tx.saleAccountingReview.findUnique({ where: { id: review.id } });
    if (!freshReview) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    if (freshReview.status !== "UNVERIFIED") throw new CustomerSalesError("INVALID_STATE", "Only unverified sales can be reviewed", 409);
    if (sale.correctionRequests.length > 0) {
      throw new CustomerSalesError("CORRECTION_PENDING", "Resolve the branch correction request before reviewing this receipt", 409);
    }
    if (!freshReview.receiptPhotoKey) {
      throw new CustomerSalesError("RECEIPT_EVIDENCE_REQUIRED", "Attach the handwritten receipt photo before reviewing this sale", 409);
    }
    const differences = compareReceipt(sale, input.comparison);
    if (input.status === "VERIFIED" && differences.length > 0) throw new CustomerSalesError("RECEIPT_MISMATCH", differences.join("; "), 409);
    const reviewedAt = new Date();
    const updated = await tx.saleAccountingReview.update({
      where: { id: freshReview.id },
      data: {
        status: input.status,
        reviewedById: actor.userId,
        reviewedAt,
        verifiedAt: input.status === "VERIFIED" ? reviewedAt : null,
        mismatchCategory: input.status === "MISMATCH_REPORTED" ? input.mismatchCategory : null,
        notes: input.status === "MISMATCH_REPORTED" ? input.notes : null,
        comparisonJson: JSON.stringify({ comparison: input.comparison, differences }),
      },
    });
    await syncSalePaymentReview(tx, sale.id, {
      status: input.status,
      verifiedAt: updated.verifiedAt,
      reviewedById: actor.userId,
      reviewedAt,
    });
    if (input.status === "MISMATCH_REPORTED") {
      await notifySaleParties(tx, sale, "Receipt mismatch reported", `${sale.manualReceiptNumber} was flagged for ${input.mismatchCategory}.`);
    }
    await recordAuditLog({
      category: "Receipt Verification",
      action: input.status === "VERIFIED" ? "Sale Receipt Verified" : "Sale Receipt Mismatch Reported",
      actorId: actor.userId,
      reference: sale.manualReceiptNumber,
      details: input.status === "VERIFIED"
        ? "Confirmed against the handwritten receipt"
        : `${input.mismatchCategory}: ${input.notes ?? ""}`.trim(),
      facts: [
        { label: "Sale", value: sale.reference },
        { label: "Encoded total", value: String(sale.totalAmount.toNumber()) },
        { label: "Receipt total", value: String(input.comparison.totalAmount) },
        ...(differences.length ? [{ label: "Differences", value: differences.join("; ") }] : []),
      ],
    }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function respondToSaleMismatch(actor: AuthContext, saleId: string, input: z.infer<typeof branchMismatchResponseSchema>) {
  assertCapability(actor, "sales:mismatch:respond");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { accountingReview: true } });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    if (!sale.accountingReview) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    await tx.$queryRaw`SELECT id FROM "SaleAccountingReview" WHERE id = ${sale.accountingReview.id} FOR UPDATE`;
    const currentReview = await tx.saleAccountingReview.findUnique({ where: { id: sale.accountingReview.id } });
    if (!currentReview) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    if (sale.status !== "POSTED" || currentReview.status !== "MISMATCH_REPORTED" || currentReview.resolvedAt) {
      throw new CustomerSalesError("INVALID_STATE", "Only unresolved branch mismatches can receive a response", 409);
    }
    if (input.response === "RECEIPT_CORRECTION_NEEDED") {
      if (input.replacementReceiptNumber === sale.manualReceiptNumber) throw new CustomerSalesError("INVALID_REPLACEMENT_RECEIPT", "Replacement receipt number must differ from the original", 400);
      const duplicate = await tx.manualReceipt.findFirst({
        where: {
          locationId: sale.locationId,
          receiptBooklet: sale.receiptBooklet,
          number: input.replacementReceiptNumber,
        },
        select: { id: true },
      });
      if (duplicate) throw new CustomerSalesError("DUPLICATE_RECEIPT", "Replacement receipt number already exists", 409);
    }
    if (
      input.response === "WRONG_RECEIPT_PHOTO" &&
      (input.replacementEvidenceKey !== currentReview.receiptPhotoKey ||
        !currentReview.reviewedAt ||
        !currentReview.evidenceUploadedAt ||
        currentReview.evidenceUploadedAt <= currentReview.reviewedAt)
    ) {
      throw new CustomerSalesError(
        "REPLACEMENT_EVIDENCE_REQUIRED",
        "Upload a new replacement receipt photo after the Accounting review before submitting this finding",
        409,
      );
    }
    const now = new Date();
    const reopenForReplacementPhoto = input.response === "WRONG_RECEIPT_PHOTO";
    const review = await tx.saleAccountingReview.update({
      where: { id: currentReview.id },
      data: {
        ...(reopenForReplacementPhoto
          ? {
              status: "UNVERIFIED" as const,
              mismatchCategory: null,
              notes: null,
              comparisonJson: null,
              reviewedById: null,
              reviewedAt: null,
              verifiedAt: null,
              resolutionAction: null,
              resolutionNote: null,
              resolvedById: null,
              resolvedAt: null,
            }
          : {}),
        branchResponse: input.response,
        branchResponseNote: input.note,
        branchReplacementReceiptNumber: input.response === "RECEIPT_CORRECTION_NEEDED" ? input.replacementReceiptNumber : null,
        branchRespondedById: actor.userId,
        branchRespondedAt: now,
      },
    });
    const recipientCapability = input.response === "WRONG_RECEIPT_PHOTO"
      ? "sales:verify"
      : input.response === "SALE_ENCODED_INCORRECT"
        ? "sales:void-replace"
        : "sales:resolve";
    const reviewers = await tx.user.findMany({
      where: {
        status: "ACTIVE",
        accessRole: { OR: [{ isOwner: true }, { permissions: { has: recipientCapability } }] },
        OR: [
          { accessRole: { isOwner: true } },
          { accessRole: { permissions: { has: "locations:all" } } },
          { locationAssignments: { some: { locationId: sale.locationId } } },
        ],
      },
      select: { id: true },
    });
    const responseLabel = input.response === "ORIGINAL_ENCODING_CORRECT"
      ? "confirmed the original encoding"
      : input.response === "RECEIPT_CORRECTION_NEEDED"
        ? "confirmed that receipt correction is needed"
        : input.response === "WRONG_RECEIPT_PHOTO"
          ? "uploaded the replacement receipt photo for Accounting re-review"
          : "reported that the sale was encoded incorrectly";
    await createNotifications(tx, reviewers.map((reviewer) => ({
      userId: reviewer.id,
      title: input.response === "WRONG_RECEIPT_PHOTO"
        ? "Replacement receipt ready for re-review"
        : input.response === "SALE_ENCODED_INCORRECT"
          ? "Incorrect sale encoding needs Admin action"
          : "Branch reviewed receipt mismatch",
      description: `${sale.manualReceiptNumber}: Branch ${responseLabel}.`,
      type: "INFO" as const,
      relatedType: "SALE" as const,
      relatedId: sale.id,
      relatedReference: sale.reference,
    })));
    await recordAuditLog({
      category: "Receipt Verification",
      action: "Branch Answered Receipt Mismatch",
      actorId: actor.userId,
      reference: sale.manualReceiptNumber,
      details: `Branch ${responseLabel}${input.note ? `: ${input.note}` : ""}`,
      facts: [
        { label: "Sale", value: sale.reference },
        { label: "Response", value: input.response },
        ...(input.response === "RECEIPT_CORRECTION_NEEDED" && input.replacementReceiptNumber
          ? [{ label: "Replacement receipt", value: input.replacementReceiptNumber }]
          : []),
      ],
    }, tx);
    return {
      branchResponse: review.branchResponse,
      branchResponseNote: review.branchResponseNote,
      branchReplacementReceiptNumber: review.branchReplacementReceiptNumber,
      branchRespondedAt: review.branchRespondedAt?.toISOString() ?? null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * Settles a reported mismatch.
 *
 * `branchCorrection` is the branch putting right its own encoding, which it
 * reaches straight from the response where it admitted the mistake. It is the
 * same void and replace Accounting would perform, not a second mechanism: the
 * wrong receipt is voided, its stock goes back, and the corrected one is posted
 * unverified for Accounting to check. A branch may do nothing else here — not
 * confirm its own encoding correct, not void without a replacement — and only
 * after saying the sale was encoded incorrectly.
 */
/**
 * Accounting putting a wrongly keyed sale right, in place.
 *
 * The paper is correct and the encoding is not, so there is nothing to ask the
 * branch and nothing to re-number: the sale keeps the receipt number printed on
 * the paper. That is also why this cannot be a void and replace. Receipt
 * identity is unique per branch and booklet, and the voided row would keep its
 * claim on the number, forcing the correction to invent one the receipt does
 * not carry.
 *
 * Stock moves by the difference and the ledger row is restated, both inside the
 * transaction. What the sale said before survives in the audit entry, which is
 * the only place it is kept.
 */
export async function correctEncodedSale(
  actor: AuthContext,
  saleId: string,
  rawInput: z.input<typeof accountingResolutionSchema>,
  options: { byBranch?: boolean } = {},
) {
  if (options.byBranch) {
    // The branch rewrites, but does not sign off: the correction goes back to
    // Accounting unverified, so this is the answering grant, not the verifying
    // one.
    assertCapability(actor, "sales:mismatch:respond");
  } else {
    // Two things at once -- rewriting a posted sale and verifying it -- so it
    // takes the grant for each rather than just the first.
    assertCapability(actor, "sales:void-replace");
    assertCapability(actor, "sales:verify");
    assertCapability(actor, "sales:evidence:view");
    assertAccounting(actor);
  }
  const input = accountingResolutionSchema.parse(rawInput);
  const corrected = input.replacement;
  if (!corrected) throw new CustomerSalesError("INVALID_INPUT", "Corrected sale details are required", 400);
  assertUniqueComparisonLines(corrected);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        lines: true,
        accountingReview: true,
        location: { select: { name: true } },
        _count: { select: { refunds: true, warranties: true, originalBackjobs: true } },
      },
    });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    const review = sale.accountingReview;
    if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    if (sale.status !== "POSTED") throw new CustomerSalesError("INVALID_STATE", "Only a posted sale can be corrected", 409);
    /*
     * Only after Accounting has put on record that the sale does not match the
     * paper. The reported mismatch is what says why a posted sale changed, so
     * the correction is never the first anyone hears of it.
     */
    if (review.status !== "MISMATCH_REPORTED" || review.resolvedAt) {
      throw new CustomerSalesError("INVALID_STATE", "Report the mismatch first, so the record says why the sale changed", 409);
    }
    /*
     * A branch that has told Accounting its encoding was right does not get to
     * rewrite the sale anyway. It has to change that answer first, which is
     * recorded, rather than contradicting it silently here.
     */
    if (options.byBranch && review.branchResponse && review.branchResponse !== "SALE_ENCODED_INCORRECT") {
      throw new CustomerSalesError("INVALID_RESOLUTION", "Change the branch finding to \"Sale was encoded incorrectly\" before correcting it", 409);
    }
    // Nothing is verified on no evidence. Only the Accounting path verifies,
    // so only it has to insist on a photo.
    if (!options.byBranch && !review.receiptPhotoKey) {
      throw new CustomerSalesError("EVIDENCE_REQUIRED", "Attach the receipt photo before correcting and verifying this sale", 409);
    }
    /*
     * Each of these was worked out from the lines or the money as they stand.
     * Rewriting them underneath would leave the other record describing a sale
     * that no longer exists, so the correction stops rather than guess.
     */
    const standingOn: Array<[number, string]> = [
      [sale._count.refunds, "refund(s) already given against it"],
      [sale._count.warranties, "customer warranty case(s) raised against it"],
      [sale._count.originalBackjobs, "backjob(s) naming it as the original sale"],
    ];
    for (const [count, description] of standingOn) {
      if (count > 0) {
        throw new CustomerSalesError(
          "SALE_IN_USE",
          `This sale has ${count} ${description}, so it cannot be rewritten. Void and replace it instead.`,
          409,
        );
      }
    }
    if (corrected.receiptNumber !== sale.manualReceiptNumber || corrected.receiptBooklet !== sale.receiptBooklet) {
      throw new CustomerSalesError(
        "INVALID_REPLACEMENT_RECEIPT",
        "This step corrects what was keyed, not which receipt it was. Keep the receipt number.",
        409,
      );
    }

    const itemCodes = corrected.lines.map((line) => line.itemCode);
    const products = await tx.product.findMany({
      where: { itemCode: { in: itemCodes }, status: "ACTIVE" },
      select: { id: true, itemCode: true, name: true, warrantyDurationMonths: true },
    });
    if (products.length !== new Set(itemCodes).size) {
      throw new CustomerSalesError("INVALID_LINES", "Every corrected line must reference an active product", 400);
    }
    const productsByCode = new Map(products.map((product) => [product.itemCode, product]));

    const subtotalCents = cents(corrected.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
    const totalCents = subtotalCents - cents(corrected.discountAmount);
    if (totalCents < 0) throw new CustomerSalesError("INVALID_DISCOUNT", "Discount cannot exceed the corrected subtotal", 400);
    if (cents(corrected.totalAmount) !== totalCents) throw new CustomerSalesError("INVALID_TOTAL", "Corrected total must match lines less discount", 400);
    if (cents(corrected.amountPaid) !== totalCents) throw new CustomerSalesError("INVALID_PAYMENT", "Corrected payment must match the corrected total", 400);
    const total = totalCents / 100;

    const now = new Date();
    const before = `${sale.lines.map((line) => `${line.productItemCode} x${line.quantity} @${line.unitPrice.toNumber()}`).join(", ")} = ${sale.totalAmount.toNumber()}`;

    // The difference, in two halves: what was never sold comes back, and what
    // was actually sold goes out.
    await updateSaleInventory(tx, sale.locationId, sale.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })), "reverse", actor.userId, `ENCODING-FIX-REVERSAL-${sale.reference}`);
    await updateSaleInventory(tx, sale.locationId, corrected.lines.map((line) => ({ productId: productsByCode.get(line.itemCode)!.id, quantity: line.quantity })), "deduct", actor.userId, `ENCODING-FIX-${sale.reference}`);

    await tx.saleLine.deleteMany({ where: { saleId: sale.id } });
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        paymentMethod: corrected.paymentMethod as PaymentMethod,
        totalAmount: decimal(total),
        discountAmount: decimal(corrected.discountAmount),
        amountPaid: decimal(corrected.amountPaid),
        correctedById: actor.userId,
        correctedAt: now,
        lines: {
          create: corrected.lines.map((line) => {
            const product = productsByCode.get(line.itemCode)!;
            return {
              productId: product.id,
              productItemCode: product.itemCode,
              productName: product.name,
              quantity: line.quantity,
              unitPrice: decimal(line.unitPrice),
              warrantyDurationMonths: product.warrantyDurationMonths,
            };
          }),
        },
      },
    });

    // The receipt really did collect this money, and its number has not moved,
    // so the ledger row is restated rather than voided and written again.
    await tx.payment.updateMany({
      where: { saleId: sale.id },
      data: { amount: decimal(corrected.amountPaid), method: corrected.paymentMethod as PaymentMethod },
    });

    const updatedReview = await tx.saleAccountingReview.update({
      where: { id: review.id },
      data: options.byBranch
        ? {
            // Back to Accounting to look at again, with the branch's answer on
            // record. Nothing here is resolved or verified by the branch.
            status: "UNVERIFIED",
            verifiedAt: null,
            branchResponse: "SALE_ENCODED_INCORRECT",
            branchResponseNote: input.note,
            branchRespondedById: actor.userId,
            branchRespondedAt: now,
          }
        : {
            status: "VERIFIED",
            verifiedAt: now,
            reviewedById: actor.userId,
            reviewedAt: now,
            resolutionNote: input.note,
            resolvedById: actor.userId,
            resolvedAt: now,
          },
    });
    await syncSalePaymentReview(tx, sale.id, updatedReview);

    const after = `${corrected.lines.map((line) => `${line.itemCode} x${line.quantity} @${line.unitPrice}`).join(", ")} = ${total}`;
    await recordAuditLog({
      category: "Receipt Verification",
      action: "Sale Encoding Corrected",
      actorId: actor.userId,
      reference: sale.manualReceiptNumber,
      locationLabel: sale.location.name,
      details: options.byBranch
        ? `The branch corrected what it keyed against receipt ${sale.manualReceiptNumber}, for Accounting to review again. ${input.note}`
        : `Accounting corrected what was keyed against receipt ${sale.manualReceiptNumber} and verified it. ${input.note}`,
      facts: [
        { label: "Was", value: before },
        { label: "Now", value: after },
        { label: "Receipt number", value: sale.manualReceiptNumber },
      ],
    }, tx);

    const refreshed = await tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: SALE_INCLUDE });
    return { action: "ENCODING_CORRECTED" as const, sale: serializeSaleWithCorrection(refreshed) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveSale(
  actor: AuthContext,
  saleId: string,
  input: z.infer<typeof accountingResolutionSchema>,
  options: { branchCorrection?: boolean } = {},
) {
  if (options.branchCorrection) {
    if (input.action !== "VOIDED_REPLACED") {
      throw new CustomerSalesError("INVALID_RESOLUTION", "A branch may only correct its own encoding", 403);
    }
    assertCapability(actor, "sales:mismatch:respond");
  } else {
    assertCapability(actor, input.action === "CONFIRMED_CORRECT" ? "sales:resolve" : "sales:void-replace");
    assertAccounting(actor);
  }
  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { accountingReview: true, lines: true } });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    if (!sale.accountingReview) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    await tx.$queryRaw`SELECT id FROM "SaleAccountingReview" WHERE id = ${sale.accountingReview.id} FOR UPDATE`;
    const review = await tx.saleAccountingReview.findUnique({ where: { id: sale.accountingReview.id } });
    if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    if (sale.status !== "POSTED" || review.status !== "MISMATCH_REPORTED" || review.resolvedAt) throw new CustomerSalesError("INVALID_STATE", "Only reported mismatches can be resolved", 409);
    if (!review.branchResponse) throw new CustomerSalesError("BRANCH_RESPONSE_REQUIRED", "Wait for the branch to review the mismatch", 409);
    if (input.action === "CONFIRMED_CORRECT" && review.branchResponse !== "ORIGINAL_ENCODING_CORRECT") throw new CustomerSalesError("INVALID_RESOLUTION", "Branch did not confirm the original encoding", 409);
    const replaceable: NonNullable<typeof review.branchResponse>[] = options.branchCorrection
      ? ["SALE_ENCODED_INCORRECT"]
      : ["RECEIPT_CORRECTION_NEEDED"];
    if (input.action === "VOIDED_REPLACED" && !replaceable.includes(review.branchResponse)) throw new CustomerSalesError("INVALID_RESOLUTION", "Branch did not confirm that receipt correction is needed", 409);
    if (input.action === "VOIDED" && review.branchResponse !== "SALE_ENCODED_INCORRECT") throw new CustomerSalesError("INVALID_RESOLUTION", "Only an incorrectly encoded sale can be voided without a replacement", 409);
    const now = new Date();
    if (input.action === "CONFIRMED_CORRECT") {
      const updated = await tx.saleAccountingReview.update({ where: { id: review.id }, data: { status: "VERIFIED", verifiedAt: now, resolutionAction: "CONFIRMED_CORRECT", resolutionNote: input.note, resolvedById: actor.userId, resolvedAt: now } });
      await syncSalePaymentReview(tx, sale.id, { status: "VERIFIED", verifiedAt: now, reviewedById: actor.userId, reviewedAt: now });
      await notifySaleParties(tx, sale, "Receipt mismatch resolved", `${sale.manualReceiptNumber} was confirmed correct.`);
      return { action: input.action, review: updated };
    }
    if (input.action === "VOIDED") {
      await updateSaleInventory(
        tx,
        sale.locationId,
        sale.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        "reverse",
        actor.userId,
        `VOID-${sale.reference}`,
        `Admin voided incorrectly encoded sale ${sale.reference}`,
      );
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: "VOIDED", correctedById: actor.userId, correctedAt: now },
      });
      await voidSalePayment(tx, sale.id, `Sale ${sale.reference} was voided as incorrectly encoded`, actor.userId);
      const updated = await tx.saleAccountingReview.update({
        where: { id: review.id },
        data: {
          resolutionAction: "VOIDED",
          resolutionNote: input.note,
          resolvedById: actor.userId,
          resolvedAt: now,
        },
      });
      await notifySaleParties(
        tx,
        sale,
        "Incorrectly encoded sale voided",
        `${sale.manualReceiptNumber} was voided and its original inventory quantities were restored.`,
        review.reviewedById ? [review.reviewedById] : [],
      );
      return { action: input.action, saleId: sale.id, saleStatus: "VOIDED" as const, review: updated };
    }

    const replacement = input.replacement;
    if (!replacement) throw new CustomerSalesError("INVALID_INPUT", "Replacement sale details are required", 400);
    assertUniqueComparisonLines(replacement);
    /*
     * Accounting replaces against a number the branch named earlier, so the two
     * have to agree. A branch correcting its own encoding writes the new
     * receipt as it corrects, and names it here: there is no earlier number to
     * agree with.
     */
    if (!options.branchCorrection && (!review.branchReplacementReceiptNumber || replacement.receiptNumber !== review.branchReplacementReceiptNumber)) throw new CustomerSalesError("INVALID_REPLACEMENT_RECEIPT", "Use the replacement receipt number confirmed by the branch", 409);
    const productIds = replacement.lines.map((line) => line.itemCode);
    if (new Set(productIds).size !== productIds.length) throw new CustomerSalesError("INVALID_LINES", "A replacement product may appear only once", 400);
    const products = await tx.product.findMany({ where: { itemCode: { in: productIds }, status: "ACTIVE" }, select: { id: true, itemCode: true, name: true, warrantyDurationMonths: true } });
    if (products.length !== new Set(productIds).size) throw new CustomerSalesError("INVALID_LINES", "Every replacement line must reference an active product", 400);
    const productsByCode = new Map(products.map((product) => [product.itemCode, product]));
    const replacementSubtotalCents = cents(replacement.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
    const replacementTotalCents = replacementSubtotalCents - cents(replacement.discountAmount);
    if (replacementTotalCents < 0) throw new CustomerSalesError("INVALID_DISCOUNT", "Discount cannot exceed replacement subtotal", 400);
    if (cents(replacement.totalAmount) !== replacementTotalCents) throw new CustomerSalesError("INVALID_TOTAL", "Replacement total must match lines less discount", 400);
    if (cents(replacement.amountPaid) !== replacementTotalCents) throw new CustomerSalesError("INVALID_PAYMENT", "Replacement payment must match replacement total", 400);
    const replacementTotal = replacementTotalCents / 100;
    const reference = `SALE-${randomUUID()}`;
    await updateSaleInventory(tx, sale.locationId, sale.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })), "reverse", actor.userId, `CORRECTION-REVERSAL-${reference}`);
    await updateSaleInventory(tx, sale.locationId, replacement.lines.map((line) => ({ productId: productsByCode.get(line.itemCode)!.id, quantity: line.quantity })), "deduct", actor.userId, `CORRECTION-${reference}`);
    const replacementSale = await tx.sale.create({
      data: {
        reference,
        manualReceiptNumber: replacement.receiptNumber,
        receiptBooklet: replacement.receiptBooklet,
        locationId: sale.locationId,
        customerId: sale.customerId,
        salespersonId: sale.salespersonId,
        salespersonName: sale.salespersonName,
        salespersonLocationId: sale.salespersonLocationId,
        salespersonLocationCode: sale.salespersonLocationCode,
        salespersonLocationName: sale.salespersonLocationName,
        paymentMethod: replacement.paymentMethod,
        totalAmount: decimal(replacementTotal),
        discountAmount: decimal(replacement.discountAmount),
        amountPaid: decimal(replacement.amountPaid),
        notes: `Replacement for ${sale.reference}: ${input.note}`,
        postedById: sale.postedById,
        correctionOfId: sale.id,
        correctedById: actor.userId,
        correctedAt: now,
        lines: { create: replacement.lines.map((line) => ({ productId: productsByCode.get(line.itemCode)!.id, productItemCode: line.itemCode, productName: productsByCode.get(line.itemCode)!.name, quantity: line.quantity, unitPrice: decimal(line.unitPrice) })) },
        accountingReview: { create: {} },
      },
      include: SALE_INCLUDE,
    });
    for (const product of products) await tx.saleLine.updateMany({ where: { saleId: replacementSale.id, productId: product.id }, data: { warrantyDurationMonths: product.warrantyDurationMonths } });
    await registerReceipt(tx, replacement.receiptNumber, "SALE_CORRECTION", { saleId: replacementSale.id, locationId: sale.locationId, receiptBooklet: replacement.receiptBooklet });
    await voidSalePayment(tx, sale.id, `Receipt ${sale.manualReceiptNumber} was replaced by ${replacement.receiptNumber}`, actor.userId);
    await recordPayment(tx, {
      kind: sale.orderId ? "ORDER_FINAL" : "DIRECT_SALE",
      locationId: sale.locationId,
      customerId: sale.customerId,
      orderId: sale.orderId,
      saleId: replacementSale.id,
      amount: replacement.amountPaid,
      method: replacement.paymentMethod,
      receiptNumber: replacement.receiptNumber,
      receiptBooklet: replacement.receiptBooklet,
      salesperson: {
        id: sale.salespersonId,
        name: sale.salespersonName,
        locationId: sale.salespersonLocationId,
        locationCode: sale.salespersonLocationCode,
        locationName: sale.salespersonLocationName,
      },
      collectedById: sale.postedById,
      mirrorsSaleReview: true,
    });
    await tx.sale.update({ where: { id: sale.id }, data: { status: "VOIDED", correctedById: actor.userId, correctedAt: now } });
    await tx.saleAccountingReview.update({ where: { id: review.id }, data: { resolutionAction: "VOIDED_REPLACED", resolutionNote: input.note, resolvedById: actor.userId, resolvedAt: now } });
    await notifySaleParties(tx, sale, "Receipt mismatch corrected", `${sale.manualReceiptNumber} was voided and replaced by ${replacement.receiptNumber}.`);
    await notifySaleParties(tx, replacementSale, "Replacement receipt evidence required", `${replacement.receiptNumber} was created as the replacement for ${sale.manualReceiptNumber}. Upload its receipt photo for Accounting verification.`);
      return { action: input.action, sale: serializeSaleWithCorrection(replacementSale) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CustomerSalesError("DUPLICATE_RECEIPT", "Replacement receipt number already exists", 409);
    }
    throw error;
  }
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

function manilaDate(date: Date) {
  return new Date(date.getTime() + MANILA_OFFSET_MS);
}

function dayStart(date = new Date()) {
  const manila = manilaDate(date);
  return new Date(
    Date.UTC(
      manila.getUTCFullYear(),
      manila.getUTCMonth(),
      manila.getUTCDate(),
    ) - MANILA_OFFSET_MS,
  );
}

function monthStart(date = new Date()) {
  const manila = manilaDate(date);
  return new Date(
    Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), 1) -
      MANILA_OFFSET_MS,
  );
}

function dateKey(date: Date) {
  const manila = manilaDate(date);
  return `${manila.getUTCFullYear()}-${String(manila.getUTCMonth() + 1).padStart(2, "0")}-${String(manila.getUTCDate()).padStart(2, "0")}`;
}

function hourKey(date: Date) {
  return String(manilaDate(date).getUTCHours()).padStart(2, "0");
}

function dashboardSalesWindow(
  period: DashboardSalesPeriod,
  now: Date,
) {
  if (period === "last7Days") {
    return { start: new Date(dayStart(now).getTime() - 6 * DAY_MS), label: "Last 7 Days" };
  }

  if (period === "monthToDate") {
    return { start: monthStart(now), label: "Month to Date" };
  }

  if (period === "last30Days") {
    return { start: new Date(dayStart(now).getTime() - 29 * DAY_MS), label: "Last 30 Days" };
  }

  return { start: dayStart(now), label: "Today" };
}

function dashboardTrendBuckets(
  period: DashboardSalesPeriod,
  start: Date,
  now: Date,
) {
  const buckets = new Map<
    string,
    { label: string; sales: number; transactions: number }
  >();

  if (period === "today") {
    for (let hour = 0; hour <= manilaDate(now).getUTCHours(); hour += 1) {
      const key = String(hour).padStart(2, "0");
      buckets.set(key, {
        label: `${key}:00`,
        sales: 0,
        transactions: 0,
      });
    }
    return buckets;
  }

  const lastDay = dayStart(now);
  for (
    let date = new Date(start);
    date <= lastDay;
    date = new Date(date.getTime() + DAY_MS)
  ) {
    const key = dateKey(date);
    buckets.set(key, { label: key, sales: 0, transactions: 0 });
  }
  return buckets;
}

function saleScope(actor: AuthContext): Prisma.SaleWhereInput {
  return { locationId: locationIdFilter(actor) };
}

function orderScope(actor: AuthContext): Prisma.CustomerOrderWhereInput {
  return { locationId: locationIdFilter(actor) };
}

export async function getDashboardSummary(
  actor: AuthContext,
  requestedFilters: unknown = {},
) {
  assertCapability(actor, "dashboard:view");
  const filters = dashboardSalesFiltersSchema.parse(requestedFilters);
  const salesPeriod =
    filters.salesPeriod ?? (actor.isOwner ? "today" : "last30Days");
  if (
    !actor.isOwner &&
    (filters.salesPeriod || filters.salesBranchId)
  ) {
    throw new AuthorizationError("Sales dashboard filters are Admin-only");
  }

  const salesBranches = actor.isOwner ? await listActiveBranches() : [];
  const selectedSalesBranch = filters.salesBranchId
    ? salesBranches.find((branch) => branch.id === filters.salesBranchId)
    : null;
  if (filters.salesBranchId && !selectedSalesBranch) {
    throw new CustomerSalesError(
      "INVALID_BRANCH",
      "Select an active sales branch",
      400,
    );
  }

  const scopedSales = saleScope(actor);
  const scopedOrders = orderScope(actor);
  const inventoryScope: Prisma.InventoryBalanceWhereInput = { locationId: locationIdFilter(actor) };
  const transferScope: Prisma.StockTransferWhereInput = {
    destinationId: locationIdFilter(actor),
  };
  const now = new Date();
  const today = dayStart(now);
  const month = monthStart(now);
  const salesWindow = dashboardSalesWindow(salesPeriod, now);
  const filteredSalesScope: Prisma.SaleWhereInput = {
    locationId: selectedSalesBranch?.id ?? locationIdFilter(actor),
  };
  const agedOrderDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  // Money handed back, in the same windows and scope as the sales above. The
  // dashboard reads Sale.totalAmount, which a refund never edits, so without
  // these a refunded sale keeps showing its full value here while the reports
  // already net it out. A refund counts on the day it happened.
  // Only refunds that reverse something these figures counted. The sales
  // numbers here aggregate Sale rows; a cancelled order never produced a Sale,
  // so its downpayment was never in this total and subtracting the refund would
  // push the figure below zero. The Sales report, which reads the payment
  // ledger, does count those payments and does subtract their refunds.
  const refundScope: Prisma.RefundWhereInput = {
    kind: "POSTED_SALE",
    locationId: locationIdFilter(actor),
  };
  const filteredRefundScope: Prisma.RefundWhereInput = {
    kind: "POSTED_SALE",
    locationId: selectedSalesBranch?.id ?? locationIdFilter(actor),
  };
  const [todaySales, mtdSales, filteredSales, openOrders, readyOrders, flagged, unverified, verifiedToday, agedOrders, lowBalances, supplierReceiptsToday, transferDrafts, transfersForDispatch, inTransitTransfers, discrepanciesNeedingAction, incomingTransfers, chartSales, todayRefunds, mtdRefunds, filteredRefunds, chartRefunds] = await Promise.all([
    prisma.sale.aggregate({ where: { ...scopedSales, status: "POSTED", postedAt: { gte: today } }, _sum: { totalAmount: true }, _count: true }),
    prisma.sale.aggregate({ where: { ...scopedSales, status: "POSTED", postedAt: { gte: month } }, _sum: { totalAmount: true }, _count: true }),
    prisma.sale.aggregate({ where: { ...filteredSalesScope, status: "POSTED", postedAt: { gte: salesWindow.start, lte: now } }, _sum: { totalAmount: true }, _count: true }),
    prisma.customerOrder.count({ where: { ...scopedOrders, status: { in: ["RESERVED", "WAITING_STOCK", "READY_FOR_RELEASE"] } } }),
    prisma.customerOrder.count({ where: { ...scopedOrders, status: "READY_FOR_RELEASE" } }),
    prisma.saleAccountingReview.count({ where: { status: "MISMATCH_REPORTED", sale: { ...scopedSales, status: "POSTED" } } }),
    prisma.saleAccountingReview.count({ where: { status: "UNVERIFIED", sale: { ...scopedSales, status: "POSTED" } } }),
    prisma.saleAccountingReview.count({ where: { status: "VERIFIED", reviewedAt: { gte: today }, sale: { ...scopedSales, status: "POSTED" } } }),
    prisma.customerOrder.count({ where: { ...scopedOrders, createdAt: { lt: agedOrderDate }, status: { in: ["RESERVED", "WAITING_STOCK", "READY_FOR_RELEASE"] } } }),
    prisma.inventoryBalance.findMany({
      where: inventoryScope,
      include: { product: { select: { itemCode: true, name: true, status: true, reorderLevel: true } }, location: { select: { name: true, type: true } } },
    }),
    prisma.stockReceipt.count({ where: { locationId: locationIdFilter(actor), receivedAt: { gte: today } } }),
    prisma.stockTransfer.count({ where: { ...transferScope, status: "DRAFT" } }),
    prisma.stockTransfer.count({ where: { ...transferScope, status: "FOR_DISPATCH" } }),
    prisma.stockTransfer.count({ where: { ...transferScope, status: "IN_TRANSIT" } }),
    prisma.stockTransfer.count({ where: { ...transferScope, status: { in: ["DISCREPANCY_REPORTED", "UNDER_REVIEW"] } } }),
    prisma.stockTransfer.count({ where: { ...transferScope, status: "IN_TRANSIT" } }),
    prisma.sale.findMany({ where: { ...filteredSalesScope, status: "POSTED", postedAt: { gte: salesWindow.start, lte: now } }, select: { postedAt: true, totalAmount: true, location: { select: { name: true } } } }),
    prisma.refund.aggregate({ where: { ...refundScope, refundedAt: { gte: today } }, _sum: { amount: true }, _count: true }),
    prisma.refund.aggregate({ where: { ...refundScope, refundedAt: { gte: month } }, _sum: { amount: true }, _count: true }),
    prisma.refund.aggregate({ where: { ...filteredRefundScope, refundedAt: { gte: salesWindow.start, lte: now } }, _sum: { amount: true }, _count: true }),
    prisma.refund.findMany({ where: { ...filteredRefundScope, refundedAt: { gte: salesWindow.start, lte: now } }, select: { refundedAt: true, amount: true, location: { select: { name: true } } } }),
  ]);
  const lowStock = lowBalances
    .filter((balance) => availableStock(balance) <= balance.product.reorderLevel)
    .slice(0, 10)
    .map((balance) => ({ itemCode: balance.product.itemCode, name: balance.product.name, location: balance.location.name, available: availableStock(balance), reorderLevel: balance.product.reorderLevel }));
  const availableStockCount = lowBalances.reduce((sum, balance) => sum + availableStock(balance), 0);
  const lowStockCount = lowBalances.filter((balance) => availableStock(balance) <= balance.product.reorderLevel).length;
  const lowStockBranchCount = new Set(
    lowBalances
      .filter(
        (balance) =>
          balance.location.type === "BRANCH" &&
          availableStock(balance) <= balance.product.reorderLevel,
      )
      .map((balance) => balance.locationId),
  ).size;
  const outOfStockCount = lowBalances.filter((balance) => availableStock(balance) <= 0).length;
  const inactiveWithStockCount = lowBalances.filter((balance) => balance.product.status === "INACTIVE" && balance.onHand > 0).length;
  const trendByDate = dashboardTrendBuckets(
    salesPeriod,
    salesWindow.start,
    now,
  );
  const branchByName = new Map<string, { branch: string; sales: number; transactions: number }>();
  for (const sale of chartSales) {
    const key = salesPeriod === "today"
      ? hourKey(sale.postedAt)
      : dateKey(sale.postedAt);
    const daily = trendByDate.get(key);
    if (daily) {
      daily.sales += sale.totalAmount.toNumber();
      daily.transactions += 1;
    }
    const branch = branchByName.get(sale.location.name) ?? { branch: sale.location.name, sales: 0, transactions: 0 };
    branch.sales += sale.totalAmount.toNumber();
    branch.transactions += 1;
    branchByName.set(sale.location.name, branch);
  }
  // Subtract on the refund's own day, which is how the Sales report dates it.
  // Transaction counts are left alone: a refund is not a sale that happened.
  for (const refund of chartRefunds) {
    const key = salesPeriod === "today" ? hourKey(refund.refundedAt) : dateKey(refund.refundedAt);
    const daily = trendByDate.get(key);
    if (daily) daily.sales -= refund.amount.toNumber();
    const branch = branchByName.get(refund.location.name) ?? { branch: refund.location.name, sales: 0, transactions: 0 };
    branch.sales -= refund.amount.toNumber();
    branchByName.set(refund.location.name, branch);
  }

  return {
    capabilities: actor.capabilities,
    canFilterSales: actor.isOwner,
    salesFilter: {
      period: salesPeriod,
      periodLabel: salesWindow.label,
      branchId: selectedSalesBranch?.id ?? "all",
      branchLabel: selectedSalesBranch?.name ?? "All Branches",
    },
    salesBranches,
    filteredSales: (filteredSales._sum.totalAmount?.toNumber() ?? 0) - (filteredRefunds._sum.amount?.toNumber() ?? 0),
    filteredTransactions: filteredSales._count,
    filteredRefunds: filteredRefunds._sum.amount?.toNumber() ?? 0,
    todaySales: (todaySales._sum.totalAmount?.toNumber() ?? 0) - (todayRefunds._sum.amount?.toNumber() ?? 0),
    todayTransactions: todaySales._count,
    todayRefunds: todayRefunds._sum.amount?.toNumber() ?? 0,
    monthSales: (mtdSales._sum.totalAmount?.toNumber() ?? 0) - (mtdRefunds._sum.amount?.toNumber() ?? 0),
    monthTransactions: mtdSales._count,
    monthRefunds: mtdRefunds._sum.amount?.toNumber() ?? 0,
    openOrders,
    readyOrders,
    unverifiedSales: unverified,
    flaggedSales: flagged,
    verifiedToday,
    agedOrders,
    availableStock: availableStockCount,
    lowStockCount,
    lowStockBranchCount,
    outOfStockCount,
    inactiveWithStockCount,
    supplierReceiptsToday,
    transferDrafts,
    transfersForDispatch,
    inTransitTransfers,
    discrepanciesNeedingAction,
    incomingTransfers,
    salesTrend: Array.from(trendByDate.values()),
    branchPerformance: Array.from(branchByName.values()).sort((a, b) => b.sales - a.sales),
    lowStock,
  };
}

export async function getReportsSummary(actor: AuthContext) {
  assertCapability(actor, "reports:sales");
  assertAccounting(actor);
  const permittedLocationIds = locationIdFilter(actor);
  const [saleRecords, orderRecords, inventory] = await Promise.all([
    prisma.sale.findMany({ where: { locationId: permittedLocationIds, status: "POSTED" }, orderBy: { postedAt: "desc" }, include: SALE_INCLUDE, take: 200 }),
    prisma.customerOrder.findMany({ where: { locationId: permittedLocationIds }, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE, take: 200 }),
    prisma.inventoryBalance.findMany({ where: { locationId: permittedLocationIds }, include: { product: true, location: true }, take: 500 }),
  ]);
  const sales = saleRecords.map(serializeSaleWithCorrection);
  const orders = orderRecords.map(serializeOrder);
  return {
    sales: {
      totalSales: sales.reduce((sum, sale) => sum + sale.totalAmount, 0),
      transactionCount: sales.length,
      rows: sales,
    },
    accounting: {
      unverified: sales.filter((sale) => sale.reviewStatus === "UNVERIFIED").length,
      verified: sales.filter((sale) => sale.reviewStatus === "VERIFIED").length,
      flagged: sales.filter((sale) => sale.reviewStatus === "MISMATCH_REPORTED").length,
      flaggedRows: sales.filter((sale) => sale.reviewStatus === "MISMATCH_REPORTED"),
    },
    orders: { open: orders.filter((order) => !["Released", "Cancelled"].includes(order.status)).length, rows: orders },
    inventory: inventory.map((balance) => ({ itemCode: balance.product.itemCode, name: balance.product.name, category: balance.product.category, brand: balance.product.brand, productStatus: balance.product.status, location: balance.location.name, onHand: balance.onHand, reserved: balance.reserved, quarantined: balance.quarantined, available: availableStock(balance), reorderLevel: balance.product.reorderLevel })),
  };
}

function serializeOrder(order: Prisma.CustomerOrderGetPayload<{ include: typeof ORDER_INCLUDE }>) {
  const statusLabels: Record<CustomerOrderStatus, string> = {
    RESERVED: "Reserved",
    WAITING_STOCK: "Pending",
    READY_FOR_RELEASE: "For Release",
    COMPLETED: "Released",
    CANCELLED: "Cancelled",
  };
  return { id: order.id, orderNo: order.reference, customer: order.customer.name, branch: order.location.name, locationId: order.locationId, salesperson: serializeSalespersonSnapshot(order), itemSummary: order.lines.map((line) => line.productName).join(", "), totalItems: order.lines.reduce((sum, line) => sum + line.quantity, 0), status: statusLabels[order.status], statusCode: order.status, type: order.type, paymentStatus: order.remainingBalance.toNumber() === 0 ? "Paid" : order.downpaymentAmount.toNumber() > 0 ? "Partial" : "Unpaid", downpayment: serializeMoney(order.downpaymentAmount), subtotal: order.lines.reduce((sum, line) => sum + line.quantity * line.finalUnitPrice.toNumber(), 0), discountAmount: serializeMoney(order.discountAmount), totalAmount: serializeMoney(order.totalAmount), balance: serializeMoney(order.remainingBalance), orderDate: order.createdAt.toISOString(), releaseDate: order.expectedReleaseDate?.toISOString() ?? "", finalReceiptNumber: order.finalReceiptNumber, downpaymentReceiptNumber: order.downpaymentReceiptNumber, notes: order.notes, cancelledAt: order.cancelledAt?.toISOString() ?? null, releasedAt: order.releasedAt?.toISOString() ?? null, lines: order.lines.map((line) => ({ productId: line.productId, itemCode: line.productItemCode, name: line.productName, quantity: line.quantity, listPrice: serializeMoney(line.baseUnitPrice), unitPrice: serializeMoney(line.finalUnitPrice), discount: serializeMoney(line.baseUnitPrice.sub(line.finalUnitPrice)), amount: line.quantity * line.finalUnitPrice.toNumber() })) };
}

function serializeSalespersonSnapshot(record: {
  salespersonId: string | null;
  salespersonName: string | null;
  salespersonLocationId: string | null;
  salespersonLocationCode: string | null;
  salespersonLocationName: string | null;
}) {
  if (!record.salespersonId || !record.salespersonName || !record.salespersonLocationId || !record.salespersonLocationCode || !record.salespersonLocationName) return null;
  return {
    personnelId: record.salespersonId,
    name: record.salespersonName,
    branch: { id: record.salespersonLocationId, code: record.salespersonLocationCode, name: record.salespersonLocationName },
  };
}

function parseReportedComparison(comparisonJson: string | null | undefined, namesByItemCode: Map<string, string>) {
  if (!comparisonJson) return null;
  try {
    const stored = JSON.parse(comparisonJson) as { comparison?: unknown; replacement?: unknown };
    const parsed = receiptComparisonSchema.safeParse(stored.comparison ?? stored.replacement);
    if (!parsed.success) return null;
    // A reported line may name an item the sale never had; that one keeps
    // showing its code alone, which is the honest reading of the mismatch.
    return { ...parsed.data, lines: parsed.data.lines.map((line) => ({ ...line, name: namesByItemCode.get(line.itemCode) ?? line.name })) };
  } catch {
    return null;
  }
}

function serializeSale(sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>) {
  const namesByItemCode = new Map(sale.lines.map((line) => [line.productItemCode, line.productName]));
  return { id: sale.id, reference: sale.reference, source: sale.orderId ? "Customer Order" : "Direct Sale", manualReceiptNumber: sale.manualReceiptNumber, receiptBooklet: (sale as unknown as { receiptBooklet: string }).receiptBooklet ?? "", version: (sale as unknown as { version: number }).version ?? 1, branch: sale.location.name, branchId: sale.locationId, customer: sale.customer?.name ?? "Guest", totalAmount: serializeMoney(sale.totalAmount), discountAmount: serializeMoney(sale.discountAmount), amountPaid: serializeMoney(sale.amountPaid), paymentMethod: sale.paymentMethod, status: sale.status, postedAt: sale.postedAt.toISOString(), soldAt: (sale as unknown as { soldAt?: Date }).soldAt?.toISOString() ?? sale.postedAt.toISOString(), postedBy: sale.postedBy.name, reviewStatus: sale.accountingReview?.status ?? "UNVERIFIED", mismatchCategory: sale.accountingReview?.mismatchCategory ?? null, reviewNotes: sale.accountingReview?.notes ?? null, reportedComparison: parseReportedComparison(sale.accountingReview?.comparisonJson, namesByItemCode), branchResponse: sale.accountingReview?.branchResponse ?? null, branchResponseNote: sale.accountingReview?.branchResponseNote ?? null, branchReplacementReceiptNumber: sale.accountingReview?.branchReplacementReceiptNumber ?? null, branchRespondedAt: sale.accountingReview?.branchRespondedAt?.toISOString() ?? null, receiptPhotoUrl: sale.accountingReview?.receiptPhotoKey ? `/api/accounting/receipts/${sale.id}/photo?v=${sale.accountingReview.evidenceUploadedAt?.getTime() ?? sale.accountingReview.receiptOcrAt?.getTime() ?? 0}` : null, receiptOcrStatus: sale.accountingReview?.receiptOcrStatus ?? null, receiptOcrDraft: parseReceiptOcrDraft(sale.accountingReview?.receiptOcrJson), receiptOcrError: sale.accountingReview?.receiptOcrError ?? null, receiptOcrAt: sale.accountingReview?.receiptOcrAt?.toISOString() ?? null, reviewedAt: sale.accountingReview?.reviewedAt?.toISOString() ?? null, resolutionAction: sale.accountingReview?.resolutionAction ?? null, resolutionNote: sale.accountingReview?.resolutionNote ?? null, resolvedAt: sale.accountingReview?.resolvedAt?.toISOString() ?? null, correctionOfId: sale.correctionOfId ?? null, refundedAmount: sale.refunds.reduce((sum, refund) => sum + refund.amount.toNumber(), 0), refunds: sale.refunds.map((refund) => ({ id: refund.id, reference: refund.reference, amount: serializeMoney(refund.amount), acknowledgementNumber: refund.acknowledgementNumber, reason: refund.reason, refundedBy: refund.refundedBy.name, refundedAt: refund.refundedAt.toISOString(), stockBranch: refund.stockLocation ? `${refund.stockLocation.code} - ${refund.stockLocation.name}` : null, lines: refund.lines.map((line) => ({ itemCode: line.productItemCode, name: line.productName, quantity: line.quantity, disposition: line.disposition })) })), lines: sale.lines.map((line) => ({ productId: line.productId, itemCode: line.productItemCode, name: line.productName, quantity: line.quantity, unitPrice: serializeMoney(line.unitPrice) })) };
}

function serializeSaleCorrectionRequest(request: {
  id: string;
  reason: SaleCorrectionRequestDto["reason"];
  note: string;
  status: SaleCorrectionRequestDto["status"];
  resolution: SaleCorrectionRequestDto["resolution"];
  resolutionNote: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  requestedBy: { name: string };
  resolvedBy: { name: string } | null;
}): SaleCorrectionRequestDto {
  return {
    id: request.id,
    reason: request.reason,
    note: request.note,
    status: request.status,
    resolution: request.resolution,
    resolutionNote: request.resolutionNote,
    requestedBy: request.requestedBy.name,
    requestedAt: request.requestedAt.toISOString(),
    resolvedBy: request.resolvedBy?.name ?? null,
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  };
}

function serializeSaleWithCorrection(
  sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>,
) {
  const request = sale.correctionRequests[0] ?? null;
  const serialized = serializeSale(sale);
  const photoVersion = sale.accountingReview?.receiptPhotoKey
    ? receiptEvidenceVersion(sale.accountingReview.receiptPhotoKey)
    : null;
  return {
    ...serialized,
    receiptPhotoVersion: photoVersion,
    receiptPhotoUrl: serialized.receiptPhotoUrl && photoVersion
      ? `${serialized.receiptPhotoUrl}&version=${photoVersion}`
      : null,
    salesperson: serializeSalespersonSnapshot(sale),
    correctionRequest: request ? serializeSaleCorrectionRequest(request) : null,
  };
}
