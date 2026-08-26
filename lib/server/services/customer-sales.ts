import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type CustomerOrderStatus, type CustomerOrderType, type PaymentMethod } from "@prisma/client";
import { z } from "zod";

import type { AuthContext } from "../authorization";
import { prisma } from "../prisma";

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

export const customerOrderMutationSchema = z.object({
  customer: customerMutationSchema.extend({ id: z.string().optional() }),
  type: z.enum(["RESERVATION_NO_DP", "RESERVATION_WITH_DP", "WAITING_STOCK"]),
  expectedReleaseDate: z.string().optional(),
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

export const directSaleSchema = z.object({
  customerId: z.string().optional(),
  customer: customerMutationSchema.optional(),
  receiptBooklet: z.string().trim().max(50).default(""),
  manualReceiptNumber: z.string().trim().min(1).max(100),
  paymentMethod: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).default("CASH"),
  amountPaid: money,
  notes: z.string().trim().max(1_000).optional(),
  lines: z.array(z.object({ productId: z.string().min(1), quantity: positiveInt, unitPrice: money.optional() })).min(1),
});

export const accountingReviewSchema = z.object({
  status: z.enum(["VERIFIED"]),
});

export class CustomerSalesError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

function assertBranchOrAdmin(actor: AuthContext) {
  if (actor.role !== "BRANCH_STAFF" && actor.role !== "ADMIN") throw new CustomerSalesError("FORBIDDEN", "Branch Staff or Admin access required", 403);
}

function assertAccounting(actor: AuthContext) {
  if (actor.role !== "ACCOUNTING_STAFF") throw new CustomerSalesError("FORBIDDEN", "Accounting access required", 403);
}

function assertAccountingStrict(actor: AuthContext) {
  if (actor.role !== "ACCOUNTING_STAFF") throw new CustomerSalesError("FORBIDDEN", "Accounting Staff access required", 403);
}

function actorLocationId(actor: AuthContext) {
  if (actor.role !== "BRANCH_STAFF" || !actor.locationId || actor.location?.id !== actor.locationId || actor.location.type !== "BRANCH" || !actor.location.isActive) {
    throw new CustomerSalesError("FORBIDDEN", "Branch Staff must be assigned to an active branch", 403);
  }
  return actor.locationId;
}

function decimal(value: number) { return new Prisma.Decimal(value); }
function serializeMoney(value: Prisma.Decimal) { return value.toNumber(); }

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
    const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId, productId: line.productId } } });
    if (!balance || balance.onHand - balance.reserved < line.quantity) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Not enough available branch stock", 409);
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { increment: line.quantity }, version: { increment: 1 } } });
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
    const balance = await tx.inventoryBalance.findUnique({ where: { locationId_productId: { locationId, productId: line.productId } } });
    if (!balance || balance.onHand - balance.reserved < line.quantity) throw new CustomerSalesError("INSUFFICIENT_STOCK", "Not enough available branch stock", 409);
    await tx.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: { decrement: line.quantity }, version: { increment: 1 } } });
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
  if (actor.role === "ACCOUNTING_STAFF") throw new CustomerSalesError("FORBIDDEN", "Accounting cannot create customers", 403);
  return prisma.customer.create({ data: { name: input.name, mobile: input.mobile || null, email: input.email || null, address: input.address || null, source: input.source || null, notes: input.notes || null, createdById: actor.userId } });
}

export async function listCustomers(actor: AuthContext) {
  if (actor.role === "STOCK_STAFF") throw new CustomerSalesError("FORBIDDEN", "Stock Staff cannot view customers", 403);
  const customers = await prisma.customer.findMany({ where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 200 });
  return customers.map((customer) => ({ id: customer.id, name: customer.name, mobile: customer.mobile, email: customer.email, source: customer.source, notes: customer.notes, createdAt: customer.createdAt.toISOString() }));
}

