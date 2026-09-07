import "server-only";

import { z } from "zod";

import { REPORT_TYPES, type ReportResult } from "@/lib/contracts/reports";
import { availableStock } from "@/lib/inventory-quantity";
import { assertCapability, AuthorizationError, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { hasAllLocationAccess } from "@/lib/server/policy/access";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid date");

export const reportQuerySchema = z.object({
  type: z.enum(REPORT_TYPES).default("sales"),
  dateFrom: date.optional(),
  dateTo: date.optional(),
  branchId: z.string().trim().max(100).optional(),
  salespersonId: z.string().trim().max(100).optional(),
  source: z.enum(["DIRECT_SALE", "CUSTOMER_ORDER"]).optional(),
  paymentMethod: z.enum(["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"]).optional(),
  actorId: z.string().trim().max(100).optional(),
}).superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "End date must be on or after start date" });
  }
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

const MANILA_OFFSET = 8 * 60 * 60 * 1_000;

export function manilaDateKey(value: Date) {
  return new Date(value.getTime() + MANILA_OFFSET).toISOString().slice(0, 10);
}

export function defaultReportDates(now = new Date()) {
  const today = manilaDateKey(now);
  return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
}

function dateBoundary(value: string, end = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + (end ? 1 : 0)) - MANILA_OFFSET);
}

function locationFilter(actor: AuthContext, requested?: string) {
  if (requested && !hasAllLocationAccess(actor) && !actor.locationIds.includes(requested)) {
    throw new AuthorizationError("Report location is outside assigned locations");
  }
  if (requested) return requested;
  return hasAllLocationAccess(actor) ? undefined : { in: [...actor.locationIds] };
}

