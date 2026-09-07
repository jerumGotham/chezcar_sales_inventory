import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

const environment = vi.hoisted(() => { process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public"; return {}; });
void environment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

describe("customer warranties", () => {
  it("receives a verified sold item into quarantine and idempotently releases a repair", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "warranty-flow" });
      const location = fixture.locations.branches.QC;
      const actor = authContextFor(fixture.users.admin, null);
      const customer = await prisma.customer.create({ data: { name: "Warranty Customer" } });
      const product = await prisma.product.create({ data: { itemCode: "WARRANTY-ITEM", name: "Warranty Item", warrantyDurationMonths: 12 } });
      const sale = await prisma.sale.create({ data: { reference: "SALE-WARRANTY-1", manualReceiptNumber: "WR-1", locationId: location.id, customerId: customer.id, status: "POSTED", paymentMethod: "CASH", totalAmount: 100, amountPaid: 100, postedById: fixture.users.admin.id, lines: { create: { productId: product.id, productItemCode: product.itemCode, productName: product.name, quantity: 2, unitPrice: 50 } }, accountingReview: { create: { status: "VERIFIED" } } }, include: { lines: true } });
      const { actOnCustomerWarranty, createCustomerWarranty } = await import("../../lib/server/services/customer-warranties");
      const created = await createCustomerWarranty(actor, { idempotencyKey: crypto.randomUUID(), locationId: location.id, saleLineId: sale.lines[0].id, claimQuantity: 2, concern: "Failed in use" }, { key: `${crypto.randomUUID()}.jpg`, contentType: "image/jpeg", fileName: "item.jpg" });
      let warranty = await actOnCustomerWarranty(actor, created.warranty.id, "receive-quarantine", { idempotencyKey: crypto.randomUUID(), version: 1, quantity: 2 });
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: product.id } } })).resolves.toMatchObject({ onHand: 2, quarantined: 2 });
      warranty = await actOnCustomerWarranty(actor, created.warranty.id, "approve-repair", { idempotencyKey: crypto.randomUUID(), version: warranty.version });
      warranty = await actOnCustomerWarranty(actor, warranty.id, "mark-ready", { idempotencyKey: crypto.randomUUID(), version: warranty.version });
      const releaseKey = crypto.randomUUID();
      const released = await actOnCustomerWarranty(actor, warranty.id, "release", { idempotencyKey: releaseKey, version: warranty.version });
      const replay = await actOnCustomerWarranty(actor, warranty.id, "release", { idempotencyKey: releaseKey, version: warranty.version });
      expect(released.status).toBe("RELEASED"); expect(replay.version).toBe(released.version);
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: product.id } } })).resolves.toMatchObject({ onHand: 0, quarantined: 0 });
      await expect(prisma.customerWarrantyEvent.update({ where: { id: released.events[0].id }, data: { type: "TAMPERED" } })).rejects.toThrow();
    });
  }, 30_000);
});

afterEach(async () => { const { prisma } = await import("../../lib/server/prisma"); await prisma.$disconnect(); });
afterAll(async () => { const { prisma } = await import("../../lib/server/prisma"); await prisma.$disconnect(); });
