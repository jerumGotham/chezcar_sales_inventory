import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireCapability: vi.fn(), createStockReceipt: vi.fn(), listStockReceipts: vi.fn() }));
vi.mock("@/lib/server/authorization", () => ({ requireCapability: mocks.requireCapability, authorizationErrorResponse: (error: unknown) => { throw error; } }));
vi.mock("@/lib/server/services/stock-receipts", () => ({ StockReceiptError: class StockReceiptError extends Error {}, createStockReceipt: mocks.createStockReceipt, listStockReceipts: mocks.listStockReceipts }));
vi.mock("@/lib/contracts/stock-receipts", async () => import("../../lib/contracts/stock-receipts"));

import { POST } from "../../app/api/stock-receipts/route";

describe("stock receipt route", () => {
  beforeEach(() => { mocks.requireCapability.mockReset(); mocks.createStockReceipt.mockReset(); });

  it("requires the receiving capability before parsing or posting", async () => {
    mocks.requireCapability.mockRejectedValue(new Error("denied"));
    await expect(POST(new Request("http://localhost/api/stock-receipts", { method: "POST", body: "not-json" }))).resolves.toMatchObject({ status: 500 });
    expect(mocks.requireCapability).toHaveBeenCalledWith(expect.any(Headers), "inventory-receiving:create");
    expect(mocks.createStockReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid line", [{ productId: "product-1", quantity: 0, unitCost: 10 }]],
    ["duplicate products", [
      { productId: "product-1", quantity: 1, unitCost: 10 },
      { productId: "product-1", quantity: 2, unitCost: 20 },
    ]],
  ])("rejects the entire payload for %s", async (_label, lines) => {
    mocks.requireCapability.mockResolvedValue({ userId: "user-1", role: "STOCK_STAFF" });
    const response = await POST(new Request("http://localhost/api/stock-receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: "DR-1001", supplier: "Acme", lines }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.createStockReceipt).not.toHaveBeenCalled();
  });
});
