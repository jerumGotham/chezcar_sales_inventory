import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});
void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

function actor(user: Parameters<typeof authContextFor>[0], location: Parameters<typeof authContextFor>[1]): AuthContext {
  return authContextFor(user, location);
}

describe("supplier receipt posting", () => {
  it("atomically persists an SR receipt, immutable line snapshot, balance increment, and movement", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-ITEM", name: "Original Product Name", status: "ACTIVE" } });
      const supplier = await prisma.supplier.create({ data: { name: "Acme Supplier" } });
      await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.stockRoom.id, productId: product.id, onHand: 4, quarantined: 2, unitCost: 1 } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");

      const receipt = await createStockReceipt(actor(fixture.users.stockStaff, fixture.locations.stockRoom), {
        reference: "DR-1001", supplierId: supplier.id, notes: "Morning delivery", lines: [{ productId: product.id, expectedQuantity: 6, acceptedQuantity: 6, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 25 }],
      });

      expect(receipt.location.code).toBe("SR");
      expect(receipt).toMatchObject({ supplier: { id: supplier.id, name: "Acme Supplier" }, supplierName: "Acme Supplier" });
      expect(receipt.lines).toMatchObject([{ productId: product.id, quantity: 6, acceptedQuantity: 6, quarantinedQuantity: 0, missingQuantity: 0, productItemCode: "RECEIPT-ITEM", productName: "Original Product Name" }]);
      await prisma.product.update({ where: { id: product.id }, data: { name: "Renamed Product" } });
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.stockRoom.id, productId: product.id } } })).toMatchObject({ onHand: 10, quarantined: 2, unitCost: expect.anything() });
      expect((await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.stockRoom.id, productId: product.id } } })).unitCost.toNumber()).toBe(25);
      expect(await prisma.inventoryMovement.findMany({ where: { receiptId: receipt.id } })).toMatchObject([{ productId: product.id, locationId: fixture.locations.stockRoom.id, quantity: 6, type: "SUPPLIER_RECEIPT", actorId: fixture.users.stockStaff.id }]);
      expect(await prisma.stockReceiptLine.findFirstOrThrow({ where: { receiptId: receipt.id } })).toMatchObject({ productName: "Original Product Name" });
      await prisma.supplier.update({ where: { id: supplier.id }, data: { name: "Renamed Supplier" } });
      const { listStockReceipts } = await import("../../lib/server/services/stock-receipts");
      await expect(listStockReceipts(actor(fixture.users.stockStaff, fixture.locations.stockRoom))).resolves.toMatchObject([
        { supplierName: "Acme Supplier", supplier: { id: supplier.id, name: "Renamed Supplier" } },
      ]);
    });
  }, 30_000);

  it("rejects duplicate reference and leaves balances and movements unchanged", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-duplicate" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-DUP", name: "Receipt Duplicate", status: "ACTIVE" } });
      const supplier = await prisma.supplier.create({ data: { name: "Acme Supplier" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");
      const stockActor = actor(fixture.users.stockStaff, fixture.locations.stockRoom);
      const input = { reference: "DR-1002", supplierId: supplier.id, lines: [{ productId: product.id, expectedQuantity: 3, acceptedQuantity: 3, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 12.5 }] };
      await createStockReceipt(stockActor, input);
      await expect(createStockReceipt(stockActor, input)).rejects.toMatchObject({ code: "DUPLICATE_REFERENCE" });
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.stockRoom.id, productId: product.id } } })).toMatchObject({ onHand: 3 });
      expect(await prisma.inventoryMovement.count({ where: { productId: product.id, type: "SUPPLIER_RECEIPT" } })).toBe(1);
    });
  }, 30_000);

  it("allows Admin to post SR receipts and still rejects Branch Staff", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-authorization" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-AUTH", name: "Receipt Authorization", status: "ACTIVE" } });
      const supplier = await prisma.supplier.create({ data: { name: "Acme Supplier" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");
      const input = { reference: "DR-1003", supplierId: supplier.id, lines: [{ productId: product.id, expectedQuantity: 1, acceptedQuantity: 1, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 10 }] };
      await expect(createStockReceipt(actor(fixture.users.admin, null), input)).resolves.toMatchObject({ location: { code: "SR" } });
      await expect(createStockReceipt(actor(fixture.users.branchStaff, fixture.locations.branches.QC), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.stockReceipt.count()).toBe(1);
      expect(await prisma.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: fixture.locations.stockRoom.id, productId: product.id } } })).toMatchObject({ onHand: 1 });
      expect(await prisma.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: product.id } } })).toBeNull();
      await prisma.supplier.update({ where: { id: supplier.id }, data: { status: "INACTIVE" } });
      await expect(createStockReceipt(actor(fixture.users.admin, null), { ...input, reference: "DR-1004" })).rejects.toMatchObject({ code: "INVALID_SUPPLIER" });
      expect(await prisma.stockReceipt.count()).toBe(1);
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
