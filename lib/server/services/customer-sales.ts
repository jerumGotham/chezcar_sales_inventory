import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type CustomerOrderStatus, type CustomerOrderType, type PaymentMethod } from "@prisma/client";
import { z } from "zod";

import { receiptComparisonSchema, type ReceiptComparison } from "../../contracts/sales";
import {
  assertCapability,
  AuthorizationError,
  type AuthContext,
} from "../authorization";
import { prisma } from "../prisma";
import { findActiveBranch } from "../locations";
import { canAccessLocation, hasAllLocationAccess } from "../policy/access";
import { createNotifications, notifyInventoryThresholdChange } from "./notifications";
import { isReceiptEvidenceKey } from "./receipt-evidence";
import { parseReceiptOcrDraft } from "./receipt-ocr";

const positiveInt = z.coerce.number().int().positive();
const money = z.coerce.number().min(0);

export const customerMutationSchema = z.object({
  name: z.string().trim().min(1).max(200),
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
  source: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1_000).optional(),
  downpaymentAmount: money.default(0),
  downpaymentReceiptNumber: z.string().trim().max(100).optional(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: positiveInt, finalUnitPrice: money.optional() })).min(1),
});

export const releaseOrderSchema = z.object({
  finalReceiptNumber: z.string().trim().min(1).max(100),
  amountPaid: money,
  paymentMethod: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).default("CASH"),
  notes: z.string().trim().max(1_000).optional(),
});

export const cancelOrderSchema = z.object({ note: z.string().trim().max(1_000).optional() });

export const orderPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(9_999_999_999.99),
  reference: z.string().trim().max(100).optional(),
});

export const directSaleSchema = z.object({
  locationId: z.string().optional(),
  customerId: z.string().optional(),
  customer: customerMutationSchema.optional(),
  receiptBooklet: z.string().trim().max(50).default(""),
  manualReceiptNumber: z.string().trim().min(1).max(100),
  paymentMethod: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).default("CASH"),
  discountAmount: money.default(0),
  amountPaid: money,
  notes: z.string().trim().max(1_000).optional(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: positiveInt, unitPrice: money.optional() })).min(1),
});

export const accountingReviewSchema = z.object({
  status: z.enum(["VERIFIED", "MISMATCH_REPORTED"]),
  mismatchCategory: z.enum(["PRICE_MISMATCH", "QUANTITY_MISMATCH", "ITEM_MISMATCH", "TOTAL_MISMATCH", "RECEIPT_NOT_FOUND", "OTHER"]).optional(),
  notes: z.string().trim().max(5_000).optional(),
  comparison: receiptComparisonSchema,
  receiptPhotoKey: z.string().trim().max(200).optional(),
}).superRefine((input, context) => {
  if (input.status === "MISMATCH_REPORTED" && !input.mismatchCategory) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mismatchCategory"], message: "Mismatch category is required" });
  }
  if (input.status === "MISMATCH_REPORTED" && !input.notes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Notes are required" });
  }
});

export const branchMismatchResponseSchema = z.object({
  response: z.enum(["ORIGINAL_ENCODING_CORRECT", "RECEIPT_CORRECTION_NEEDED"]),
  note: z.string().trim().min(1).max(5_000),
  replacementReceiptNumber: z.string().trim().min(1).max(100).optional(),
}).superRefine((input, context) => {
  if (input.response === "RECEIPT_CORRECTION_NEEDED" && !input.replacementReceiptNumber) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["replacementReceiptNumber"],
      message: "Replacement receipt number is required when correction is needed",
    });
  }
});

