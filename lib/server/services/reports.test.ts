import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const reportPrisma = vi.hoisted(() => ({
  location: { findMany: vi.fn() },
  backjob: { findMany: vi.fn() },
  sale: { findMany: vi.fn() },
  payment: { findMany: vi.fn(), aggregate: vi.fn() },
  product: { findMany: vi.fn() },
  inventoryBalance: { findMany: vi.fn() },
  saleLine: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", () => ({ prisma: reportPrisma }));

let reports: typeof import("./reports");

beforeAll(async () => {
  reports = await import("./reports");
});

describe("report filters", () => {
  it("accepts only sales filters for salesperson sales with the same date defaults", () => {
    expect(reports.queryFromSearchParams(new URLSearchParams("type=salesperson-sales&dateFrom=2024-02-10&locationId=branch&salespersonId=person&source=CUSTOMER_ORDER&paymentMethod=SPLIT"))).toEqual({
      type: "salesperson-sales", dateFrom: "2024-02-10", dateTo: "2024-02-29", locationId: "branch", salespersonId: "person", source: "CUSTOMER_ORDER", paymentMethod: "SPLIT",
    });
    expect(reports.reportQuerySchema.parse({ type: "salesperson-sales" })).toEqual({ type: "salesperson-sales", ...reports.defaultReportDates() });
    for (const filter of ["search=x", "category=x", "brand=x", "productStatus=ACTIVE", "caseType=BACKJOB", "status=COMPLETED", "resolution=REPAIR", "entitySearch=x", "unknown=x", "salespersonId=one&salespersonId=two", "dateFrom=2026-02-30", "dateFrom=2026-09-08&dateTo=2026-09-07"]) {
      expect(() => reports.queryFromSearchParams(new URLSearchParams(`type=salesperson-sales&${filter}`))).toThrow();
    }
  });

  it("uses a complete Asia/Manila calendar month sales period", () => {
    expect(reports.defaultReportDates(new Date("2026-09-07T18:00:00Z"))).toEqual({
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
  });

  it("parses focused filters and rejects reversed or impossible dates", () => {
    const parsed = reports.queryFromSearchParams(new URLSearchParams("type=sales&source=DIRECT_SALE&paymentMethod=GCASH"));
    expect(parsed).toMatchObject({
      type: "sales",
      source: "DIRECT_SALE",
      paymentMethod: "GCASH",
    });
    expect(parsed.dateFrom).toMatch(/^\d{4}-\d{2}-01$/);
    expect(parsed.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=sales&dateFrom=2026-09-08&dateTo=2026-09-07"))).toThrow();
    expect(reports.queryFromSearchParams(new URLSearchParams("type=sales&dateFrom=2024-02-10"))).toMatchObject({ dateFrom: "2024-02-10", dateTo: "2024-02-29" });
    expect(reports.queryFromSearchParams(new URLSearchParams("type=sales&dateFrom=2024-02-10&dateTo=2024-03-15"))).toMatchObject({ dateFrom: "2024-02-10", dateTo: "2024-03-15" });
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=sales&dateTo=2000-01-01"))).toThrow();
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=sales&dateFrom=2026-02-30"))).toThrow();
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=inventory-summary&salespersonId=person-1"))).toThrow();
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=low-stock"))).toThrow();
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=inventory-movements"))).toThrow();
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=sales&type=low-stock"))).toThrow();
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=sales&locationId=one&locationId=two"))).toThrow();
    expect(reports.queryFromSearchParams(new URLSearchParams("type=inventory-summary")).locationId).toBeUndefined();
    expect(reports.queryFromSearchParams(new URLSearchParams("type=inventory-summary&locationId=all")).locationId).toBe("all");
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=inventory-summary&locationId="))).toThrow();
    expect(() => reports.queryFromSearchParams(new URLSearchParams("type=inventory-summary&stockStatus=OUT_OF_STOCK"))).toThrow();
  });
});

describe("report quantity projections", () => {
  it("omits products without positive stock in effective locations", () => {
    const rows = reports.buildInventoryRows(
      [{ id: "product-1", itemCode: "P-1", name: "Product", category: null, brand: null, status: "ACTIVE", reorderLevel: 3 }],
      [{ id: "allowed", code: "A", name: "Allowed" }],
      [{ id: "hidden-balance", productId: "product-1", locationId: "hidden", onHand: 9, reserved: 0, quarantined: 0 }],
    );

    expect(rows).toEqual([]);
  });

  it("groups positive stock once per product with scoped branch contributions", () => {
    const product = { id: "product-1", itemCode: "P-1", name: "Product", category: null, brand: null, status: "ACTIVE", reorderLevel: 3 };
    const locations = ["first", "second", "negative", "missing"].map((id) => ({ id, code: id, name: id }));
    const balances = [
      { id: "balance-1", productId: product.id, locationId: "first", onHand: 10, reserved: 2, quarantined: 3 },
      { id: "balance-2", productId: product.id, locationId: "second", onHand: 4, reserved: 1, quarantined: 0 },
      { id: "balance-3", productId: product.id, locationId: "negative", onHand: 1, reserved: 2, quarantined: 0 },
      { id: "hidden-balance", productId: product.id, locationId: "hidden", onHand: 100, reserved: 0, quarantined: 0 },
      { id: "zero-balance", productId: "product-2", locationId: "first", onHand: 4, reserved: 1, quarantined: 3 },
    ];
    expect(reports.buildInventoryRows([product, { ...product, id: "product-2", itemCode: "P-2" }], locations, balances)).toEqual([{
      id: product.id, productId: product.id, itemCode: "P-1", product: "Product", category: "Uncategorized", brand: "Unbranded", productStatus: "ACTIVE",
      available: 8, availableByLocation: { first: 5, second: 3, negative: 0, missing: 0 },
    }]);
    expect(reports.buildInventoryRows([product], [locations[0]], balances)).toEqual([expect.objectContaining({ available: 5, availableByLocation: { first: 5 } })]);
    expect(reports.buildInventoryRows([product], [locations[2]], balances)).toEqual([]);
    expect(reports.buildInventoryRows([product], [], balances)).toEqual([]);
  });

  it("attributes only unassigned unresolved warranty quarantine", () => {
    expect(reports.unassignedWarrantyQuarantine(5, 1, 2, false)).toBe(2);
    expect(reports.unassignedWarrantyQuarantine(2, 1, 5, false)).toBe(0);
    expect(reports.unassignedWarrantyQuarantine(5, 1, 0, true)).toBe(0);
  });

  it("projects all ordered Backjob snapshots without inventing affected-unit quantities", () => {
    const detail = reports.backjobReportDetails({
      items: [{ productItemCode: "P-2", productName: "Second product" }, { productItemCode: "P-1", productName: "First product" }, { productItemCode: null, productName: "Legacy item" }],
      affectedProductItemCode: "STALE", affectedProductName: "Scalar snapshot", legacyProductDescription: null,
    });
    expect(detail).toEqual({ product: "P-2 - Second product; P-1 - First product; Legacy item", quantity: null });
  });

  it("falls back to a singular persisted Backjob snapshot or legacy description only without items", () => {
    const legacy = { items: [], affectedProductItemCode: "P-1", affectedProductName: "Original product", legacyProductDescription: "Legacy description" };
    expect(reports.backjobReportDetails(legacy)).toEqual({ product: "P-1 - Original product", quantity: null });
    expect(reports.backjobReportDetails({ ...legacy, affectedProductItemCode: null, affectedProductName: null })).toEqual({ product: "Legacy description", quantity: null });
    expect(reports.backjobReportDetails({ ...legacy, affectedProductItemCode: null, affectedProductName: null, legacyProductDescription: null })).toEqual({ product: "Not recorded", quantity: null });
  });
});

describe("sales and salesperson sales reports", () => {
  const actor = { userId: "actor", roleDefinitionId: "role", isOwner: false, capabilities: ["reports:sales", "reports:salesperson-sales", "reports:inventory-summary", "reports:stock-movement", "reports:returns-warranty"], locationIds: ["branch"] };
  const query = { dateFrom: "2026-09-01", dateTo: "2026-09-30", locationId: "branch" };
  const attribution = [
    { salespersonId: "person-1", salespersonName: "Later historical name" },
    { salespersonId: "person-2", salespersonName: "Same name" },
  ];

  beforeEach(() => {
    reportPrisma.location.findMany.mockReset().mockResolvedValue([{ id: "branch", code: "B", name: "Branch" }]);
    reportPrisma.payment.findMany.mockReset();
    // Nothing is waiting on Accounting unless a test says so.
    reportPrisma.payment.aggregate.mockReset().mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: null } });
  });

  // One verified receipt in the payment ledger: a direct sale carries the goods,
  // so its units and discount come from the sale it settled.
  function sale(id: string, salespersonId: string | null, salespersonName: string | null, amount: number, units = 1) {
    return {
      id, salespersonId, salespersonName, kind: "DIRECT_SALE", receiptNumber: id, receiptBooklet: null, method: "CASH",
      amount: { toNumber: () => amount }, verifiedAt: new Date("2026-09-10T00:00:00Z"), collectedAt: new Date("2026-09-08T00:00:00Z"), reviewStatus: "VERIFIED",
      customer: null, location: { code: "B", name: "Branch" }, collectedBy: { name: "Encoder" },
      sale: { discountAmount: { toNumber: () => amount / 10 }, lines: [{ quantity: units }] },
    };
  }

  it.each(["sales", "salesperson-sales"] as const)("shares verified sales rows and totals for %s, grouping identities rather than snapshot names", async (type) => {
    reportPrisma.payment.findMany.mockResolvedValueOnce(attribution).mockResolvedValueOnce([
      sale("5", "person-1", "Same name", 120, 2),
      sale("4", "person-2", "Same name", 60),
      sale("3", "person-1", "Old name", 60),
      sale("2", null, null, 30),
      sale("1", null, "Legacy snapshot", 30),
    ]);
    const report = await reports.getReport(actor, { type, ...query });
    expect(report.type).toBe(type);
    if (report.type !== "sales" && report.type !== "salesperson-sales") throw new Error("Expected sales report");
    expect(report.rows.map((row) => [row.salespersonId, row.salesperson])).toEqual([
      ["person-1", "Same name"], ["person-2", "Same name"], ["person-1", "Old name"], [null, "Unassigned"], [null, "Legacy snapshot"],
    ]);
    expect(report.grandTotal).toEqual({ transactionCount: 5, units: 6, totalDiscount: 30, averageSale: 60, totalAmount: 300 });
    expect(report.branchTotals).toEqual([{ branch: "B - Branch", transactionCount: 5, units: 6, totalAmount: 300, percentage: 100 }]);
    if (report.type === "salesperson-sales") {
      expect(report.salespersonTotals).toEqual([
        { salespersonId: null, salesperson: "Not recorded (legacy)", transactionCount: 2, units: 2, totalDiscount: 6, averageSale: 30, totalAmount: 60, percentage: 20 },
        { salespersonId: "person-1", salesperson: "Same name", transactionCount: 2, units: 3, totalDiscount: 18, averageSale: 90, totalAmount: 180, percentage: 60 },
        { salespersonId: "person-2", salesperson: "Same name", transactionCount: 1, units: 1, totalDiscount: 6, averageSale: 60, totalAmount: 60, percentage: 20 },
      ]);
    } else {
      expect(report).not.toHaveProperty("salespersonTotals");
    }
    expect(reportPrisma.payment.findMany).toHaveBeenCalledTimes(2);
    expect(reportPrisma.payment.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        locationId: { in: ["branch"] }, status: "ACTIVE", salespersonId: undefined, kind: undefined, method: undefined,
        reviewStatus: undefined, collectedAt: { gte: new Date("2026-08-31T16:00:00Z"), lt: new Date("2026-09-30T16:00:00Z") },
      },
      select: expect.objectContaining({ salespersonId: true, salespersonName: true }),
      orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
    }));
  });

  it.each(["sales", "salesperson-sales"] as const)("offers scoped historical identities for %s regardless of current personnel status/home branch or other filters", async (type) => {
    reportPrisma.payment.findMany.mockResolvedValueOnce(attribution).mockResolvedValueOnce([]);
    const report = await reports.getReport(actor, { type, ...query, salespersonId: "person-1", source: "CUSTOMER_ORDER", paymentMethod: "GCASH" });
    expect(report.filters.salespersons).toEqual([
      { id: "person-1", label: "Later historical name" }, { id: "person-2", label: "Same name" },
    ]);
    expect(report.appliedFilters).toContainEqual({ label: "Salesperson", value: "Later historical name" });
    expect(reportPrisma.payment.findMany).toHaveBeenNthCalledWith(1, {
      where: { locationId: { in: ["branch"] }, status: "ACTIVE", salespersonId: { not: null }, reviewStatus: "VERIFIED", verifiedAt: { not: null } },
      select: { salespersonId: true, salespersonName: true }, distinct: ["salespersonId"],
      orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
    });
    expect(reportPrisma.location.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["branch"] }, isActive: true } }));
    expect(reportPrisma.payment.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ locationId: { in: ["branch"] }, salespersonId: "person-1", kind: { in: ["ORDER_DOWNPAYMENT", "ORDER_PAYMENT", "ORDER_FINAL"] }, method: "GCASH" }),
    }));
    if (report.type !== "sales" && report.type !== "salesperson-sales") throw new Error("Expected sales report");
    expect(report.rows).toEqual([]);
    expect(report.branchTotals).toEqual([]);
    expect(report.grandTotal).toEqual({ transactionCount: 0, units: 0, totalDiscount: 0, averageSale: 0, totalAmount: 0 });
    if (report.type === "salesperson-sales") expect(report.salespersonTotals).toEqual([]);
  });

  it.each(["sales", "salesperson-sales"] as const)("rejects unauthorized locations and arbitrary salesperson IDs for %s before querying sale details", async (type) => {
    await expect(reports.getReport(actor, { type, ...query, locationId: "hidden" })).rejects.toThrow("Report location is not an active authorized location");
    expect(reportPrisma.payment.findMany).not.toHaveBeenCalled();
    reportPrisma.payment.findMany.mockResolvedValueOnce(attribution);
    await expect(reports.getReport(actor, { type, ...query, salespersonId: "hidden-person" })).rejects.toThrow("Salesperson has no verified sales in the selected report scope");
    expect(reportPrisma.payment.findMany).toHaveBeenCalledTimes(1);
  });

  it("counts each verified receipt once, so an order total is never double counted", async () => {
    function receipt(id: string, kind: string, amount: number, units = 0) {
      return {
        id, salespersonId: "person-1", salespersonName: "Same name", kind, receiptNumber: id, receiptBooklet: null, method: "CASH",
        amount: { toNumber: () => amount }, verifiedAt: new Date("2026-09-10T00:00:00Z"), collectedAt: new Date("2026-09-08T00:00:00Z"), reviewStatus: "VERIFIED",
        customer: { name: "Buyer" }, location: { code: "B", name: "Branch" }, collectedBy: { name: "Cashier" },
        sale: units ? { discountAmount: { toNumber: () => 0 }, lines: [{ quantity: units }] } : null,
      };
    }
    // A 50,000 order paid 10,000 down, 5,000 later, 35,000 at release, plus a
    // 10,000 downpayment forfeited on an order that was cancelled and so never
    // produced a release receipt at all.
    reportPrisma.payment.findMany.mockResolvedValueOnce(attribution).mockResolvedValueOnce([
      receipt("OR-2210", "ORDER_DOWNPAYMENT", 10_000),
      receipt("OR-2288", "ORDER_PAYMENT", 5_000),
      receipt("OR-2350", "ORDER_FINAL", 35_000, 3),
      receipt("OR-2240", "ORDER_DOWNPAYMENT", 10_000),
    ]);
    const report = await reports.getReport(actor, { type: "sales", ...query });
    if (report.type !== "sales") throw new Error("Expected sales report");
    expect(report.rows.map((row) => [row.source, row.totalAmount])).toEqual([
      ["Order Downpayment", 10_000], ["Order Payment", 5_000], ["Order Release", 35_000], ["Order Downpayment", 10_000],
    ]);
    // 50,000 for the released order and 10,000 kept from the cancelled one.
    expect(report.grandTotal.totalAmount).toBe(60_000);
    // Goods change hands once, on the receipt that completed the sale.
    expect(report.grandTotal.units).toBe(3);
  });

  it("dates by the sale day by default and by verification only when that view is chosen", async () => {
    // The first query of each report builds the salesperson filter; the second
    // fetches the receipts themselves, and this test only cares about the where.
    reportPrisma.payment.findMany.mockImplementation((args) => Promise.resolve(args.distinct ? attribution : []));
    reportPrisma.payment.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { amount: { toNumber: () => 45_000 } } });

    const onSaleDate = await reports.getReport(actor, { type: "sales", ...query });
    expect(reportPrisma.payment.findMany.mock.calls[1][0].where).toMatchObject({
      collectedAt: { gte: new Date("2026-08-31T16:00:00Z"), lt: new Date("2026-09-30T16:00:00Z") },
    });
    expect(reportPrisma.payment.findMany.mock.calls[1][0].where.verifiedAt).toBeUndefined();
    // The default view holds back nothing, so it has no review-status filter.
    expect(reportPrisma.payment.findMany.mock.calls[1][0].where.reviewStatus).toBeUndefined();
    if (onSaleDate.type !== "sales") throw new Error("Expected sales report");
    expect(onSaleDate.view).toBe("SALE_DATE");
    expect(onSaleDate.appliedFilters).toContainEqual({ label: "View", value: "Sale date (all receipts)" });

    const onVerifiedDate = await reports.getReport(actor, { type: "sales", ...query, view: "VERIFIED_DATE" });
    expect(reportPrisma.payment.findMany.mock.calls[3][0].where).toMatchObject({
      verifiedAt: { gte: new Date("2026-08-31T16:00:00Z"), lt: new Date("2026-09-30T16:00:00Z") },
      reviewStatus: { equals: "VERIFIED" },
    });
    expect(reportPrisma.payment.findMany.mock.calls[3][0].where.collectedAt).toBeUndefined();
    if (onVerifiedDate.type !== "sales") throw new Error("Expected sales report");
    expect(onVerifiedDate.appliedFilters).toContainEqual({ label: "View", value: "Verification date (verified only)" });
    // Only the verified view hides anything, so only it reports a gap.
    expect(onVerifiedDate.pending).toEqual({ count: 2, amount: 45_000 });
  });

  it("shows verified and unverified side by side, keeping the two totals apart", async () => {
    function receipt(id: string, amount: number, reviewStatus: string) {
      return {
        id, salespersonId: "person-1", salespersonName: "Same name", kind: "DIRECT_SALE", receiptNumber: id, receiptBooklet: null, method: "CASH",
        amount: { toNumber: () => amount }, collectedAt: new Date("2026-09-08T00:00:00Z"), reviewStatus,
        verifiedAt: reviewStatus === "VERIFIED" ? new Date("2026-09-10T00:00:00Z") : null,
        customer: null, location: { code: "B", name: "Branch" }, collectedBy: { name: "Cashier" },
        sale: { discountAmount: { toNumber: () => 0 }, lines: [{ quantity: 1 }] },
      };
    }
    reportPrisma.payment.findMany.mockResolvedValueOnce(attribution).mockResolvedValueOnce([
      receipt("OR-1", 10_000, "VERIFIED"),
      receipt("OR-2", 4_000, "UNVERIFIED"),
      receipt("OR-3", 1_000, "MISMATCH_REPORTED"),
    ]);
    const report = await reports.getReport(actor, { type: "sales", ...query });
    if (report.type !== "sales") throw new Error("Expected sales report");

    expect(reportPrisma.payment.findMany.mock.calls[1][0].where.reviewStatus).toBeUndefined();
    // A confirmed figure and an unconfirmed one are never merged into one number.
    expect(report.verifiedTotal).toEqual({ transactionCount: 1, totalAmount: 10_000 });
    expect(report.unverifiedTotal).toEqual({ transactionCount: 2, totalAmount: 5_000 });
    expect(report.grandTotal.totalAmount).toBe(15_000);
    // An unverified receipt has no verification date to print.
    expect(report.rows.map((row) => [row.verificationStatus, row.verifiedAt])).toEqual([
      ["VERIFIED", "2026-09-10T00:00:00.000Z"], ["UNVERIFIED", null], ["MISMATCH_REPORTED", null],
    ]);
    expect(report.appliedFilters).toContainEqual({ label: "View", value: "Sale date (all receipts)" });
  });

  it("dates the not-verified view by the sale day, because those receipts have no verification date", async () => {
    reportPrisma.payment.findMany.mockImplementation((args) => Promise.resolve(args.distinct ? attribution : []));
    const report = await reports.getReport(actor, { type: "sales", ...query, view: "UNVERIFIED" });
    if (report.type !== "sales") throw new Error("Expected sales report");

    expect(reportPrisma.payment.findMany.mock.calls[1][0].where.reviewStatus).toEqual({ not: "VERIFIED" });
    expect(reportPrisma.payment.findMany.mock.calls[1][0].where.collectedAt).toBeDefined();
    expect(reportPrisma.payment.findMany.mock.calls[1][0].where.verifiedAt).toBeUndefined();
    expect(report.appliedFilters).toContainEqual({ label: "View", value: "Not verified only" });
  });

  it("keeps salesperson percentages finite when all sale amounts are zero", async () => {
    reportPrisma.payment.findMany.mockResolvedValueOnce(attribution).mockResolvedValueOnce([sale("zero", "person-1", "Same name", 0)]);
    const report = await reports.getReport(actor, { type: "salesperson-sales", ...query });
    if (report.type !== "salesperson-sales") throw new Error("Expected salesperson sales report");
    expect(report.salespersonTotals).toEqual([{ salespersonId: "person-1", salesperson: "Same name", transactionCount: 1, units: 1, totalDiscount: 0, averageSale: 0, totalAmount: 0, percentage: 0 }]);
  });
});