async function options(actor: AuthContext) {
  const scopedLocation = locationFilter(actor);
  const [locations, salespersons, movementActors] = await Promise.all([
    prisma.location.findMany({ where: { id: scopedLocation, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.personnel.findMany({ where: { locationId: scopedLocation, status: "ACTIVE", type: { in: ["SALESPERSON", "BOTH"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.user.findMany({ where: { inventoryMovements: { some: { locationId: scopedLocation } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    branches: locations.map((row) => ({ id: row.id, label: `${row.code} - ${row.name}` })),
    salespersons: salespersons.map((row) => ({ id: row.id, label: row.fullName })),
    actors: movementActors.map((row) => ({ id: row.id, label: row.name })),
  };
}

function dateRange(query: ReportQuery, defaults: boolean) {
  const fallback = defaultReportDates();
  const dateFrom = query.dateFrom ?? (defaults ? fallback.dateFrom : undefined);
  const dateTo = query.dateTo ?? (defaults ? fallback.dateTo : undefined);
  return {
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    where: dateFrom || dateTo ? {
      ...(dateFrom ? { gte: dateBoundary(dateFrom) } : {}),
      ...(dateTo ? { lt: dateBoundary(dateTo, true) } : {}),
    } : undefined,
  };
}

function totalInventory(rows: Array<{ onHand: number; reserved: number; quarantined: number; available: number }>) {
  return rows.reduce((sum, row) => ({
    onHand: sum.onHand + row.onHand,
    reserved: sum.reserved + row.reserved,
    quarantined: sum.quarantined + row.quarantined,
    available: sum.available + row.available,
  }), { onHand: 0, reserved: 0, quarantined: 0, available: 0 });
}

export async function getReport(actor: AuthContext, rawQuery: unknown): Promise<ReportResult> {
  assertCapability(actor, "reports:view");
  const query = reportQuerySchema.parse(rawQuery);
  const filters = await options(actor);
  const base = { type: query.type, generatedAt: new Date().toISOString(), filters };
  const scopedLocation = locationFilter(actor, query.branchId);

  if (query.type === "sales") {
    const range = dateRange(query, true);
    const records = await prisma.sale.findMany({
      where: {
        locationId: scopedLocation,
        status: "POSTED",
        salespersonId: query.salespersonId,
        orderId: query.source === "DIRECT_SALE" ? null : query.source === "CUSTOMER_ORDER" ? { not: null } : undefined,
        paymentMethod: query.paymentMethod,
        accountingReview: { status: "VERIFIED", verifiedAt: range.where },
      },
      select: { id: true, manualReceiptNumber: true, receiptBooklet: true, orderId: true, paymentMethod: true, totalAmount: true, discountAmount: true, salespersonName: true, lines: { select: { quantity: true } }, customer: { select: { name: true } }, location: { select: { name: true } }, accountingReview: { select: { verifiedAt: true } } },
      orderBy: [{ accountingReview: { verifiedAt: "desc" } }, { id: "desc" }],
    });
    const rows = records.map((row) => ({ id: row.id, verifiedAt: row.accountingReview!.verifiedAt!.toISOString(), receipt: row.receiptBooklet ? `${row.receiptBooklet}-${row.manualReceiptNumber}` : row.manualReceiptNumber, branch: row.location.name, salesperson: row.salespersonName ?? "Unassigned", source: row.orderId ? "Customer Order" as const : "Direct Sale" as const, paymentMethod: row.paymentMethod, customer: row.customer?.name ?? "Guest", units: row.lines.reduce((sum, line) => sum + line.quantity, 0), discountAmount: row.discountAmount.toNumber(), totalAmount: row.totalAmount.toNumber() }));
    const grandAmount = rows.reduce((sum, row) => sum + row.totalAmount, 0);
    const totals = new Map<string, { branch: string; transactionCount: number; units: number; totalAmount: number; percentage: number }>();
    for (const row of rows) {
      const total = totals.get(row.branch) ?? { branch: row.branch, transactionCount: 0, units: 0, totalAmount: 0, percentage: 0 };
      total.transactionCount += 1;
      total.units += row.units;
      total.totalAmount += row.totalAmount;
      total.percentage = grandAmount ? (total.totalAmount / grandAmount) * 100 : 0;
      totals.set(row.branch, total);
    }
    return { ...base, type: "sales", dateFrom: range.dateFrom, dateTo: range.dateTo, rows, branchTotals: [...totals.values()].sort((a, b) => a.branch.localeCompare(b.branch)), grandTotal: { transactionCount: rows.length, units: rows.reduce((sum, row) => sum + row.units, 0), totalDiscount: rows.reduce((sum, row) => sum + row.discountAmount, 0), averageSale: rows.length ? grandAmount / rows.length : 0, totalAmount: grandAmount } };
  }

  if (query.type === "inventory-summary" || query.type === "low-stock") {
    const balances = await prisma.inventoryBalance.findMany({ where: { locationId: scopedLocation }, select: { id: true, onHand: true, reserved: true, quarantined: true, product: { select: { itemCode: true, name: true, reorderLevel: true } }, location: { select: { name: true } } }, orderBy: [{ location: { name: "asc" } }, { product: { itemCode: "asc" } }] });
    const allRows = balances.map((row) => { const available = availableStock(row); return { id: row.id, itemCode: row.product.itemCode, product: row.product.name, branch: row.location.name, onHand: row.onHand, reserved: row.reserved, quarantined: row.quarantined, available, reorderLevel: row.product.reorderLevel, suggestedReorder: Math.max(row.product.reorderLevel - available, 0) }; });
    const rows = query.type === "low-stock" ? allRows.filter((row) => row.available <= row.reorderLevel) : allRows;
    if (query.type === "low-stock") return { ...base, type: "low-stock", dateFrom: null, dateTo: null, rows };
    return { ...base, type: "inventory-summary", dateFrom: null, dateTo: null, rows, totals: totalInventory(rows) };
  }

  if (query.type === "inventory-movements") {
    const range = dateRange(query, true);
    const records = await prisma.inventoryMovement.findMany({ where: { locationId: scopedLocation, actorId: query.actorId, createdAt: range.where }, select: { id: true, occurredAt: true, createdAt: true, type: true, quantity: true, reference: true, product: { select: { itemCode: true, name: true } }, location: { select: { name: true } }, actor: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return { ...base, type: "inventory-movements", dateFrom: range.dateFrom, dateTo: range.dateTo, rows: records.map((row) => ({ id: row.id, occurredAt: row.occurredAt.toISOString(), createdAt: row.createdAt.toISOString(), branch: row.location?.name ?? "No location", itemCode: row.product.itemCode, product: row.product.name, type: row.type, quantity: row.quantity, actor: row.actor.name, reference: row.reference ?? "" })) };
  }

  const range = dateRange(query, true);
  const scope = { locationId: scopedLocation, createdAt: range.where };
  const [backjobs, warranties, claims] = await Promise.all([
    prisma.backjob.findMany({ where: scope, select: { id: true, createdAt: true, reference: true, locationName: true, customerName: true, affectedProductName: true, status: true, parts: { select: { plannedQuantity: true } } } }),
    prisma.customerWarranty.findMany({ where: scope, select: { id: true, createdAt: true, reference: true, locationName: true, customerName: true, productName: true, productItemCode: true, claimQuantity: true, status: true } }),
    prisma.supplierClaim.findMany({ where: scope, select: { id: true, createdAt: true, reference: true, locationName: true, supplierName: true, status: true, lines: { select: { productName: true, productItemCode: true, claimedQuantity: true } } } }),
  ]);
  const rows = [
    ...backjobs.map((row) => ({ id: row.id, recordType: "Backjob" as const, createdAt: row.createdAt.toISOString(), reference: row.reference, branch: row.locationName, party: row.customerName, item: row.affectedProductName ?? "Service", quantity: row.parts.reduce((sum, part) => sum + part.plannedQuantity, 0), status: row.status })),
    ...warranties.map((row) => ({ id: row.id, recordType: "Customer Warranty" as const, createdAt: row.createdAt.toISOString(), reference: row.reference, branch: row.locationName, party: row.customerName, item: `${row.productItemCode} - ${row.productName}`, quantity: row.claimQuantity, status: row.status })),
    ...claims.map((row) => ({ id: row.id, recordType: "Supplier Claim" as const, createdAt: row.createdAt.toISOString(), reference: row.reference, branch: row.locationName, party: row.supplierName, item: row.lines.map((line) => `${line.productItemCode} - ${line.productName}`).join(", "), quantity: row.lines.reduce((sum, line) => sum + line.claimedQuantity, 0), status: row.status })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ...base, type: "returns-warranty", dateFrom: range.dateFrom, dateTo: range.dateTo, rows };
}

export function queryFromSearchParams(searchParams: URLSearchParams): ReportQuery {
  return reportQuerySchema.parse(Object.fromEntries([...searchParams].filter(([, value]) => value !== "")));
}