export const accountingResolutionSchema = z.object({
  action: z.enum(["CONFIRMED_CORRECT", "VOIDED_REPLACED"]),
  note: z.string().trim().min(1).max(5_000),
  replacement: receiptComparisonSchema.optional(),
  receiptPhotoKey: z.string().trim().max(200).optional(),
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

function receiptPhotoType(key: string | undefined) {
  return key?.endsWith(".jpg") ? "image/jpeg" : key?.endsWith(".png") ? "image/png" : key?.endsWith(".webp") ? "image/webp" : null;
}

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

async function notifySaleParties(tx: Prisma.TransactionClient, sale: { id: string; reference: string; manualReceiptNumber: string; postedById: string; locationId: string }, title: string, description: string) {
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
  await createNotifications(tx, Array.from(recipientIds).map((userId) => ({ userId, title, description, type: "WARNING" as const, relatedType: "SALE" as const, relatedId: sale.id, relatedReference: sale.reference })));
}

async function updateSaleInventory(tx: Prisma.TransactionClient, locationId: string, lines: Array<{ productId: string; quantity: number }>, direction: "reverse" | "deduct", actorId: string, reference: string) {
  for (const line of lines) {
    const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId, productId: line.productId } } });
    if (!balance) throw new CustomerSalesError("INVENTORY_NOT_FOUND", "Inventory balance is missing for corrected sale", 409);
    if (direction === "deduct" && balance.onHand - balance.reserved < line.quantity) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Corrected sale would make available stock negative", 409);
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: direction === "reverse" ? { increment: line.quantity } : { decrement: line.quantity }, version: { increment: 1 } } });
    await tx.inventoryMovement.create({ data: { productId: line.productId, locationId, quantity: direction === "reverse" ? line.quantity : -line.quantity, type: direction === "reverse" ? "SALE_CORRECTION_REVERSAL" : "SALE_CORRECTION", actorId, reference } });
  }
}

async function resolveCustomer(tx: Prisma.TransactionClient, actor: AuthContext, input: z.infer<typeof customerMutationSchema> & { id?: string }) {
  if (input.id) {
    const customer = await tx.customer.findFirst({ where: { id: input.id, status: "ACTIVE" } });
    if (!customer) throw new CustomerSalesError("INVALID_CUSTOMER", "Customer not found", 404);
    return customer.id;
  }
  const customer = await tx.customer.create({ data: { name: input.name, mobile: input.mobile || null, email: input.email || null, address: input.address || null, source: input.source || null, notes: input.notes || null, createdById: actor.userId } });
  return customer.id;
}

async function reserveLines(tx: Prisma.TransactionClient, locationId: string, lines: Array<{ productId: string; quantity: number }>) {
  for (const line of lines) {
    const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId, productId: line.productId } }, include: { product: { select: { itemCode: true, name: true, reorderLevel: true } }, location: { select: { name: true } } } });
    if (!balance || balance.onHand - balance.reserved < line.quantity) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Not enough available branch stock", 409);
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { increment: line.quantity }, version: { increment: 1 } } });
    await notifyInventoryThresholdChange(tx, { balanceId: balance.id, locationId, locationName: balance.location.name, productItemCode: balance.product.itemCode, productName: balance.product.name, reorderLevel: balance.product.reorderLevel, previousAvailable: balance.onHand - balance.reserved, nextAvailable: balance.onHand - balance.reserved - line.quantity });
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
    if (!balance || balance.onHand - balance.reserved < line.quantity) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Not enough available branch stock", 409);
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: { decrement: line.quantity }, version: { increment: 1 } } });
    await notifyInventoryThresholdChange(tx, { balanceId: balance.id, locationId, locationName: balance.location.name, productItemCode: balance.product.itemCode, productName: balance.product.name, reorderLevel: balance.product.reorderLevel, previousAvailable: balance.onHand - balance.reserved, nextAvailable: balance.onHand - balance.reserved - line.quantity });
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

async function activeProducts(tx: Prisma.TransactionClient, ids: string[]) {
  const products = await tx.product.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true, itemCode: true, name: true, price: true } });
  if (products.length !== new Set(ids).size) throw new CustomerSalesError("INVALID_LINES", "Every line must reference an active product", 400);
  return new Map(products.map((product) => [product.id, product]));
}

export async function createCustomer(actor: AuthContext, input: z.infer<typeof customerMutationSchema>) {
  assertCapability(actor, "customers:create");
  return prisma.customer.create({ data: { name: input.name, mobile: input.mobile || null, email: input.email || null, address: input.address || null, source: input.source || null, notes: input.notes || null, createdById: actor.userId } });
}

