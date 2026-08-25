import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});
void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

function actor(user: { id: string; role: AuthContext["role"]; locationId: string | null }, location: AuthContext["location"]): AuthContext {
  return { userId: user.id, role: user.role, locationId: user.locationId, location };
}

describe("supplier receipt posting", () => {
  it("atomically persists an SR receipt, immutable line snapshot, balance increment, and movement", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-ITEM", name: "Original Product Name", status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.stockRoom.id, productId: product.id, onHand: 4, unitCost: 1 } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");

      const receipt = await createStockReceipt(actor(fixture.users.stockStaff, fixture.locations.stockRoom), {
        reference: "DR-1001", supplier: "Acme Supplier", notes: "Morning delivery", lines: [{ productId: product.id, quantity: 6 }],
      });

      expect(receipt.location.code).toBe("SR");
      expect(receipt.lines).toEqual([{ productId: product.id, quantity: 6, productItemCode: "RECEIPT-ITEM", productName: "Original Product Name" }]);
      await prisma.product.update({ where: { id: product.id }, data: { name: "Renamed Product" } });
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.stockRoom.id, productId: product.id } } })).toMatchObject({ onHand: 10 });
      expect(await prisma.inventoryMovement.findMany({ where: { receiptId: receipt.id } })).toMatchObject([{ productId: product.id, locationId: fixture.locations.stockRoom.id, quantity: 6, type: "SUPPLIER_RECEIPT", actorId: fixture.users.stockStaff.id }]);
      expect(await prisma.stockReceiptLine.findFirstOrThrow({ where: { receiptId: receipt.id } })).toMatchObject({ productName: "Original Product Name" });
    });
  }, 30_000);

  it("rejects duplicate reference and leaves balances and movements unchanged", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-duplicate" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-DUP", name: "Receipt Duplicate", status: "ACTIVE" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");
      const stockActor = actor(fixture.users.stockStaff, fixture.locations.stockRoom);
      const input = { reference: "DR-1002", supplier: "Acme Supplier", lines: [{ productId: product.id, quantity: 3 }] };
      await createStockReceipt(stockActor, input);
      await expect(createStockReceipt(stockActor, input)).rejects.toMatchObject({ code: "DUPLICATE_REFERENCE" });
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.stockRoom.id, productId: product.id } } })).toMatchObject({ onHand: 3 });
      expect(await prisma.inventoryMovement.count({ where: { productId: product.id, type: "SUPPLIER_RECEIPT" } })).toBe(1);
    });
  }, 30_000);

  it("rejects Admin and Branch Staff, including any attempted branch destination", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-authorization" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-AUTH", name: "Receipt Authorization", status: "ACTIVE" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");
      const input = { reference: "DR-1003", supplier: "Acme Supplier", lines: [{ productId: product.id, quantity: 1 }] };
      await expect(createStockReceipt(actor(fixture.users.admin, null), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(createStockReceipt(actor(fixture.users.branchStaff, fixture.locations.branches.QC), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.stockReceipt.count()).toBe(0);
      expect(await prisma.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: product.id } } })).toBeNull();
    });
  }, 30_000);
});

afterEach(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});

afterAll(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
