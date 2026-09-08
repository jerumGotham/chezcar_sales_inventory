import { beforeAll, describe, expect, it, vi } from "vitest";

const reportPrisma = vi.hoisted(() => ({
  location: { findMany: vi.fn() },
  backjob: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", () => ({ prisma: reportPrisma }));

let reports: typeof import("./reports");

beforeAll(async () => {
  reports = await import("./reports");
});

describe("report filters", () => {
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
      const report = await reports.getReport({ userId: "actor", roleDefinitionId: "role", isOwner: false, capabilities: ["reports:view"], locationIds: ["branch"] }, {
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