describe("stock movement report", () => {
  const actor = { userId: "actor", roleDefinitionId: "role", isOwner: false, capabilities: ["reports:sales", "reports:salesperson-sales", "reports:inventory-summary", "reports:stock-movement", "reports:returns-warranty"], locationIds: ["branch"] };
  const query = { type: "stock-movement" as const, dateFrom: "2026-09-01", dateTo: "2026-09-30", locationId: "branch" };

  beforeEach(() => {
    reportPrisma.location.findMany.mockReset().mockResolvedValue([{ id: "branch", code: "B", name: "Branch" }]);
    reportPrisma.product.findMany.mockReset().mockResolvedValue([
      { id: "fast", itemCode: "F-1", name: "Fast seller", category: "Bars", brand: "Acme" },
      { id: "slow", itemCode: "S-1", name: "Slow seller", category: "Bars", brand: "Acme" },
      { id: "dead", itemCode: "D-1", name: "Dead stock", category: "Racks", brand: null },
      { id: "never", itemCode: "N-1", name: "Never stocked here", category: "Racks", brand: null },
    ]);
    reportPrisma.inventoryBalance.findMany.mockReset().mockResolvedValue([
      { id: "b1", productId: "fast", locationId: "branch", onHand: 10, reserved: 2, quarantined: 0 },
      { id: "b2", productId: "slow", locationId: "branch", onHand: 40, reserved: 0, quarantined: 0 },
      { id: "b3", productId: "dead", locationId: "branch", onHand: 26, reserved: 0, quarantined: 0 },
    ]);
    reportPrisma.saleLine.findMany.mockReset().mockResolvedValue([
      { productId: "fast", quantity: 6, unitPrice: { toNumber: () => 1_000 }, sale: { locationId: "branch", postedAt: new Date("2026-09-20T00:00:00Z") } },
      { productId: "fast", quantity: 2, unitPrice: { toNumber: () => 1_000 }, sale: { locationId: "branch", postedAt: new Date("2026-09-27T00:00:00Z") } },
      { productId: "slow", quantity: 1, unitPrice: { toNumber: () => 500 }, sale: { locationId: "branch", postedAt: new Date("2026-09-03T00:00:00Z") } },
    ]);
  });

  it("grades each product by what it sold and puts the dead stock first", async () => {
    const report = await reports.getReport(actor, query);
    if (report.type !== "stock-movement") throw new Error("Expected stock movement report");

    // Slowest first: the stock nobody bought is what a monthly review looks for.
    expect(report.rows.map((row) => [row.itemCode, row.soldUnits, row.grade])).toEqual([
      ["D-1", 0, "NO_MOVEMENT"],
      ["S-1", 1, "SLOW"],
      ["F-1", 8, "FAST"],
    ]);
    // A product this branch never stocked and never sold is not on the sheet.
    expect(report.rows.some((row) => row.itemCode === "N-1")).toBe(false);
    // 8 units across two sales, latest wins for "last sold".
    expect(report.rows[2]).toMatchObject({ soldAmount: 8_000, available: 8, coverPeriods: 1, lastSoldAt: "2026-09-27T00:00:00.000Z" });
    // 40 available against 1 sold is 40 periods of cover, far past slow.
    expect(report.rows[1]).toMatchObject({ coverPeriods: 40, lastSoldAt: "2026-09-03T00:00:00.000Z" });
    expect(report.rows[0]).toMatchObject({ coverPeriods: null, lastSoldAt: null });
    expect(report.totals).toMatchObject({ noMovementCount: 1, slowCount: 1, fastCount: 1, soldUnits: 9, soldAmount: 8_500, onHand: 76 });
    expect(report.appliedFilters).toContainEqual({ label: "Sold counted on", value: "Posted sales, voided excluded" });
  });

  it("counts only posted sales inside the period at authorized branches", async () => {
    await reports.getReport(actor, query);
    expect(reportPrisma.saleLine.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sale: {
          status: "POSTED",
          locationId: { in: ["branch"] },
          postedAt: { gte: new Date("2026-08-31T16:00:00Z"), lt: new Date("2026-09-30T16:00:00Z") },
        },
      }),
    }));
  });

  it("narrows to a single movement grade when asked", async () => {
    const report = await reports.getReport(actor, { ...query, movement: "NO_MOVEMENT" });
    if (report.type !== "stock-movement") throw new Error("Expected stock movement report");
    expect(report.rows.map((row) => row.itemCode)).toEqual(["D-1"]);
    expect(report.totals).toMatchObject({ noMovementCount: 1, slowCount: 0, fastCount: 0, soldUnits: 0 });
  });
});

