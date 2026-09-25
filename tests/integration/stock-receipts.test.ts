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
      await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.SP.id, productId: product.id, onHand: 4, quarantined: 2, unitCost: 1 } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");

      const receipt = await createStockReceipt(actor(fixture.users.stockStaff, fixture.locations.branches.SP), {
        reference: "DR-1001", supplierId: supplier.id, notes: "Morning delivery", lines: [{ productId: product.id, expectedQuantity: 6, acceptedQuantity: 6, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 25 }],
      });

      expect(receipt.location.code).toBe("SP");
      expect(receipt).toMatchObject({ supplier: { id: supplier.id, name: "Acme Supplier" }, supplierName: "Acme Supplier" });
      expect(receipt.lines).toMatchObject([{ productId: product.id, quantity: 6, acceptedQuantity: 6, quarantinedQuantity: 0, missingQuantity: 0, productItemCode: "RECEIPT-ITEM", productName: "Original Product Name" }]);
      await prisma.product.update({ where: { id: product.id }, data: { name: "Renamed Product" } });
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.SP.id, productId: product.id } } })).toMatchObject({ onHand: 10, quarantined: 2, unitCost: expect.anything() });
      expect((await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.SP.id, productId: product.id } } })).unitCost.toNumber()).toBe(25);
      expect(await prisma.inventoryMovement.findMany({ where: { receiptId: receipt.id } })).toMatchObject([{ productId: product.id, locationId: fixture.locations.branches.SP.id, quantity: 6, type: "SUPPLIER_RECEIPT", actorId: fixture.users.stockStaff.id }]);
      expect(await prisma.stockReceiptLine.findFirstOrThrow({ where: { receiptId: receipt.id } })).toMatchObject({ productName: "Original Product Name" });
      await prisma.supplier.update({ where: { id: supplier.id }, data: { name: "Renamed Supplier" } });
      const { listStockReceipts } = await import("../../lib/server/services/stock-receipts");
      await expect(listStockReceipts(actor(fixture.users.stockStaff, fixture.locations.branches.SP))).resolves.toMatchObject([
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
      const stockActor = actor(fixture.users.stockStaff, fixture.locations.branches.SP);
      const input = { reference: "DR-1002", supplierId: supplier.id, lines: [{ productId: product.id, expectedQuantity: 3, acceptedQuantity: 3, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 12.5 }] };
      await createStockReceipt(stockActor, input);
      await expect(createStockReceipt(stockActor, input)).rejects.toMatchObject({ code: "DUPLICATE_REFERENCE" });
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.SP.id, productId: product.id } } })).toMatchObject({ onHand: 3 });
      expect(await prisma.inventoryMovement.count({ where: { productId: product.id, type: "SUPPLIER_RECEIPT" } })).toBe(1);
    });
  }, 30_000);

  it("assigns newly received quarantine directly to its split-receipt claim", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-claim" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-CLAIM", name: "Receipt Claim Item", status: "ACTIVE" } });
      const supplier = await prisma.supplier.create({ data: { name: "Claim Supplier" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");

      const receipt = await createStockReceipt(actor(fixture.users.stockStaff, fixture.locations.branches.SP), {
        reference: "DR-CLAIM-1", supplierId: supplier.id, lines: [{ productId: product.id, expectedQuantity: 3, acceptedQuantity: 0, quarantinedQuantity: 2, missingQuantity: 1, claimReason: "DAMAGE", unitCost: 15 }],
      });

      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.SP.id, productId: product.id } } })).resolves.toMatchObject({ onHand: 2, quarantined: 2 });
      await expect(prisma.supplierClaim.findUniqueOrThrow({ where: { sourceReceiptId: receipt.id }, include: { lines: true } })).resolves.toMatchObject({ lines: [{ productId: product.id, quarantinedQuantity: 2, openQuarantinedQuantity: 2, missingQuantity: 1 }] });
    });
  }, 30_000);

  it("limits manually sourced claims to exact receipt exception splits", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-source-claim" });
      const location = fixture.locations.branches.SP;
      const admin = actor(fixture.users.admin, null);
      const product = await prisma.product.create({ data: { itemCode: "SOURCE-CLAIM", name: "Source Claim Item", status: "ACTIVE" } });
      const foreignProduct = await prisma.product.create({ data: { itemCode: "SOURCE-FOREIGN", name: "Foreign Source Item", status: "ACTIVE" } });
      const supplier = await prisma.supplier.create({ data: { name: "Source Claim Supplier" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");
      const { createSupplierClaim } = await import("../../lib/server/services/supplier-claims");

      const cleanReceipt = await createStockReceipt(admin, { reference: "DR-CLEAN-SOURCE", supplierId: supplier.id, locationId: fixture.locations.branches.SP.id, lines: [{ productId: product.id, expectedQuantity: 1, acceptedQuantity: 1, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 10 }] });
      await expect(createSupplierClaim(admin, { idempotencyKey: crypto.randomUUID(), supplierId: supplier.id, locationId: location.id, sourceReceiptId: cleanReceipt.id, lines: [{ productId: product.id, reason: "INCOMPLETE", quarantinedQuantity: 0, missingQuantity: 1, unitCost: 10 }] })).rejects.toMatchObject({ code: "INVALID_SOURCE" });

      const exceptionReceipt = await prisma.stockReceipt.create({ data: { reference: "DR-EXCEPTION-SOURCE", supplierId: supplier.id, supplierName: supplier.name, locationId: location.id, receivedById: fixture.users.admin.id, lines: { create: { productId: product.id, quantity: 3, acceptedQuantity: 1, quarantinedQuantity: 1, missingQuantity: 1, productItemCode: product.itemCode, productName: product.name } } } });
      await prisma.inventoryBalance.update({ where: { locationId_productId: { locationId: location.id, productId: product.id } }, data: { onHand: { increment: 1 }, quarantined: { increment: 1 } } });
      const baseClaim = { supplierId: supplier.id, locationId: location.id, sourceReceiptId: exceptionReceipt.id, unitCost: 10 };
      await expect(createSupplierClaim(admin, { idempotencyKey: crypto.randomUUID(), supplierId: baseClaim.supplierId, locationId: baseClaim.locationId, sourceReceiptId: baseClaim.sourceReceiptId, lines: [{ productId: foreignProduct.id, reason: "INCOMPLETE", quarantinedQuantity: 0, missingQuantity: 1, unitCost: baseClaim.unitCost }] })).rejects.toMatchObject({ code: "INVALID_SOURCE" });
      await expect(createSupplierClaim(admin, { idempotencyKey: crypto.randomUUID(), supplierId: baseClaim.supplierId, locationId: baseClaim.locationId, sourceReceiptId: baseClaim.sourceReceiptId, lines: [{ productId: product.id, reason: "DAMAGE", quarantinedQuantity: 2, missingQuantity: 0, unitCost: baseClaim.unitCost }] })).rejects.toMatchObject({ code: "INVALID_SOURCE" });
      await expect(createSupplierClaim(admin, { idempotencyKey: crypto.randomUUID(), supplierId: baseClaim.supplierId, locationId: baseClaim.locationId, sourceReceiptId: baseClaim.sourceReceiptId, lines: [{ productId: product.id, reason: "INCOMPLETE", quarantinedQuantity: 0, missingQuantity: 2, unitCost: baseClaim.unitCost }] })).rejects.toMatchObject({ code: "INVALID_SOURCE" });
      const claim = await createSupplierClaim(admin, { idempotencyKey: crypto.randomUUID(), supplierId: baseClaim.supplierId, locationId: baseClaim.locationId, sourceReceiptId: baseClaim.sourceReceiptId, lines: [{ productId: product.id, reason: "DAMAGE", quarantinedQuantity: 1, missingQuantity: 1, unitCost: baseClaim.unitCost }] });
      expect(claim).toMatchObject({ sourceReceiptId: exceptionReceipt.id, lines: [{ productId: product.id, quarantinedQuantity: 1, missingQuantity: 1 }] });
      await expect(createSupplierClaim(admin, { idempotencyKey: crypto.randomUUID(), supplierId: baseClaim.supplierId, locationId: baseClaim.locationId, sourceReceiptId: baseClaim.sourceReceiptId, lines: [{ productId: product.id, reason: "DAMAGE", quarantinedQuantity: 1, missingQuantity: 1, unitCost: baseClaim.unitCost }] })).rejects.toMatchObject({ code: "INVALID_SOURCE" });
    });
  }, 30_000);

  it("allows Admin to post SR receipts and still rejects Branch Staff", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-authorization" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-AUTH", name: "Receipt Authorization", status: "ACTIVE" } });
      const supplier = await prisma.supplier.create({ data: { name: "Acme Supplier" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");
      const input = { reference: "DR-1003", supplierId: supplier.id, locationId: fixture.locations.branches.SP.id, lines: [{ productId: product.id, expectedQuantity: 1, acceptedQuantity: 1, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 10 }] };
      await expect(createStockReceipt(actor(fixture.users.admin, null), { ...input, locationId: undefined })).rejects.toMatchObject({ code: "LOCATION_REQUIRED" });
      await expect(createStockReceipt(actor(fixture.users.admin, null), input)).resolves.toMatchObject({ location: { code: "SP" } });
      await expect(createStockReceipt(actor(fixture.users.branchStaff, fixture.locations.branches.QC), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.stockReceipt.count()).toBe(1);
      expect(await prisma.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: fixture.locations.branches.SP.id, productId: product.id } } })).toMatchObject({ onHand: 1 });
      expect(await prisma.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: product.id } } })).toBeNull();
      await prisma.supplier.update({ where: { id: supplier.id }, data: { status: "INACTIVE" } });
      await expect(createStockReceipt(actor(fixture.users.admin, null), { ...input, reference: "DR-1004" })).rejects.toMatchObject({ code: "INVALID_SUPPLIER" });
      expect(await prisma.stockReceipt.count()).toBe(1);
    });
  }, 30_000);

  it("points a mixed delivery's alert at the receiving branch's inventory", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-mixed" });
      const first = await prisma.product.create({ data: { itemCode: "MIXED-A", name: "Mixed A", status: "ACTIVE" } });
      const second = await prisma.product.create({ data: { itemCode: "MIXED-B", name: "Mixed B", status: "ACTIVE" } });
      const supplier = await prisma.supplier.create({ data: { name: "Mixed Supplier" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");

      await createStockReceipt(actor(fixture.users.stockStaff, fixture.locations.branches.QC), {
        reference: "DR-MIXED-1", supplierId: supplier.id,
        lines: [
          { productId: first.id, expectedQuantity: 2, acceptedQuantity: 2, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 10 },
          { productId: second.id, expectedQuantity: 3, acceptedQuantity: 3, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 20 },
        ],
      });

      const notification = await prisma.notification.findFirstOrThrow({ where: { relatedReference: "DR-MIXED-1" } });
      expect(notification).toMatchObject({ relatedType: "INVENTORY_LOCATION", relatedId: fixture.locations.branches.QC.code });
      const { notificationDestination } = await import("../../lib/notification-links");
      expect(notificationDestination(notification)).toBe(`/inventory?location=${fixture.locations.branches.QC.code}`);
    });
  }, 30_000);

  it("posts a branch delivery into the receiver's own branch and refuses another branch", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "stock-receipt-branch" });
      const product = await prisma.product.create({ data: { itemCode: "RECEIPT-BRANCH", name: "Branch Delivery", status: "ACTIVE" } });
      const supplier = await prisma.supplier.create({ data: { name: "Branch Supplier" } });
      const { createStockReceipt } = await import("../../lib/server/services/stock-receipts");
      // Stock Staff scoped to one branch stands in for a branch receiver: the role
      // carries inventory-receiving:create, and the location decides the destination.
      const branchReceiver = actor(fixture.users.stockStaff, fixture.locations.branches.QC);

      const receipt = await createStockReceipt(branchReceiver, {
        reference: "DR-BRANCH-1", supplierId: supplier.id,
        lines: [{ productId: product.id, expectedQuantity: 4, acceptedQuantity: 4, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 15 }],
      });

      expect(receipt.location.id).toBe(fixture.locations.branches.QC.id);
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: product.id } } })).toMatchObject({ onHand: 4 });
      expect(await prisma.inventoryBalance.findUnique({ where: { locationId_productId: { locationId: fixture.locations.branches.SP.id, productId: product.id } } })).toBeNull();
      expect(await prisma.inventoryMovement.findMany({ where: { receiptId: receipt.id } })).toMatchObject([{ locationId: fixture.locations.branches.QC.id, type: "SUPPLIER_RECEIPT" }]);

      await expect(createStockReceipt(branchReceiver, {
        reference: "DR-BRANCH-2", supplierId: supplier.id, locationId: fixture.locations.branches.BL.id,
        lines: [{ productId: product.id, expectedQuantity: 1, acceptedQuantity: 1, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 15 }],
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.stockReceipt.count()).toBe(1);

      // Only the receiving branch and business-wide accounts hear about it.
      const notified = await prisma.notification.findMany({ where: { relatedReference: "DR-BRANCH-1" }, select: { userId: true, title: true, description: true, relatedType: true, relatedId: true } });
      expect(notified.length).toBeGreaterThan(0);
      expect(notified[0]).toMatchObject({ title: `Stock received at ${fixture.locations.branches.QC.name}` });
      expect(notified[0].description).toContain("4 piece(s)");
      // A single-product delivery links to that product's stock row, not the receipt.
      const branchBalance = await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: product.id } }, select: { id: true } });
      expect(notified[0]).toMatchObject({ relatedType: "INVENTORY_BALANCE", relatedId: branchBalance.id });
      const notifiedIds = notified.map((row) => row.userId);
      expect(notifiedIds).toContain(fixture.users.admin.id);
      // Assigned to Quezon City, so this is their delivery.
      expect(notifiedIds).toContain(fixture.users.branchStaff.id);
      // Business-wide account: sees every branch.
      expect(notifiedIds).toContain(fixture.users.accountingStaff.id);
      // Stock Room only, and an inactive Biñan account: neither is told.
      expect(notifiedIds).not.toContain(fixture.users.stockStaff.id);
      expect(notifiedIds).not.toContain(fixture.users.inactiveBranchStaff.id);
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
