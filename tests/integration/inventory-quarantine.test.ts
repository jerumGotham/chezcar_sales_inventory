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

describe("inventory quarantine foundation", () => {
  it("enforces nonnegative and allocated-stock database invariants", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "quarantine-constraints" });
      const product = await prisma.product.create({ data: { itemCode: "QUAR-CONSTRAINT", name: "Quarantine Constraint" } });
      const base = { locationId: fixture.locations.branches.QC.id, productId: product.id };

      await expect(prisma.inventoryBalance.create({ data: { ...base, onHand: -1 } })).rejects.toThrow();
      await expect(prisma.inventoryBalance.create({ data: { ...base, onHand: 1, reserved: -1 } })).rejects.toThrow();
      await expect(prisma.inventoryBalance.create({ data: { ...base, onHand: 1, quarantined: -1 } })).rejects.toThrow();
      await expect(prisma.inventoryBalance.create({ data: { ...base, onHand: 2, reserved: 1, quarantined: 2 } })).rejects.toThrow();

      const balance = await prisma.inventoryBalance.create({ data: { ...base, onHand: 3, reserved: 1, quarantined: 2 } });
      expect(balance.quarantined).toBe(2);
      await expect(prisma.inventoryBalance.update({ where: { id: balance.id }, data: { onHand: 2 } })).rejects.toThrow();
    });
  }, 30_000);

  it("blocks sales against quarantined stock without changing balances", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "quarantine-sale" });
      const branch = fixture.locations.branches.QC;
      const product = await prisma.product.create({ data: { itemCode: "QUAR-SALE", name: "Quarantined Sale", price: 25, reorderLevel: 1 } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: product.id, onHand: 5, reserved: 1, quarantined: 4 } });
      const { createDirectSale } = await import("../../lib/server/services/customer-sales");

      await expect(createDirectSale(authContextFor(fixture.users.branchStaff, branch), {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "QUAR-SALE-001",
        paymentMethod: "CASH",
        amountPaid: 25,
        lines: [{ productId: product.id, quantity: 1 }],
      })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 5, reserved: 1, quarantined: 4 });
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