export async function updateCustomer(actor: AuthContext, id: string, input: z.infer<typeof customerMutationSchema>) {
  assertCapability(actor, "customers:update");
  try {
    return await prisma.customer.update({
      where: { id },
      data: { name: input.name, mobile: input.mobile || null, email: input.email || null, address: input.address || null, source: input.source || null, notes: input.notes || null },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new CustomerSalesError("NOT_FOUND", "Customer not found", 404);
    throw error;
  }
}

export async function deactivateCustomer(actor: AuthContext, id: string) {
  assertCapability(actor, "customers:deactivate");
  try {
    return await prisma.customer.update({ where: { id }, data: { status: "INACTIVE" } });
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
    const products = await activeProducts(tx, productIds);
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
    return serializeOrder(order);
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

export async function getCustomerOrderById(actor: AuthContext, id: string) {
  assertCapability(actor, "customer-orders:view");
  const order = await prisma.customerOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
  assertOperationalResource(actor, order.locationId);
  return serializeOrder(order);
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
    const order = await tx.customerOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
    assertOperationalResource(actor, order.locationId);
    if (order.status !== "RESERVED" && order.status !== "READY_FOR_RELEASE") throw new CustomerSalesError("INVALID_STATUS", "Only reserved orders can be released", 409);
    if (input.amountPaid !== order.remainingBalance.toNumber()) throw new CustomerSalesError("INVALID_BALANCE", "Amount paid must match remaining balance", 400);
    await releaseReservedLines(tx, order.locationId, order.lines);
    const sale = await tx.sale.create({ data: { reference: `SALE-${randomUUID()}`, manualReceiptNumber: input.finalReceiptNumber, receiptBooklet: "", locationId: order.locationId, customerId: order.customerId, orderId: order.id, paymentMethod: input.paymentMethod as PaymentMethod, totalAmount: order.totalAmount, amountPaid: decimal(input.amountPaid), notes: input.notes || null, postedById: actor.userId, lines: { create: order.lines.map((line) => ({ productId: line.productId, productItemCode: line.productItemCode, productName: line.productName, quantity: line.quantity, unitPrice: line.finalUnitPrice })) }, accountingReview: { create: {} } } });
    await registerReceipt(tx, input.finalReceiptNumber, "CUSTOMER_ORDER_FINAL", { orderId: order.id, saleId: sale.id, locationId: order.locationId, receiptBooklet: "" });
    for (const line of order.lines) await tx.inventoryMovement.create({ data: { productId: line.productId, locationId: order.locationId, quantity: -line.quantity, type: "CUSTOMER_ORDER_RELEASE", actorId: actor.userId, reference: input.finalReceiptNumber, remarks: `Released order ${order.reference}` } });
    const updated = await tx.customerOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", finalReceiptNumber: input.finalReceiptNumber, remainingBalance: decimal(0), releasedById: actor.userId, releasedAt: new Date() }, include: ORDER_INCLUDE });
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

      if (input.reference) {
        await registerReceipt(tx, input.reference, "CUSTOMER_ORDER_PAYMENT", {
          orderId: order.id,
          locationId: order.locationId,
          receiptBooklet: "",
        });
      }
      const currentDownpayment = order.downpaymentAmount.toNumber();
      const updated = await tx.customerOrder.update({
        where: { id: order.id },
        data: {
          downpaymentAmount: decimal(currentDownpayment + input.amount),
          remainingBalance: decimal(remainingBalance - input.amount),
          downpaymentReceiptNumber:
            order.downpaymentReceiptNumber ?? input.reference ?? null,
          type:
            order.type === "RESERVATION_NO_DP"
              ? "RESERVATION_WITH_DP"
              : order.type,
        },
        include: ORDER_INCLUDE,
      });
      return serializeOrder(updated);
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
  try {
    return await prisma.$transaction(async (tx) => {
    const location = await findActiveBranch(locationId, tx);
    if (!location) throw new CustomerSalesError("INVALID_LOCATION", "Select an active branch", 400);
    const products = await activeProducts(tx, productIds);
    const customerId = input.customerId ?? (input.customer ? await resolveCustomer(tx, actor, input.customer) : null);
    const subtotal = input.lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice ?? products.get(line.productId)!.price?.toNumber() ?? 0), 0);
    if (input.discountAmount > subtotal) throw new CustomerSalesError("INVALID_DISCOUNT", "Discount cannot exceed sale subtotal", 400);
    const total = subtotal - input.discountAmount;
    if (input.amountPaid !== total) throw new CustomerSalesError("INVALID_PAYMENT", "Direct sale payment must match total", 400);
    await deductSaleLines(tx, locationId, input.lines);
    const sale = await tx.sale.create({ data: { reference: `SALE-${randomUUID()}`, manualReceiptNumber: input.manualReceiptNumber, receiptBooklet: input.receiptBooklet ?? "", locationId, customerId, paymentMethod: input.paymentMethod as PaymentMethod, totalAmount: decimal(total), discountAmount: decimal(input.discountAmount), amountPaid: decimal(input.amountPaid), notes: input.notes || null, postedById: actor.userId, lines: { create: input.lines.map((line) => { const product = products.get(line.productId)!; return { productId: product.id, productItemCode: product.itemCode, productName: product.name, quantity: line.quantity, unitPrice: decimal(line.unitPrice ?? product.price?.toNumber() ?? 0) }; }) }, accountingReview: { create: {} } }, include: SALE_INCLUDE });
    await registerReceipt(tx, input.manualReceiptNumber, "DIRECT_SALE", { saleId: sale.id, locationId, receiptBooklet: input.receiptBooklet ?? "" });
    for (const line of input.lines) await tx.inventoryMovement.create({ data: { productId: line.productId, locationId, quantity: -line.quantity, type: "DIRECT_SALE", actorId: actor.userId, reference: input.receiptBooklet ? `${input.receiptBooklet}-${input.manualReceiptNumber}` : input.manualReceiptNumber, remarks: `Direct sale ${sale.reference}` } });
    return serializeSale(sale);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerSalesError("DUPLICATE_RECEIPT", "Manual receipt number already exists", 409);
    throw error;
  }
}

const SALE_INCLUDE = { customer: true, location: true, lines: true, accountingReview: true, postedBy: { select: { name: true } } } as const;

export async function listSales(actor: AuthContext) {
  assertCapability(actor, "sales:view");
  const where = { locationId: locationIdFilter(actor) };
  const sales = await prisma.sale.findMany({ where, orderBy: { postedAt: "desc" }, include: SALE_INCLUDE, take: 200 });
  return sales.map(serializeSale);
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
    prisma.sale.count({ where: { ...baseWhere, accountingReview: { status: "UNVERIFIED" } } }),
    prisma.sale.count({ where: { ...baseWhere, accountingReview: { status: "VERIFIED" } } }),
    prisma.sale.count({ where: { ...baseWhere, accountingReview: { status: "MISMATCH_REPORTED" } } }),
    prisma.sale.count({ where: { ...baseWhere, accountingReview: { receiptPhotoKey: null } } }),
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
    data: sales.map(serializeSale),
    meta: { page, pageSize: input.pageSize, totalItems, totalPages, unverified, verified, mismatches, missingEvidence },
  };
}

export async function getSaleById(actor: AuthContext, saleId: string) {
  assertCapability(actor, "sales:view");
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE });
  if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
  assertOperationalResource(actor, sale.locationId);
  return serializeSale(sale);
}

export async function reviewSale(actor: AuthContext, saleId: string, input: z.infer<typeof accountingReviewSchema>) {
  assertCapability(actor, "sales:verify");
  assertAccounting(actor);
  assertUniqueComparisonLines(input.comparison);
  if (input.receiptPhotoKey && !isReceiptEvidenceKey(input.receiptPhotoKey)) throw new CustomerSalesError("INVALID_INPUT", "Invalid receipt evidence key", 400);
  return prisma.$transaction(async (tx) => {
    // Lock sale and review for Serializable safety
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { accountingReview: true, lines: true } });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    if (sale.status !== "POSTED") throw new CustomerSalesError("INVALID_STATE", "Only posted sales can be verified", 409);
    const review = sale.accountingReview ?? await tx.saleAccountingReview.findUnique({ where: { saleId } });
    if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    // Lock review row as well
    await tx.$queryRaw`SELECT id FROM "SaleAccountingReview" WHERE id = ${review.id} FOR UPDATE`;
    const freshReview = await tx.saleAccountingReview.findUnique({ where: { id: review.id } });
    if (!freshReview) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    if (freshReview.status === "VERIFIED") throw new CustomerSalesError("INVALID_STATE", "Sale has already been verified", 409);
    if (input.status === "VERIFIED" && !freshReview.receiptPhotoKey) {
      throw new CustomerSalesError("RECEIPT_EVIDENCE_REQUIRED", "Attach the handwritten receipt photo before verifying this sale", 409);
    }
    const differences = compareReceipt(sale, input.comparison);
    if (input.status === "VERIFIED" && differences.length > 0) throw new CustomerSalesError("RECEIPT_MISMATCH", differences.join("; "), 409);
    const updated = await tx.saleAccountingReview.update({
      where: { id: freshReview.id },
      data: {
        status: input.status,
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        mismatchCategory: input.status === "MISMATCH_REPORTED" ? input.mismatchCategory : null,
        notes: input.status === "MISMATCH_REPORTED" ? input.notes : null,
        comparisonJson: JSON.stringify({ comparison: input.comparison, differences }),
        receiptPhotoKey: input.receiptPhotoKey ?? freshReview.receiptPhotoKey,
        receiptPhotoType: receiptPhotoType(input.receiptPhotoKey) ?? freshReview.receiptPhotoType,
      },
    });
    if (input.status === "MISMATCH_REPORTED") {
      await notifySaleParties(tx, sale, "Receipt mismatch reported", `${sale.manualReceiptNumber} was flagged for ${input.mismatchCategory}.`);
    }
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
    if (sale.status !== "POSTED" || sale.accountingReview?.status !== "MISMATCH_REPORTED" || sale.accountingReview.resolvedAt) {
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
    const review = await tx.saleAccountingReview.update({
      where: { id: sale.accountingReview.id },
      data: {
        branchResponse: input.response,
        branchResponseNote: input.note,
        branchReplacementReceiptNumber: input.response === "RECEIPT_CORRECTION_NEEDED" ? input.replacementReceiptNumber : null,
        branchRespondedById: actor.userId,
        branchRespondedAt: new Date(),
      },
    });
    const reviewers = await tx.user.findMany({
      where: {
        status: "ACTIVE",
        accessRole: { OR: [{ isOwner: true }, { permissions: { has: "sales:resolve" } }] },
        OR: [
          { accessRole: { isOwner: true } },
          { accessRole: { permissions: { has: "locations:all" } } },
          { locationAssignments: { some: { locationId: sale.locationId } } },
        ],
      },
      select: { id: true },
    });
    const responseLabel = input.response === "ORIGINAL_ENCODING_CORRECT" ? "confirmed the original encoding" : "confirmed that receipt correction is needed";
    await createNotifications(tx, reviewers.map((reviewer) => ({
      userId: reviewer.id,
      title: "Branch reviewed receipt mismatch",
      description: `${sale.manualReceiptNumber}: Branch ${responseLabel}.`,
      type: "INFO" as const,
      relatedType: "SALE" as const,
      relatedId: sale.id,
      relatedReference: sale.reference,
    })));
    return {
      branchResponse: review.branchResponse,
      branchResponseNote: review.branchResponseNote,
      branchReplacementReceiptNumber: review.branchReplacementReceiptNumber,
      branchRespondedAt: review.branchRespondedAt?.toISOString() ?? null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveSale(actor: AuthContext, saleId: string, input: z.infer<typeof accountingResolutionSchema>) {
  assertCapability(actor, input.action === "VOIDED_REPLACED" ? "sales:void-replace" : "sales:resolve");
  assertAccounting(actor);
  if (input.receiptPhotoKey && !isReceiptEvidenceKey(input.receiptPhotoKey)) throw new CustomerSalesError("INVALID_INPUT", "Invalid receipt evidence key", 400);
  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { accountingReview: true, lines: true } });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    assertOperationalResource(actor, sale.locationId);
    if (sale.status !== "POSTED" || sale.accountingReview?.status !== "MISMATCH_REPORTED") throw new CustomerSalesError("INVALID_STATE", "Only reported mismatches can be resolved", 409);
    const review = sale.accountingReview;
    if (!review.branchResponse) throw new CustomerSalesError("BRANCH_RESPONSE_REQUIRED", "Wait for the branch to review the mismatch", 409);
    if (input.action === "CONFIRMED_CORRECT" && review.branchResponse !== "ORIGINAL_ENCODING_CORRECT") throw new CustomerSalesError("INVALID_RESOLUTION", "Branch did not confirm the original encoding", 409);
    if (input.action === "VOIDED_REPLACED" && review.branchResponse !== "RECEIPT_CORRECTION_NEEDED") throw new CustomerSalesError("INVALID_RESOLUTION", "Branch did not confirm that receipt correction is needed", 409);
    const now = new Date();
    if (input.action === "CONFIRMED_CORRECT") {
      const updated = await tx.saleAccountingReview.update({ where: { id: review.id }, data: { status: "VERIFIED", resolutionAction: "CONFIRMED_CORRECT", resolutionNote: input.note, resolvedById: actor.userId, resolvedAt: now } });
      await notifySaleParties(tx, sale, "Receipt mismatch resolved", `${sale.manualReceiptNumber} was confirmed correct.`);
      return { action: input.action, review: updated };
    }

    const replacement = input.replacement;
    if (!replacement) throw new CustomerSalesError("INVALID_INPUT", "Replacement sale details are required", 400);
    assertUniqueComparisonLines(replacement);
    if (!review.branchReplacementReceiptNumber || replacement.receiptNumber !== review.branchReplacementReceiptNumber) throw new CustomerSalesError("INVALID_REPLACEMENT_RECEIPT", "Use the replacement receipt number confirmed by the branch", 409);
    const productIds = replacement.lines.map((line) => line.itemCode);
    if (new Set(productIds).size !== productIds.length) throw new CustomerSalesError("INVALID_LINES", "A replacement product may appear only once", 400);
    const products = await tx.product.findMany({ where: { itemCode: { in: productIds }, status: "ACTIVE" }, select: { id: true, itemCode: true, name: true } });
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
        accountingReview: { create: { status: "VERIFIED", reviewedById: actor.userId, reviewedAt: now, comparisonJson: JSON.stringify({ replacement }) } },
      },
      include: SALE_INCLUDE,
    });
    await registerReceipt(tx, replacement.receiptNumber, "SALE_CORRECTION", { saleId: replacementSale.id, locationId: sale.locationId, receiptBooklet: replacement.receiptBooklet });
    await tx.sale.update({ where: { id: sale.id }, data: { status: "VOIDED", correctedById: actor.userId, correctedAt: now } });
    await tx.saleAccountingReview.update({ where: { id: review.id }, data: { resolutionAction: "VOIDED_REPLACED", resolutionNote: input.note, resolvedById: actor.userId, resolvedAt: now } });
    await notifySaleParties(tx, sale, "Receipt mismatch corrected", `${sale.manualReceiptNumber} was voided and replaced by ${replacement.receiptNumber}.`);
    return { action: input.action, sale: serializeSale(replacementSale) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CustomerSalesError("DUPLICATE_RECEIPT", "Replacement receipt number already exists", 409);
    }
    throw error;
  }
}

function dayStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function saleScope(actor: AuthContext): Prisma.SaleWhereInput {
  return { locationId: locationIdFilter(actor) };
}

function orderScope(actor: AuthContext): Prisma.CustomerOrderWhereInput {
  return { locationId: locationIdFilter(actor) };
}

export async function getDashboardSummary(actor: AuthContext) {
  assertCapability(actor, "dashboard:view");
  const scopedSales = saleScope(actor);
  const scopedOrders = orderScope(actor);
  const inventoryScope: Prisma.InventoryBalanceWhereInput = { locationId: locationIdFilter(actor) };
  const transferScope: Prisma.StockTransferWhereInput = {
    destinationId: locationIdFilter(actor),
  };
  const today = dayStart();
  const month = monthStart();
  const trendStart = dayStart();
  trendStart.setDate(trendStart.getDate() - 29);
  const agedOrderDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  const [todaySales, mtdSales, openOrders, readyOrders, flagged, unverified, verifiedToday, agedOrders, lowBalances, supplierReceiptsToday, transferDrafts, transfersForDispatch, inTransitTransfers, discrepanciesNeedingAction, incomingTransfers, chartSales] = await Promise.all([
    prisma.sale.aggregate({ where: { ...scopedSales, status: "POSTED", postedAt: { gte: today } }, _sum: { totalAmount: true }, _count: true }),
    prisma.sale.aggregate({ where: { ...scopedSales, status: "POSTED", postedAt: { gte: month } }, _sum: { totalAmount: true }, _count: true }),
    prisma.customerOrder.count({ where: { ...scopedOrders, status: { in: ["RESERVED", "WAITING_STOCK", "READY_FOR_RELEASE"] } } }),
    prisma.customerOrder.count({ where: { ...scopedOrders, status: "READY_FOR_RELEASE" } }),
    prisma.saleAccountingReview.count({ where: { status: "MISMATCH_REPORTED", sale: scopedSales } }),
    prisma.saleAccountingReview.count({ where: { status: "UNVERIFIED", sale: scopedSales } }),
    prisma.saleAccountingReview.count({ where: { status: "VERIFIED", reviewedAt: { gte: today }, sale: scopedSales } }),
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
    prisma.sale.findMany({ where: { ...scopedSales, status: "POSTED", postedAt: { gte: trendStart } }, select: { postedAt: true, totalAmount: true, location: { select: { name: true } } } }),
  ]);
  const lowStock = lowBalances
    .filter((balance) => balance.onHand - balance.reserved <= balance.product.reorderLevel)
    .slice(0, 10)
    .map((balance) => ({ itemCode: balance.product.itemCode, name: balance.product.name, location: balance.location.name, available: balance.onHand - balance.reserved, reorderLevel: balance.product.reorderLevel }));
  const availableStock = lowBalances.reduce((sum, balance) => sum + Math.max(0, balance.onHand - balance.reserved), 0);
  const lowStockCount = lowBalances.filter((balance) => balance.onHand - balance.reserved <= balance.product.reorderLevel).length;
  const lowStockBranchCount = new Set(
    lowBalances
      .filter(
        (balance) =>
          balance.location.type === "BRANCH" &&
          balance.onHand - balance.reserved <= balance.product.reorderLevel,
      )
      .map((balance) => balance.locationId),
  ).size;
  const outOfStockCount = lowBalances.filter((balance) => balance.onHand - balance.reserved <= 0).length;
  const inactiveWithStockCount = lowBalances.filter((balance) => balance.product.status === "INACTIVE" && balance.onHand > 0).length;
  const trendByDate = new Map<string, { date: string; sales: number; transactions: number }>();
  for (let index = 0; index < 30; index += 1) {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + index);
    trendByDate.set(dateKey(date), { date: dateKey(date), sales: 0, transactions: 0 });
  }
  const branchByName = new Map<string, { branch: string; sales: number; transactions: number }>();
  for (const sale of chartSales) {
    const key = dateKey(sale.postedAt);
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

  return {
    capabilities: actor.capabilities,
    todaySales: todaySales._sum.totalAmount?.toNumber() ?? 0,
    todayTransactions: todaySales._count,
    monthSales: mtdSales._sum.totalAmount?.toNumber() ?? 0,
    monthTransactions: mtdSales._count,
    openOrders,
    readyOrders,
    unverifiedSales: unverified,
    flaggedSales: flagged,
    verifiedToday,
    agedOrders,
    availableStock,
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
  assertCapability(actor, "reports:view");
  assertAccounting(actor);
  const permittedLocationIds = locationIdFilter(actor);
  const [saleRecords, orderRecords, inventory] = await Promise.all([
    prisma.sale.findMany({ where: { locationId: permittedLocationIds }, orderBy: { postedAt: "desc" }, include: SALE_INCLUDE, take: 200 }),
    prisma.customerOrder.findMany({ where: { locationId: permittedLocationIds }, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE, take: 200 }),
    prisma.inventoryBalance.findMany({ where: { locationId: permittedLocationIds }, include: { product: true, location: true }, take: 500 }),
  ]);
  const sales = saleRecords.map(serializeSale);
  const orders = orderRecords.map(serializeOrder);
  return {
    sales: {
      totalSales: sales.filter((sale) => sale.status === "POSTED").reduce((sum, sale) => sum + sale.totalAmount, 0),
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
    inventory: inventory.map((balance) => ({ itemCode: balance.product.itemCode, name: balance.product.name, category: balance.product.category, brand: balance.product.brand, productStatus: balance.product.status, location: balance.location.name, onHand: balance.onHand, reserved: balance.reserved, available: balance.onHand - balance.reserved, reorderLevel: balance.product.reorderLevel })),
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
  return { id: order.id, orderNo: order.reference, customer: order.customer.name, branch: order.location.name, itemSummary: order.lines.map((line) => line.productName).join(", "), totalItems: order.lines.reduce((sum, line) => sum + line.quantity, 0), status: statusLabels[order.status], statusCode: order.status, type: order.type, paymentStatus: order.remainingBalance.toNumber() === 0 ? "Paid" : order.downpaymentAmount.toNumber() > 0 ? "Partial" : "Unpaid", downpayment: serializeMoney(order.downpaymentAmount), totalAmount: serializeMoney(order.totalAmount), balance: serializeMoney(order.remainingBalance), orderDate: order.createdAt.toISOString(), releaseDate: order.expectedReleaseDate?.toISOString() ?? "", finalReceiptNumber: order.finalReceiptNumber, downpaymentReceiptNumber: order.downpaymentReceiptNumber, notes: order.notes, cancelledAt: order.cancelledAt?.toISOString() ?? null, releasedAt: order.releasedAt?.toISOString() ?? null, lines: order.lines.map((line) => ({ productId: line.productId, itemCode: line.productItemCode, name: line.productName, quantity: line.quantity, unitPrice: serializeMoney(line.finalUnitPrice), amount: line.quantity * line.finalUnitPrice.toNumber() })) };
}

function parseReportedComparison(comparisonJson: string | null | undefined) {
  if (!comparisonJson) return null;
  try {
    const stored = JSON.parse(comparisonJson) as { comparison?: unknown; replacement?: unknown };
    const parsed = receiptComparisonSchema.safeParse(stored.comparison ?? stored.replacement);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function serializeSale(sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>) {
  return { id: sale.id, reference: sale.reference, source: sale.orderId ? "Customer Order" : "Direct Sale", manualReceiptNumber: sale.manualReceiptNumber, receiptBooklet: (sale as unknown as { receiptBooklet: string }).receiptBooklet ?? "", version: (sale as unknown as { version: number }).version ?? 1, branch: sale.location.name, customer: sale.customer?.name ?? "Guest", totalAmount: serializeMoney(sale.totalAmount), discountAmount: serializeMoney(sale.discountAmount), amountPaid: serializeMoney(sale.amountPaid), paymentMethod: sale.paymentMethod, status: sale.status, postedAt: sale.postedAt.toISOString(), postedBy: sale.postedBy.name, reviewStatus: sale.accountingReview?.status ?? "UNVERIFIED", mismatchCategory: sale.accountingReview?.mismatchCategory ?? null, reviewNotes: sale.accountingReview?.notes ?? null, reportedComparison: parseReportedComparison(sale.accountingReview?.comparisonJson), branchResponse: sale.accountingReview?.branchResponse ?? null, branchResponseNote: sale.accountingReview?.branchResponseNote ?? null, branchReplacementReceiptNumber: sale.accountingReview?.branchReplacementReceiptNumber ?? null, branchRespondedAt: sale.accountingReview?.branchRespondedAt?.toISOString() ?? null, receiptPhotoUrl: sale.accountingReview?.receiptPhotoKey ? `/api/accounting/receipts/${sale.id}/photo` : null, receiptOcrStatus: sale.accountingReview?.receiptOcrStatus ?? null, receiptOcrDraft: parseReceiptOcrDraft(sale.accountingReview?.receiptOcrJson), receiptOcrError: sale.accountingReview?.receiptOcrError ?? null, receiptOcrAt: sale.accountingReview?.receiptOcrAt?.toISOString() ?? null, reviewedAt: sale.accountingReview?.reviewedAt?.toISOString() ?? null, resolutionAction: sale.accountingReview?.resolutionAction ?? null, resolutionNote: sale.accountingReview?.resolutionNote ?? null, resolvedAt: sale.accountingReview?.resolvedAt?.toISOString() ?? null, correctionOfId: sale.correctionOfId ?? null, lines: sale.lines.map((line) => ({ productId: line.productId, itemCode: line.productItemCode, name: line.productName, quantity: line.quantity, unitPrice: serializeMoney(line.unitPrice) })) };
}
