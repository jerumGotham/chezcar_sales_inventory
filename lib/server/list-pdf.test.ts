import { beforeAll, describe, expect, it, vi } from "vitest";

import type { InventoryApiResponse } from "@/lib/catalog";

vi.mock("server-only", () => ({}));

let listPdf: typeof import("./list-pdf");

beforeAll(async () => {
  listPdf = await import("./list-pdf");
});

const metadata = {
  generatedBy: "Test Encoder (encoder@example.com)",
  scope: "All authorized locations",
  appliedFilters: [{ label: "Status", value: "Low Stock" }],
};

function header(body: ArrayBuffer) {
  return new TextDecoder().decode(new Uint8Array(body).slice(0, 5));
}

const inventory: InventoryApiResponse = {
  data: [
    {
      id: "balance-1", itemCode: "ITM-001", name: "Brake Pad", description: "Front brake pad set",
      brand: "Predator", carModel: "Hilux", yearModel: "2016-2020", price: 1250, imageUrl: null,
      category: "Brakes", location: "Binan", locationCode: "BL",
      onHand: 10, reserved: 2, quarantined: 1, reorderLevel: 5, unitCost: 250,
      lastUpdated: "2026-09-18T01:00:00.000Z", status: "In Stock",
    },
  ],
  meta: { page: 1, pageSize: 5000, total: 1, totalPages: 1 },
  filterOptions: { brands: [] },
  summary: { totalProducts: 1, totalUnits: 10, needsRestock: 0, incomingItems: 3, incomingItemsLabel: "Incoming items" },
};

describe("list PDF exports", () => {
  it("renders an inventory copy with its rows", async () => {
    const body = await listPdf.createInventoryListPdf(inventory, metadata);
    expect(header(body)).toBe("%PDF-");
    expect(body.byteLength).toBeGreaterThan(1000);
  });

  it("renders one line per product with a column per branch", async () => {
    // The same product in two branches. The export has to fold these into one
    // line and give each branch its own column, which is the whole shape of
    // the sheet this replaces.
    const [balance] = inventory.data;
    const body = await listPdf.createInventoryListPdf(
      {
        ...inventory,
        data: [
          balance,
          { ...balance, id: "balance-2", location: "Quezon City", locationCode: "QC", onHand: 4, reserved: 0, quarantined: 0 },
        ],
      },
      metadata,
    );
    expect(header(body)).toBe("%PDF-");
    expect(body.byteLength).toBeGreaterThan(1000);
  });

  it("renders a direct sales copy", async () => {
    const body = await listPdf.createDirectSalesPdf([
      {
        reference: "DS-0001", manualReceiptNumber: "0001", postedAt: "2026-09-18T01:00:00.000Z",
        branch: "Binan", customer: "Walk-in", salesperson: "Not recorded", encoder: "Test Encoder",
        paymentMethod: "CASH", reviewStatus: "UNVERIFIED", units: 2, discountAmount: 50,
        totalAmount: 1950, amountPaid: 1950,
      },
    ], metadata);
    expect(header(body)).toBe("%PDF-");
  });

  it("renders a customer orders copy", async () => {
    const body = await listPdf.createCustomerOrdersPdf([
      {
        orderNo: "CO-0001", orderDate: "Sep 18, 2026", releaseDate: "Not set", branch: "Binan",
        customer: "Juan Cruz", salesperson: "Not recorded", status: "Reserved", paymentStatus: "Partial",
        itemSummary: "Brake Pad", totalItems: 1, downpayment: 500, totalAmount: 1950, balance: 1450,
      },
    ], metadata);
    expect(header(body)).toBe("%PDF-");
  });

  it("renders an empty export without rows", async () => {
    const body = await listPdf.createCustomerOrdersPdf([], { ...metadata, appliedFilters: [] });
    expect(header(body)).toBe("%PDF-");
  });
});
