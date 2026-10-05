import { beforeAll, describe, expect, it, vi } from "vitest";

import type { SalesReport, SalespersonSalesReport } from "@/lib/contracts/reports";

vi.mock("server-only", () => ({}));

let reportPdf: typeof import("./report-pdf");

beforeAll(async () => {
  reportPdf = await import("./report-pdf");
});

const metadata = { generatedBy: "Test Encoder (encoder@example.com)" };

function header(body: ArrayBuffer) {
  return new TextDecoder().decode(new Uint8Array(body).slice(0, 5));
}

const row: SalesReport["rows"][number] = {
  id: "payment-1",
  soldAt: "2026-10-03T02:00:00.000Z",
  verifiedAt: "2026-10-03T04:00:00.000Z",
  manualReceiptNumber: "OR-TEST-001",
  receiptIssued: true,
  branch: "BL - Binan Laguna",
  customer: "Buyer",
  salespersonId: "person-1",
  salesperson: "Seller",
  encoder: "Encoder",
  source: "Order Release",
  paymentMethod: "CASH",
  units: 1,
  discountAmount: 0,
  totalAmount: 20_000,
  verificationStatus: "VERIFIED",
  items: [
    { itemCode: "1014", name: "Rollerlid", quantity: 1, listPrice: 25_000, discount: 5_000, unitPrice: 20_000, amount: 20_000, fitment: ["Toyota Hilux 2016-2020"] },
  ],
  itemsPending: false,
};

const sales: SalesReport = {
  type: "sales",
  generatedAt: "2026-10-03T04:46:00.000Z",
  dateFrom: "2026-10-01",
  dateTo: "2026-10-31",
  effectiveScope: [{ id: "branch-bl", label: "BL - Binan Laguna" }],
  appliedFilters: [{ label: "Branch", value: "All authorized" }],
  filters: { locations: [], defaultLocationId: null, salespersons: [], categories: [], brands: [] },
  view: "SALE_DATE",
  pending: { count: 0, amount: 0 },
  verifiedTotal: { transactionCount: 1, totalAmount: 20_000 },
  unverifiedTotal: { transactionCount: 0, totalAmount: 0 },
  rows: [row],
  branchTotals: [{ branch: "BL - Binan Laguna", transactionCount: 1, units: 1, totalAmount: 20_000, percentage: 100 }],
  grandTotal: { transactionCount: 1, units: 1, totalDiscount: 0, averageSale: 20_000, totalAmount: 20_000 },
};

const salespersonSales: SalespersonSalesReport = {
  ...sales,
  type: "salesperson-sales",
  salespersonTotals: [
    { salespersonId: "person-1", salesperson: "Seller", transactionCount: 1, units: 1, totalDiscount: 0, averageSale: 20_000, totalAmount: 20_000, percentage: 100 },
  ],
};

describe("sales report PDF exports", () => {
  /*
   * The detail table prints a cell per column. A row that carries more cells
   * than the table has columns throws while drawing, which is a 500 at the
   * export endpoint rather than a bad-looking page, so both reports are built
   * here with a row that fills every cell.
   */
  it("prints a sales row with its items without running past its columns", async () => {
    const body = await reportPdf.createReportPdf(sales, metadata);
    expect(header(body)).toBe("%PDF-");
    expect(body.byteLength).toBeGreaterThan(1000);
  });

  it("prints the salesperson grouping, which adds a subtotal line of its own", async () => {
    const body = await reportPdf.createReportPdf(salespersonSales, metadata);
    expect(header(body)).toBe("%PDF-");
    expect(body.byteLength).toBeGreaterThan(1000);
  });

  it("prints a downpayment, whose goods are on order and counted nowhere yet", async () => {
    const body = await reportPdf.createReportPdf(
      {
        ...sales,
        rows: [{ ...row, source: "Order Downpayment", units: 0, totalAmount: 10_000, itemsPending: true }],
        grandTotal: { ...sales.grandTotal, units: 0, totalAmount: 10_000, averageSale: 10_000 },
      },
      metadata,
    );
    expect(header(body)).toBe("%PDF-");
  });
});
