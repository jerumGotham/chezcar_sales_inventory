import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { BackjobItemDto } from "@/lib/contracts/backjobs";
import {
  PAYMENT_METHODS,
  PRODUCT_STATUSES,
  REPORT_TYPES,
  RETURN_CASE_TYPES,
  RETURN_RESOLUTIONS,
  RETURN_STATUSES,
  SALE_SOURCES,
  reportMonthEnd,
  type InventoryReportRow,
  type ReportBreakdown,
  type ReportOption,
  type ReportResult,
} from "@/lib/contracts/reports";
import { availableStock } from "@/lib/inventory-quantity";
import { assertCapability, AuthorizationError, type AuthContext } from "@/lib/server/authorization";
import { hasAllLocationAccess } from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid date");
const optionalText = z.string().trim().min(1).max(100).optional();

const reportQueryBaseSchema = z.object({
  type: z.enum(REPORT_TYPES).default("sales"),
  dateFrom: date.optional(),
  dateTo: date.optional(),
  locationId: optionalText,
  salespersonId: optionalText,
  source: z.enum(SALE_SOURCES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  search: optionalText,
  category: optionalText,
  brand: optionalText,
  productStatus: z.enum(PRODUCT_STATUSES).optional(),
  caseType: z.enum(RETURN_CASE_TYPES).optional(),
  status: z.enum(RETURN_STATUSES).optional(),
  resolution: z.enum(RETURN_RESOLUTIONS).optional(),
  entitySearch: optionalText,
}).strict().superRefine((value, context) => {
  const allowed: Record<(typeof REPORT_TYPES)[number], ReadonlySet<string>> = {
    sales: new Set(["type", "dateFrom", "dateTo", "locationId", "salespersonId", "source", "paymentMethod"]),
    "inventory-summary": new Set(["type", "locationId", "search", "category", "brand", "productStatus"]),
    "returns-warranty": new Set(["type", "dateFrom", "dateTo", "locationId", "caseType", "status", "resolution", "entitySearch"]),
  };
  for (const [key, selected] of Object.entries(value)) {
    if (selected !== undefined && !allowed[value.type].has(key)) {
      context.addIssue({ code: "custom", path: [key], message: `${key} is not a valid ${value.type} report filter` });
    }
  }
});

export const reportQuerySchema = reportQueryBaseSchema.transform((value) => {
  if (!isDatedReport(value.type)) return value;
  const defaults = defaultReportDates();
  return { ...value, dateFrom: value.dateFrom ?? defaults.dateFrom, dateTo: value.dateTo ?? reportMonthEnd(value.dateFrom ?? defaults.dateFrom) };
}).superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "End date must be on or after start date" });
  }
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

const MANILA_OFFSET = 8 * 60 * 60 * 1_000;
const CLOSED_BACKJOB = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);
const CLOSED_WARRANTY = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);
const CLOSED_CLAIM = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);

function isDatedReport(type: (typeof REPORT_TYPES)[number]) {
  return type === "sales" || type === "returns-warranty";
}

export function manilaDateKey(value: Date) {
  return new Date(value.getTime() + MANILA_OFFSET).toISOString().slice(0, 10);
}

export function defaultReportDates(now = new Date()) {
  const today = manilaDateKey(now);
  return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: reportMonthEnd(today) };
}

function dateBoundary(value: string, end = false) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + (end ? 1 : 0)) - MANILA_OFFSET);
}

function locationFilter(actor: AuthContext) {
  return hasAllLocationAccess(actor) ? undefined : { in: [...actor.locationIds] };
}

type ReportLocation = { id: string; code: string; name: string };

