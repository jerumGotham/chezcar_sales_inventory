import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});

void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

function actor(
  user: { id: string; role: AuthContext["role"]; locationId: string | null },
  location: AuthContext["location"],
): AuthContext {
  return {
    userId: user.id,
    role: user.role,
    locationId: user.locationId,
    location,
  };
}

describe("stock transfer posting", () => {
  it("moves SR stock to a newly-created branch balance only after exact receipt", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "stock-transfer",
      });
      const product = await prisma.product.create({
        data: { itemCode: "TRANSFER-ITEM", name: "Transfer Item", status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: {
          locationId: fixture.locations.stockRoom.id,
          productId: product.id,
          onHand: 10,
          reserved: 2,
          reorderLevel: 1,
          unitCost: 1,
        },
      });
      const { createTransfer, dispatchTransfer, finalizeTransfer, confirmReceipt } =
        await import("../../lib/server/services/stock-transfers");
      const stockActor = actor(fixture.users.stockStaff, fixture.locations.stockRoom);
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);

      const draft = await createTransfer(stockActor, {
        destinationId: fixture.locations.branches.QC.id,
        lines: [{ productId: product.id, quantity: 5 }],
      });
      const finalized = await finalizeTransfer(stockActor, draft.id, draft.version);
      const dispatched = await dispatchTransfer(stockActor, finalized.id, finalized.version);

      expect(dispatched.status).toBe("IN_TRANSIT");
      expect(
        await prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_productId: {
              locationId: fixture.locations.stockRoom.id,
              productId: product.id,
            },
          },
        }),
      ).toMatchObject({ onHand: 5, reserved: 2 });
      expect(
        await prisma.inventoryBalance.findUnique({
          where: {
            locationId_productId: {
              locationId: fixture.locations.branches.QC.id,
              productId: product.id,
            },
          },
        }),
      ).toBeNull();

      const received = await confirmReceipt(branchActor, dispatched.id, dispatched.version);

      expect(received.status).toBe("RECEIVED");
      expect(
        await prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            locationId_productId: {
              locationId: fixture.locations.branches.QC.id,
              productId: product.id,
            },
          },
        }),
      ).toMatchObject({ onHand: 5 });
    });
  }, 30_000);
});

afterAll(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