export async function createCustomerOrder(actor: AuthContext, input: z.infer<typeof customerOrderMutationSchema>) {
  assertBranchOrAdmin(actor);
  const locationId = actorLocationId(actor);
  if (input.type === "RESERVATION_WITH_DP" && (!input.downpaymentReceiptNumber || input.downpaymentAmount <= 0)) throw new CustomerSalesError("DOWNPAYMENT_REQUIRED", "Downpayment orders require amount and receipt", 400);
  if (input.type !== "RESERVATION_WITH_DP" && input.downpaymentAmount > 0) throw new CustomerSalesError("INVALID_DOWNPAYMENT", "Only DP reservations may carry downpayment", 400);
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) throw new CustomerSalesError("INVALID_LINES", "A product may appear only once", 400);

  try {
    return await prisma.$transaction(async (tx) => {
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
  const where = actor.role === "BRANCH_STAFF" ? { locationId: actorLocationId(actor) } : {};
  const orders = await prisma.customerOrder.findMany({ where, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE, take: 200 });
  return orders.map(serializeOrder);
}

export async function releaseCustomerOrder(actor: AuthContext, id: string, input: z.infer<typeof releaseOrderSchema>) {
  assertBranchOrAdmin(actor);
  try {
    return await prisma.$transaction(async (tx) => {
    const order = await tx.customerOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
    if (actor.role === "BRANCH_STAFF" && order.locationId !== actorLocationId(actor)) throw new CustomerSalesError("FORBIDDEN", "Order is outside assigned branch", 403);
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
  assertBranchOrAdmin(actor);
  return prisma.$transaction(async (tx) => {
    const order = await tx.customerOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!order) throw new CustomerSalesError("NOT_FOUND", "Order not found", 404);
    if (actor.role === "BRANCH_STAFF" && order.locationId !== actorLocationId(actor)) throw new CustomerSalesError("FORBIDDEN", "Order is outside assigned branch", 403);
    if (order.status === "COMPLETED" || order.status === "CANCELLED") throw new CustomerSalesError("INVALID_STATUS", "Completed or cancelled orders cannot be cancelled", 409);
    if (order.downpaymentAmount.toNumber() > 0 && (actor.role !== "ADMIN" || !input.note)) throw new CustomerSalesError("DP_CANCEL_ADMIN_ONLY", "Downpayment cancellation requires Admin note", 403);
    if (order.status === "RESERVED" || order.status === "READY_FOR_RELEASE") {
      for (const line of order.lines) await tx.inventoryBalance.update({ where: { locationId_productId: { locationId: order.locationId, productId: line.productId } }, data: { reserved: { decrement: line.quantity }, version: { increment: 1 } } });
    }
    return serializeOrder(await tx.customerOrder.update({ where: { id }, data: { status: "CANCELLED", cancellationNote: input.note || null, cancelledById: actor.userId, cancelledAt: new Date() }, include: ORDER_INCLUDE }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createDirectSale(actor: AuthContext, input: z.infer<typeof directSaleSchema>) {
  assertBranchOrAdmin(actor);
  const locationId = actorLocationId(actor);
  const productIds = input.lines.map((line) => line.productId);
  if (new Set(productIds).size !== productIds.length) throw new CustomerSalesError("INVALID_LINES", "A product may appear only once", 400);
  try {
    return await prisma.$transaction(async (tx) => {
    const products = await activeProducts(tx, productIds);
    const customerId = input.customerId ?? (input.customer ? await resolveCustomer(tx, actor, input.customer) : null);
    const total = input.lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice ?? products.get(line.productId)!.price?.toNumber() ?? 0), 0);
    if (input.amountPaid !== total) throw new CustomerSalesError("INVALID_PAYMENT", "Direct sale payment must match total", 400);
    await deductSaleLines(tx, locationId, input.lines);
    const sale = await tx.sale.create({ data: { reference: `SALE-${randomUUID()}`, manualReceiptNumber: input.manualReceiptNumber, receiptBooklet: input.receiptBooklet ?? "", locationId, customerId, paymentMethod: input.paymentMethod as PaymentMethod, totalAmount: decimal(total), amountPaid: decimal(input.amountPaid), notes: input.notes || null, postedById: actor.userId, lines: { create: input.lines.map((line) => { const product = products.get(line.productId)!; return { productId: product.id, productItemCode: product.itemCode, productName: product.name, quantity: line.quantity, unitPrice: decimal(line.unitPrice ?? product.price?.toNumber() ?? 0) }; }) }, accountingReview: { create: {} } }, include: SALE_INCLUDE });
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
  const where = actor.role === "BRANCH_STAFF" ? { locationId: actorLocationId(actor) } : {};
  const sales = await prisma.sale.findMany({ where, orderBy: { postedAt: "desc" }, include: SALE_INCLUDE, take: 200 });
  return sales.map(serializeSale);
}

export async function getSaleById(actor: AuthContext, saleId: string) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE });
  if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
  if (actor.role === "BRANCH_STAFF" && sale.locationId !== actorLocationId(actor)) throw new CustomerSalesError("FORBIDDEN", "Sale is outside assigned branch", 403);
  return serializeSale(sale);
}

export async function reviewSale(actor: AuthContext, saleId: string, input: z.infer<typeof accountingReviewSchema>) {
  assertAccountingStrict(actor);
  return prisma.$transaction(async (tx) => {
    // Lock sale and review for Serializable safety
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { accountingReview: true } });
    if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
    if (sale.status !== "POSTED") throw new CustomerSalesError("INVALID_STATE", "Only posted sales can be verified", 409);
    const review = sale.accountingReview ?? await tx.saleAccountingReview.findUnique({ where: { saleId } });
    if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    // Lock review row as well
    await tx.$queryRaw`SELECT id FROM "SaleAccountingReview" WHERE id = ${review.id} FOR UPDATE`;
    const freshReview = await tx.saleAccountingReview.findUnique({ where: { id: review.id } });
    if (!freshReview) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    if (freshReview.status !== "UNVERIFIED") throw new CustomerSalesError("INVALID_STATE", "Sale has already been verified", 409);
    if (input.status !== "VERIFIED") throw new CustomerSalesError("INVALID_STATE", "Only VERIFIED is allowed", 400);
    const updated = await tx.saleAccountingReview.update({
      where: { id: freshReview.id },
      data: { status: "VERIFIED", reviewedById: actor.userId, reviewedAt: new Date(), mismatchCategory: null, notes: null },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function dayStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function saleScope(actor: AuthContext): Prisma.SaleWhereInput {
  return actor.role === "BRANCH_STAFF" ? { locationId: actorLocationId(actor) } : {};
}

function orderScope(actor: AuthContext): Prisma.CustomerOrderWhereInput {
  return actor.role === "BRANCH_STAFF" ? { locationId: actorLocationId(actor) } : {};
}

export async function getDashboardSummary(actor: AuthContext) {
  const scopedSales = saleScope(actor);
  const scopedOrders = orderScope(actor);
  const today = dayStart();
  const month = monthStart();
  const [todaySales, mtdSales, openOrders, readyOrders, flagged, unverified, lowBalances] = await Promise.all([
    prisma.sale.aggregate({ where: { ...scopedSales, status: "POSTED", postedAt: { gte: today } }, _sum: { totalAmount: true }, _count: true }),
    prisma.sale.aggregate({ where: { ...scopedSales, status: "POSTED", postedAt: { gte: month } }, _sum: { totalAmount: true }, _count: true }),
    prisma.customerOrder.count({ where: { ...scopedOrders, status: { in: ["RESERVED", "WAITING_STOCK", "READY_FOR_RELEASE"] } } }),
    prisma.customerOrder.count({ where: { ...scopedOrders, status: "READY_FOR_RELEASE" } }),
    prisma.saleAccountingReview.count({ where: { status: "MISMATCH_REPORTED", sale: scopedSales } }),
    prisma.saleAccountingReview.count({ where: { status: "UNVERIFIED", sale: scopedSales } }),
    prisma.inventoryBalance.findMany({
      where: actor.role === "BRANCH_STAFF" ? { locationId: actorLocationId(actor) } : {},
      include: { product: { select: { itemCode: true, name: true } }, location: { select: { name: true } } },
      take: 100,
    }),
  ]);
  const lowStock = lowBalances
    .filter((balance) => balance.onHand - balance.reserved <= balance.reorderLevel)
    .slice(0, 10)
    .map((balance) => ({ itemCode: balance.product.itemCode, name: balance.product.name, location: balance.location.name, available: balance.onHand - balance.reserved, reorderLevel: balance.reorderLevel }));

  return {
    role: actor.role,
    todaySales: todaySales._sum.totalAmount?.toNumber() ?? 0,
    todayTransactions: todaySales._count,
    monthSales: mtdSales._sum.totalAmount?.toNumber() ?? 0,
    monthTransactions: mtdSales._count,
    openOrders,
    readyOrders,
    unverifiedSales: unverified,
    flaggedSales: flagged,
    lowStock,
  };
}

export async function getReportsSummary(actor: AuthContext) {
  assertAccounting(actor);
  const sales = await listSales(actor);
  const orders = await listCustomerOrders(actor);
  const inventory = actor.role === "ADMIN"
    ? await prisma.inventoryBalance.findMany({ include: { product: true, location: true }, take: 500 })
    : [];
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
    inventory: inventory.map((balance) => ({ itemCode: balance.product.itemCode, name: balance.product.name, category: balance.product.category, brand: balance.product.brand, productStatus: balance.product.status, location: balance.location.name, onHand: balance.onHand, reserved: balance.reserved, available: balance.onHand - balance.reserved, reorderLevel: balance.reorderLevel })),
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
  return { id: order.id, orderNo: order.reference, customer: order.customer.name, branch: order.location.name, itemSummary: order.lines.map((line) => line.productName).join(", "), totalItems: order.lines.reduce((sum, line) => sum + line.quantity, 0), status: statusLabels[order.status], type: order.type, paymentStatus: order.remainingBalance.toNumber() === 0 ? "Paid" : order.downpaymentAmount.toNumber() > 0 ? "Partial" : "Unpaid", downpayment: serializeMoney(order.downpaymentAmount), totalAmount: serializeMoney(order.totalAmount), balance: serializeMoney(order.remainingBalance), orderDate: order.createdAt.toISOString(), releaseDate: order.expectedReleaseDate?.toISOString() ?? "", cancelledAt: order.cancelledAt?.toISOString() ?? null, releasedAt: order.releasedAt?.toISOString() ?? null };
}

function serializeSale(sale: Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>) {
  return { id: sale.id, reference: sale.reference, manualReceiptNumber: sale.manualReceiptNumber, receiptBooklet: (sale as unknown as { receiptBooklet: string }).receiptBooklet ?? "", version: (sale as unknown as { version: number }).version ?? 1, branch: sale.location.name, customer: sale.customer?.name ?? "Guest", totalAmount: serializeMoney(sale.totalAmount), amountPaid: serializeMoney(sale.amountPaid), paymentMethod: sale.paymentMethod, status: sale.status, postedAt: sale.postedAt.toISOString(), postedBy: sale.postedBy.name, reviewStatus: sale.accountingReview?.status ?? "UNVERIFIED", lines: sale.lines.map((line) => ({ productId: line.productId, itemCode: line.productItemCode, name: line.productName, quantity: line.quantity, unitPrice: serializeMoney(line.unitPrice) })) };
}