async function options(query: ReportQuery, locations: ReportLocation[], effectiveLocations: ReportLocation[]) {
  const scopedLocation = { in: effectiveLocations.map((location) => location.id) };
  const inventoryProductStatus = query.type === "inventory-summary" ? query.productStatus : "ACTIVE";
  const [salespersons, categories, brands] = await Promise.all([
    query.type !== "sales" ? Promise.resolve([]) : prisma.personnel.findMany({ where: { locationId: scopedLocation, status: "ACTIVE", type: { in: ["SALESPERSON", "BOTH"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    query.type !== "inventory-summary" || !effectiveLocations.length ? Promise.resolve([]) : prisma.product.findMany({ where: { ...(inventoryProductStatus ? { status: inventoryProductStatus } : {}), category: { not: null } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    query.type !== "inventory-summary" || !effectiveLocations.length ? Promise.resolve([]) : prisma.product.findMany({ where: { ...(inventoryProductStatus ? { status: inventoryProductStatus } : {}), brand: { not: null } }, distinct: ["brand"], select: { brand: true }, orderBy: { brand: "asc" } }),
  ]);
  return {
    locations: locations.map((row) => ({ id: row.id, label: `${row.code} - ${row.name}` })),
    defaultLocationId: query.type === "inventory-summary" ? locations[0]?.id ?? null : null,
    salespersons: salespersons.map((row) => ({ id: row.id, label: row.fullName })),
    categories: categories.flatMap((row) => row.category ? [{ id: row.category, label: row.category }] : []),
    brands: brands.flatMap((row) => row.brand ? [{ id: row.brand, label: row.brand }] : []),
  };
}

function dateRange(query: ReportQuery, defaults: boolean) {
  const fallback = defaultReportDates();
  const dateFrom = query.dateFrom ?? (defaults ? fallback.dateFrom : undefined);
  const dateTo = query.dateTo ?? (defaults ? reportMonthEnd(dateFrom ?? fallback.dateFrom) : undefined);
  return {
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    where: dateFrom || dateTo ? {
      ...(dateFrom ? { gte: dateBoundary(dateFrom) } : {}),
      ...(dateTo ? { lt: dateBoundary(dateTo, true) } : {}),
    } : undefined,
  };
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function optionLabel(rows: ReportOption[], id: string | undefined) {
  return rows.find((row) => row.id === id)?.label ?? id ?? "";
}

function selectedFilters(query: ReportQuery, filters: Awaited<ReturnType<typeof options>>, range: ReturnType<typeof dateRange>) {
  const result: Array<{ label: string; value: string }> = [];
  if (range.dateFrom || range.dateTo) result.push({ label: "Date range", value: `${range.dateFrom ?? "Start"} to ${range.dateTo ?? "Today"}` });
  if (query.locationId) result.push({ label: "Location", value: query.type === "inventory-summary" && query.locationId === "all" ? "All authorized branches" : optionLabel(filters.locations, query.locationId) });
  if (query.salespersonId) result.push({ label: "Salesperson", value: optionLabel(filters.salespersons, query.salespersonId) });
  if (query.source) result.push({ label: "Source", value: humanize(query.source) });
  if (query.paymentMethod) result.push({ label: "Payment method", value: humanize(query.paymentMethod) });
  if (query.search) result.push({ label: "Product search", value: query.search });
  if (query.category) result.push({ label: "Category", value: query.category });
  if (query.brand) result.push({ label: "Brand", value: query.brand });
  if (query.productStatus) result.push({ label: "Product status", value: humanize(query.productStatus) });
  else if (query.type === "inventory-summary") result.push({ label: "Product status", value: "All statuses" });
  if (query.type === "inventory-summary") result.push({ label: "Availability", value: "Positive available stock only" });
  if (query.caseType) result.push({ label: "Case type", value: humanize(query.caseType) });
  if (query.status) result.push({ label: "Status", value: humanize(query.status) });
  if (query.resolution) result.push({ label: "Resolution", value: humanize(query.resolution) });
  if (query.entitySearch) result.push({ label: "Entity search", value: query.entitySearch });
  return result;
}

type InventoryProduct = {
  id: string;
  itemCode: string;
  name: string;
  category: string | null;
  brand: string | null;
  status: string;
  reorderLevel: number;
};

type InventoryBalanceRow = {
  id: string;
  productId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  quarantined: number;
};

export function buildInventoryRows(products: InventoryProduct[], locations: ReportLocation[], balances: InventoryBalanceRow[]): InventoryReportRow[] {
  const byProductLocation = new Map(balances.map((balance) => [`${balance.productId}:${balance.locationId}`, balance]));
  return products.map((product) => {
    const availableByLocation = Object.fromEntries(locations.map((location): [string, number] => {
      const balance = byProductLocation.get(`${product.id}:${location.id}`);
      // Nonpositive balances contribute no available stock to the comparison.
      return [location.id, balance ? Math.max(availableStock(balance), 0) : 0];
    }));
    return {
      id: product.id,
      productId: product.id,
      itemCode: product.itemCode,
      product: product.name,
      category: product.category ?? "Uncategorized",
      brand: product.brand ?? "Unbranded",
      productStatus: product.status,
      available: Object.values(availableByLocation).reduce((sum, quantity) => sum + quantity, 0),
      availableByLocation,
    };
  }).filter((row) => row.available > 0);
}

export function unassignedWarrantyQuarantine(receivedQuantity: number, returnedQuantity: number, assignedClaimQuantity: number, releasedRepair: boolean) {
  return releasedRepair ? 0 : Math.max(receivedQuantity - returnedQuantity - assignedClaimQuantity, 0);
}

export function backjobReportDetails(row: {
  items: Array<Pick<BackjobItemDto, "productItemCode" | "productName">>;
  affectedProductItemCode: string | null;
  affectedProductName: string | null;
  legacyProductDescription: string | null;
}) {
  const items = row.items.length ? row.items : [{
    productItemCode: row.affectedProductItemCode,
    productName: row.affectedProductName ?? row.legacyProductDescription ?? "Not recorded",
  }];
  return {
    product: items.map((item) => `${item.productItemCode ? `${item.productItemCode} - ` : ""}${item.productName}`).join("; "),
    // Original item selections are not affected-unit quantities.
    quantity: null,
  };
}

function countBy(values: string[]): ReportBreakdown[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));
}

function references(...values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].join(" / ");
}

async function reportContext(actor: AuthContext, rawQuery: unknown) {
  assertCapability(actor, "reports:view");
  let query = reportQuerySchema.parse(rawQuery);
  const locations = await prisma.location.findMany({ where: { id: locationFilter(actor), isActive: true, ...(query.type === "inventory-summary" ? { type: "BRANCH" as const } : {}) }, select: { id: true, code: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const allBranches = query.type === "inventory-summary" && query.locationId === "all";
  if (query.locationId && !allBranches && !locations.some((location) => location.id === query.locationId)) {
    throw new AuthorizationError("Report location is not an active authorized location");
  }
  // Resolve defaults before both options and rows; an omitted branch is never All.
  if (query.type === "inventory-summary" && !query.locationId) query = { ...query, locationId: locations[0]?.id };
  const effectiveLocations = allBranches || !query.locationId ? locations : locations.filter((location) => location.id === query.locationId);
  const filters = await options(query, locations, effectiveLocations);
  return { query, effectiveLocations, filters };
}

export async function getReportOptions(actor: AuthContext, rawQuery: unknown) {
  return (await reportContext(actor, rawQuery)).filters;
}

export async function getReport(actor: AuthContext, rawQuery: unknown): Promise<ReportResult> {
  const { query, effectiveLocations, filters } = await reportContext(actor, rawQuery);
  if (query.salespersonId && !filters.salespersons.some((row) => row.id === query.salespersonId)) {
    throw new AuthorizationError("Salesperson is inactive or outside the selected report scope");
  }
  const effectiveScope = effectiveLocations.map((location) => ({ id: location.id, label: `${location.code} - ${location.name}` }));
  const scopedLocation = { in: effectiveLocations.map((location) => location.id) };
  const undatedRange = dateRange(query, false);
  const base = { type: query.type, generatedAt: new Date().toISOString(), filters, effectiveScope };

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
      select: {
        id: true, manualReceiptNumber: true, receiptBooklet: true, orderId: true, paymentMethod: true,
        totalAmount: true, discountAmount: true, salespersonName: true, lines: { select: { quantity: true } },
        customer: { select: { name: true } }, location: { select: { code: true, name: true } }, postedBy: { select: { name: true } },
        accountingReview: { select: { verifiedAt: true } },
      },
      orderBy: [{ accountingReview: { verifiedAt: "desc" } }, { id: "desc" }],
    });
    const rows = records.map((row) => ({
      id: row.id,
      verifiedAt: row.accountingReview!.verifiedAt!.toISOString(),
      manualReceiptNumber: row.receiptBooklet ? `${row.receiptBooklet}-${row.manualReceiptNumber}` : row.manualReceiptNumber,
      branch: `${row.location.code} - ${row.location.name}`,
      customer: row.customer?.name ?? "Guest",
      salesperson: row.salespersonName ?? "Unassigned",
      encoder: row.postedBy.name,
      source: row.orderId ? "Customer Order" as const : "Direct Sale" as const,
      paymentMethod: row.paymentMethod,
      units: row.lines.reduce((sum, line) => sum + line.quantity, 0),
      discountAmount: row.discountAmount.toNumber(),
      totalAmount: row.totalAmount.toNumber(),
      verificationStatus: "VERIFIED" as const,
    }));
    const grandAmount = rows.reduce((sum, row) => sum + row.totalAmount, 0);
    const totals = new Map<string, { branch: string; transactionCount: number; units: number; totalAmount: number; percentage: number }>();
    for (const row of rows) {
      const total = totals.get(row.branch) ?? { branch: row.branch, transactionCount: 0, units: 0, totalAmount: 0, percentage: 0 };
      total.transactionCount += 1;
      total.units += row.units;
      total.totalAmount += row.totalAmount;
      totals.set(row.branch, total);
    }
    for (const total of totals.values()) total.percentage = grandAmount ? (total.totalAmount / grandAmount) * 100 : 0;
    return {
      ...base, type: "sales", dateFrom: range.dateFrom, dateTo: range.dateTo,
      appliedFilters: selectedFilters(query, filters, range), rows,
      branchTotals: [...totals.values()].sort((a, b) => a.branch.localeCompare(b.branch)),
      grandTotal: {
        transactionCount: rows.length,
        units: rows.reduce((sum, row) => sum + row.units, 0),
        totalDiscount: rows.reduce((sum, row) => sum + row.discountAmount, 0),
        averageSale: rows.length ? grandAmount / rows.length : 0,
        totalAmount: grandAmount,
      },
    };
  }

  if (query.type === "inventory-summary") {
    const productWhere: Prisma.ProductWhereInput = {
      ...(query.search ? { OR: [{ itemCode: { contains: query.search, mode: "insensitive" } }, { name: { contains: query.search, mode: "insensitive" } }] } : {}),
      category: query.category,
      brand: query.brand,
      status: query.productStatus,
    };
    const products = effectiveLocations.length ? await prisma.product.findMany({
      where: productWhere,
      select: { id: true, itemCode: true, name: true, category: true, brand: true, status: true, reorderLevel: true },
      orderBy: { itemCode: "asc" },
    }) : [];
    const balances = products.length ? await prisma.inventoryBalance.findMany({
      where: { locationId: scopedLocation, productId: { in: products.map((product) => product.id) } },
      select: { id: true, productId: true, locationId: true, onHand: true, reserved: true, quarantined: true },
    }) : [];
    const rows = buildInventoryRows(products, effectiveLocations, balances);
    return {
      ...base, type: "inventory-summary", dateFrom: null, dateTo: null, appliedFilters: selectedFilters(query, filters, undatedRange), rows,
      branchTotals: effectiveLocations.map((location) => ({ locationId: location.id, available: rows.reduce((sum, row) => sum + row.availableByLocation[location.id], 0) })),
      totals: {
        productCount: rows.length,
        locationCount: effectiveLocations.length,
        available: rows.reduce((sum, row) => sum + row.available, 0),
      },
    };
  }

  const range = dateRange(query, true);
  const scope = { locationId: scopedLocation, createdAt: range.where };
  const [backjobs, warranties, claims] = await Promise.all([
    query.caseType && query.caseType !== "BACKJOB" ? Promise.resolve([]) : prisma.backjob.findMany({
      where: scope,
      select: {
        id: true, createdAt: true, reference: true, locationCode: true, locationName: true, customerName: true, affectedProductItemCode: true,
        affectedProductName: true, legacyProductDescription: true, status: true, coverage: true, originalSaleReference: true, originalReceiptNumber: true,
        items: { select: { productItemCode: true, productName: true }, orderBy: { position: "asc" } },
        installerName: true, scheduledFor: true, chargeableAmount: true, originalSale: { select: { salespersonName: true } },
      },
    }),
    query.caseType && query.caseType !== "CUSTOMER_WARRANTY" ? Promise.resolve([]) : prisma.customerWarranty.findMany({
      where: scope,
      select: {
        id: true, createdAt: true, reference: true, locationCode: true, locationName: true, customerName: true, productName: true, productItemCode: true,
        claimQuantity: true, receivedQuantity: true, returnedQuantity: true, status: true, resolution: true, saleReference: true, receiptNumber: true,
        targetDate: true, replacementItemCode: true, replacementProductName: true, sale: { select: { salespersonName: true } },
        supplierClaims: { select: { reference: true, lines: { select: { quarantinedQuantity: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    query.caseType && query.caseType !== "SUPPLIER_CLAIM" ? Promise.resolve([]) : prisma.supplierClaim.findMany({
      where: scope,
      select: {
        id: true, createdAt: true, reference: true, locationCode: true, locationName: true, supplierName: true, status: true, targetDate: true,
        sourceReceipt: { select: { reference: true } }, customerWarranty: { select: { reference: true, saleReference: true, receiptNumber: true, sale: { select: { salespersonName: true } } } },
        lines: { select: { productName: true, productItemCode: true, claimedQuantity: true, openQuarantinedQuantity: true } },
        settlements: { select: { type: true, amount: true } },
      },
    }),
  ]);
  const now = new Date();
  const candidates = [
    ...backjobs.map((row) => ({
      id: row.id, recordType: "Backjob" as const, caseDate: row.createdAt.toISOString(), reference: row.reference,
      originalReference: references(row.originalSaleReference, row.originalReceiptNumber), branch: `${row.locationCode} - ${row.locationName}`, party: row.customerName,
      ...backjobReportDetails(row), assignedPersonnel: row.installerName ?? "Unassigned",
      salesperson: row.originalSale?.salespersonName ?? "Unassigned", status: row.status,
      resolution: row.coverage === "PENDING" ? "Unresolved" : row.coverage, targetDate: row.scheduledFor?.toISOString() ?? null,
      overdue: Boolean(row.scheduledFor && row.scheduledFor < now && !CLOSED_BACKJOB.has(row.status)), linkedCase: "",
      unresolvedQuarantinedQuantity: 0, backjobChargeAmount: row.coverage === "CHARGEABLE" ? row.chargeableAmount.toNumber() : null, supplierRefundAmount: 0, supplierCreditAmount: 0,
    })),
    ...warranties.map((row) => {
      const assignedClaimQuantity = row.supplierClaims.reduce((claimSum, claim) => claimSum + claim.lines.reduce((lineSum, line) => lineSum + line.quarantinedQuantity, 0), 0);
      const releasedRepair = row.resolution === "REPAIR" && ["RELEASED", "COMPLETED"].includes(row.status);
      return {
        id: row.id, recordType: "Customer Warranty" as const, caseDate: row.createdAt.toISOString(), reference: row.reference,
        originalReference: references(row.saleReference, row.receiptNumber), branch: `${row.locationCode} - ${row.locationName}`, party: row.customerName,
        product: `${row.productItemCode} - ${row.productName}${row.replacementProductName ? ` -> ${row.replacementItemCode ?? ""} ${row.replacementProductName}` : ""}`,
        quantity: row.claimQuantity, assignedPersonnel: "Not recorded", salesperson: row.sale?.salespersonName ?? "Unassigned",
        status: row.status, resolution: row.resolution ?? "Unresolved", targetDate: row.targetDate?.toISOString() ?? null,
        overdue: Boolean(row.targetDate && row.targetDate < now && !CLOSED_WARRANTY.has(row.status)),
        linkedCase: row.supplierClaims.map((claim) => claim.reference).join(", "),
        unresolvedQuarantinedQuantity: unassignedWarrantyQuarantine(row.receivedQuantity, row.returnedQuantity, assignedClaimQuantity, releasedRepair),
        backjobChargeAmount: null, supplierRefundAmount: 0, supplierCreditAmount: 0,
      };
    }),
    ...claims.map((row) => {
      const resolutions = [...new Set(row.settlements.map((settlement) => settlement.type))];
      return {
        id: row.id, recordType: "Supplier Claim" as const, caseDate: row.createdAt.toISOString(), reference: row.reference,
        originalReference: references(row.sourceReceipt?.reference ?? row.customerWarranty?.saleReference ?? null, row.customerWarranty?.receiptNumber ?? null), branch: `${row.locationCode} - ${row.locationName}`, party: row.supplierName,
        product: row.lines.map((line) => `${line.productItemCode} - ${line.productName}`).join(", "),
        quantity: row.lines.reduce((sum, line) => sum + line.claimedQuantity, 0), assignedPersonnel: "Not recorded",
        salesperson: row.customerWarranty?.sale?.salespersonName ?? "Not applicable", status: row.status,
        resolution: resolutions.length ? resolutions.join(", ") : "Unresolved", targetDate: row.targetDate?.toISOString() ?? null,
        overdue: Boolean(row.targetDate && row.targetDate < now && !CLOSED_CLAIM.has(row.status)), linkedCase: row.customerWarranty?.reference ?? "",
        unresolvedQuarantinedQuantity: row.lines.reduce((sum, line) => sum + line.openQuarantinedQuantity, 0),
        backjobChargeAmount: null,
        supplierRefundAmount: row.settlements.filter((settlement) => settlement.type === "REFUND").reduce((sum, settlement) => sum + settlement.amount.toNumber(), 0),
        supplierCreditAmount: row.settlements.filter((settlement) => settlement.type === "CREDIT").reduce((sum, settlement) => sum + settlement.amount.toNumber(), 0),
      };
    }),
  ];
  const needle = query.entitySearch?.toLocaleLowerCase();
  const rows = candidates.filter((row) => {
    if (query.status && row.status !== query.status) return false;
    if (query.resolution && !row.resolution.split(", ").includes(query.resolution)) return false;
    if (needle && ![row.party, row.product, row.salesperson, row.assignedPersonnel].some((value) => value.toLocaleLowerCase().includes(needle))) return false;
    return true;
  }).sort((a, b) => b.caseDate.localeCompare(a.caseDate));
  const open = rows.filter((row) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(row.status)).length;
  return {
    ...base, type: "returns-warranty", dateFrom: range.dateFrom, dateTo: range.dateTo,
    appliedFilters: selectedFilters(query, filters, range), rows,
    totals: {
      total: rows.length, open, completed: rows.filter((row) => row.status === "COMPLETED").length,
      overdue: rows.filter((row) => row.overdue).length,
      unresolvedQuarantinedQuantity: rows.reduce((sum, row) => sum + row.unresolvedQuarantinedQuantity, 0),
      backjobChargeAmount: rows.reduce((sum, row) => sum + (row.backjobChargeAmount ?? 0), 0),
      supplierRefundAmount: rows.reduce((sum, row) => sum + row.supplierRefundAmount, 0),
      supplierCreditAmount: rows.reduce((sum, row) => sum + row.supplierCreditAmount, 0),
      byType: countBy(rows.map((row) => row.recordType)), byStatus: countBy(rows.map((row) => row.status)),
      byBranch: countBy(rows.map((row) => row.branch)), byResolution: countBy(rows.flatMap((row) => row.resolution.split(", "))),
    },
  };
}

export function queryFromSearchParams(searchParams: URLSearchParams): ReportQuery {
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    if (values.length > 1) raw[key] = values;
    else if (values[0] !== undefined) raw[key] = values[0];
  }
  return reportQuerySchema.parse(raw);
}