describe("multi-item Backjob report", () => {
  it("finds a later original item by code or name and counts its case and charge once", async () => {
    reportPrisma.location.findMany.mockResolvedValue([{ id: "branch", code: "B", name: "Branch" }]);
    reportPrisma.backjob.findMany.mockResolvedValue([{
      id: "backjob", createdAt: new Date("2026-09-08T00:00:00Z"), reference: "BJ-1",
      locationCode: "B", locationName: "Branch", customerName: "Customer",
      affectedProductItemCode: "P-1", affectedProductName: "First product", legacyProductDescription: null,
      items: [{ productItemCode: "P-1", productName: "First product" }, { productItemCode: "P-2", productName: "Second product" }],
      status: "COMPLETED", coverage: "CHARGEABLE", originalSaleReference: "SALE-1", originalReceiptNumber: "R-1",
      installerName: null, scheduledFor: null, chargeableAmount: { toNumber: () => 1250 }, originalSale: null,
    }]);
    for (const entitySearch of ["p-2", "second product"]) {
      const report = await reports.getReport({ userId: "actor", roleDefinitionId: "role", isOwner: false, capabilities: ["reports:sales", "reports:salesperson-sales", "reports:inventory-summary", "reports:stock-movement", "reports:returns-warranty"], locationIds: ["branch"] }, {
        type: "returns-warranty", caseType: "BACKJOB", dateFrom: "2026-09-01", dateTo: "2026-09-30", entitySearch,
      });
      expect(report.type).toBe("returns-warranty");
      if (report.type !== "returns-warranty") throw new Error("Expected Returns & Warranty report");
      expect(report.rows).toHaveLength(1);
      expect(report.rows[0]).toMatchObject({ product: "P-1 - First product; P-2 - Second product", quantity: null, backjobChargeAmount: 1250 });
      expect(report.totals).toMatchObject({ total: 1, completed: 1, backjobChargeAmount: 1250, supplierRefundAmount: 0, supplierCreditAmount: 0, byType: [{ label: "Backjob", count: 1 }] });
    }
    expect(reportPrisma.backjob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ items: { select: { productItemCode: true, productName: true }, orderBy: { position: "asc" } } }),
    }));
  });
});
