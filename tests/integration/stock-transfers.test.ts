import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

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
  it("lets Admin cover SR dispatch and moves stock only after exact receipt", async () => {
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
          unitCost: 1,
        },
      });
      const { createTransfer, dispatchTransfer, finalizeTransfer, confirmReceipt, listTransfers } =
        await import("../../lib/server/services/stock-transfers");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);
      const adminActor = actor(fixture.users.admin, null);

      const draft = await createTransfer(adminActor, {
        destinationId: fixture.locations.branches.QC.id,
        lines: [{ productId: product.id, quantity: 5 }],
      });
      await expect(
        listTransfers(adminActor, { page: 1, pageSize: 1 }),
      ).resolves.toMatchObject({
        data: [{ id: draft.id }],
        meta: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
      });
      await expect(
        listTransfers(branchActor, {
          page: 1,
          pageSize: 10,
          transferId: draft.id,
        }),
      ).resolves.toMatchObject({ data: [{ id: draft.id }] });
      const finalized = await finalizeTransfer(adminActor, draft.id, draft.version);
      const dispatched = await dispatchTransfer(adminActor, finalized.id, finalized.version);

      expect(dispatched.status).toBe("IN_TRANSIT");
      await expect(
        prisma.notification.findMany({
          where: {
            userId: fixture.users.branchStaff.id,
            relatedId: draft.id,
            title: "Transfer ready for receiving",
          },
        }),
      ).resolves.toHaveLength(1);
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
      await expect(
        prisma.notification.findMany({
          where: {
            userId: fixture.users.stockStaff.id,
            relatedId: draft.id,
            title: "Transfer receipt confirmed",
          },
        }),
      ).resolves.toHaveLength(1);
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

  it("persists discrepancy notifications and per-user read state", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "stock-transfer-discrepancy",
      });
      const product = await prisma.product.create({
        data: { itemCode: "DISCREPANCY-ITEM", name: "Discrepancy Item", status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: {
          locationId: fixture.locations.stockRoom.id,
          productId: product.id,
          onHand: 10,
          unitCost: 1,
        },
      });
      const {
        createTransfer,
        dispatchTransfer,
        finalizeTransfer,
        reportDiscrepancy,
        resolveTransfer,
        submitInvestigation,
      } = await import("../../lib/server/services/stock-transfers");
      const { listNotifications, markNotificationRead } = await import("../../lib/server/services/notifications");
      const stockActor = actor(fixture.users.stockStaff, fixture.locations.stockRoom);
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);
      const adminActor = actor(fixture.users.admin, null);

      const draft = await createTransfer(stockActor, {
        destinationId: fixture.locations.branches.QC.id,
        lines: [{ productId: product.id, quantity: 5 }],
      });
      const finalized = await finalizeTransfer(stockActor, draft.id, draft.version);
      const dispatched = await dispatchTransfer(stockActor, finalized.id, finalized.version);
      const reported = await reportDiscrepancy(branchActor, dispatched.id, {
        version: dispatched.version,
        notes: "One missing",
        lines: [{ lineId: dispatched.lines[0].id, actualQuantity: 4, reason: "Items missing" }],
      });

      await expect(listNotifications(stockActor)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: "Discrepancy needs investigation", read: false, relatedId: draft.id }),
        ]),
      );

      const investigated = await submitInvestigation(adminActor, reported.id, {
        version: reported.version,
        findings: "Packing count confirmed one missing.",
      });
      const adminNotifications = await listNotifications(adminActor);
      const approvalNotice = adminNotifications.find((notification) => notification.title === "Discrepancy ready for approval");

      expect(approvalNotice).toBeDefined();
      expect(approvalNotice?.read).toBe(false);

      const readNotice = await markNotificationRead(adminActor, approvalNotice!.id);

      expect(readNotice.read).toBe(true);
      await expect(markNotificationRead(branchActor, approvalNotice!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

      await resolveTransfer(adminActor, investigated.id, {
        version: investigated.version,
        notes: "Approved shortage write-off.",
        lines: [{ lineId: investigated.lines[0].id, destinationQuantity: 4, restoreToSrQuantity: 0, lossQuantity: 1 }],
      });

      const replacement = await createTransfer(adminActor, {
        destinationId: fixture.locations.branches.QC.id,
        replacementForTransferId: draft.id,
        lines: [{ productId: product.id, quantity: 1 }],
      });

      expect(replacement.status).toBe("DRAFT");

      await expect(listNotifications(branchActor)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: "Transfer discrepancy resolved", read: false, relatedId: draft.id }),
        ]),
      );
      await expect(listNotifications(stockActor)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: "Replacement transfer draft created", read: false, relatedId: replacement.id }),
        ]),
      );
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
