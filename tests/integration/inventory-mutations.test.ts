import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return { getSession: vi.fn() };
});

void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: testEnvironment.getSession } },
}));
vi.mock("@/lib/catalog", async () => import("../../lib/catalog"));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/policy/access", async () =>
  import("../../lib/server/policy/access"),
);
vi.mock("@/lib/server/authorization", async () =>
  import("../../lib/server/authorization"),
);

function actor(
  user: Parameters<typeof authContextFor>[0],
  location: Parameters<typeof authContextFor>[1],
): AuthContext {
  return authContextFor(user, location);
}

describe("inventory corrections and reorder levels", () => {
  it("allows Admin manual correction with required audit fields and low-stock notifications", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "inventory-correction" });
      const product = await prisma.product.create({
        data: { itemCode: "CORRECTION-ITEM", name: "Correction Item", reorderLevel: 3, status: "ACTIVE" },
      });
      const balance = await prisma.inventoryBalance.create({
        data: {
          locationId: fixture.locations.branches.QC.id,
          productId: product.id,
          onHand: 8,
          reserved: 2,
          unitCost: 1,
        },
      });
      const { correctInventoryBalance } = await import("../../lib/server/catalog");

      const updated = await correctInventoryBalance(actor(fixture.users.admin, null), balance.id, {
        type: "decrease",
        quantity: 3,
        reference: "ADJ-LOW-001",
        reason: "Physical recount shortage",
        remarks: "Shelf count verified",
      });

      expect(updated).toMatchObject({ onHand: 5, reserved: 2, status: "Low Stock" });
      await expect(prisma.inventoryMovement.findMany({ where: { productId: product.id } })).resolves.toMatchObject([
        {
          quantity: -3,
          type: "MANUAL_ADJUSTMENT",
          actorId: fixture.users.admin.id,
          reference: "ADJ-LOW-001",
          remarks: "Physical recount shortage - Shelf count verified",
        },
      ]);
      await expect(prisma.notification.findMany({ where: { relatedId: balance.id } })).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: fixture.users.admin.id, title: "Low Stock: CORRECTION-ITEM" }),
          expect.objectContaining({ userId: fixture.users.branchStaff.id, title: "Low Stock: CORRECTION-ITEM" }),
        ]),
      );
    });
  }, 30_000);

  it("rejects non-Admin corrections and decreases below reserved stock", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "inventory-correction-denied" });
      const product = await prisma.product.create({
        data: { itemCode: "RESERVED-ITEM", name: "Reserved Item", status: "ACTIVE" },
      });
      const balance = await prisma.inventoryBalance.create({
        data: {
          locationId: fixture.locations.branches.QC.id,
          productId: product.id,
          onHand: 5,
          reserved: 4,
          unitCost: 1,
        },
      });
      const { correctInventoryBalance } = await import("../../lib/server/catalog");

      await expect(correctInventoryBalance(actor(fixture.users.branchStaff, fixture.locations.branches.QC), balance.id, {
        type: "increase",
        quantity: 1,
        reason: "Unauthorized",
      })).rejects.toMatchObject({ code: "FORBIDDEN" });

      await expect(correctInventoryBalance(actor(fixture.users.admin, null), balance.id, {
        type: "decrease",
        quantity: 2,
        reason: "Too much",
      })).rejects.toMatchObject({ code: "BELOW_RESERVED" });
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } })).resolves.toMatchObject({ onHand: 5, reserved: 4 });
    });
  }, 30_000);

  it("lets Admin correct unit cost without changing stock quantity", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "inventory-unit-cost" });
      const product = await prisma.product.create({
        data: { itemCode: "UNIT-COST-FIX", name: "Unit Cost Fix", status: "ACTIVE" },
      });
      const balance = await prisma.inventoryBalance.create({
        data: {
          locationId: fixture.locations.stockRoom.id,
          productId: product.id,
          onHand: 100,
          reserved: 0,
          unitCost: 0,
        },
      });
      const { updateInventoryUnitCost } = await import("../../lib/server/catalog");

      const updated = await updateInventoryUnitCost(actor(fixture.users.admin, null), balance.id, {
        unitCost: 88.5,
        reason: "Correct supplier cost",
      });

      expect(updated).toMatchObject({ onHand: 100, unitCost: 88.5 });
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } })).resolves.toMatchObject({ onHand: 100 });
      const persisted = await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
      expect(persisted.unitCost.toNumber()).toBe(88.5);
      await expect(prisma.inventoryMovement.findMany({ where: { productId: product.id } })).resolves.toMatchObject([
         expect.objectContaining({ quantity: 0, type: "MANUAL_ADJUSTMENT", remarks: "Correct supplier cost - Unit cost changed from 0 to 88.5" }),
      ]);
    });
  }, 30_000);

  it("updates reorder level and filters inventory status by available stock", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "inventory-reorder" });
      const product = await prisma.product.create({
        data: { itemCode: "AVAILABLE-FILTER", name: "Available Filter", status: "ACTIVE" },
      });
      const balance = await prisma.inventoryBalance.create({
        data: {
          locationId: fixture.locations.branches.QC.id,
          productId: product.id,
          onHand: 5,
          reserved: 5,
          unitCost: 1,
        },
      });
       const { listInventory } = await import("../../lib/server/catalog");
      const adminActor = actor(fixture.users.admin, null);

      await expect(listInventory({ page: 1, pageSize: 10, itemCode: "AVAILABLE-FILTER", name: "", category: "all", location: "all", status: "Out of Stock" }, adminActor)).resolves.toMatchObject({
        data: [expect.objectContaining({ itemCode: "AVAILABLE-FILTER", status: "Out of Stock" })],
        meta: expect.objectContaining({ total: 1 }),
      });
      await expect(listInventory({ page: 1, pageSize: 10, itemCode: "AVAILABLE-FILTER", name: "", category: "all", location: "all", status: "In Stock" }, adminActor)).resolves.toMatchObject({
        data: [],
        meta: expect.objectContaining({ total: 0 }),
      });
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
