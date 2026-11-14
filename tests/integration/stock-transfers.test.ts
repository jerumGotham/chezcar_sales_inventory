import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});

void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

function actor(
  user: Parameters<typeof authContextFor>[0],
  location: Parameters<typeof authContextFor>[1],
): AuthContext {
  return authContextFor(user, location);
}

/**
 * The Manila calendar day an instant falls on, which is the day the list
 * filters speak in. Computed here rather than imported so the test states the
 * expected day itself instead of agreeing with the code under test.
 */
function manilaDay(value: string) {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
}

describe("stock transfer posting", () => {
  it("keeps source-side transfer reach separate from destination business data", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "transfer-source-boundary",
      });
      const product = await prisma.product.create({
        data: { itemCode: "SOURCE-BOUNDARY", name: "Source Boundary", status: "ACTIVE" },
      });
      await prisma.inventoryBalance.createMany({
        data: [
          { locationId: fixture.locations.branches.SP.id, productId: product.id, onHand: 10 },
          { locationId: fixture.locations.branches.LU.id, productId: product.id, onHand: 4 },
        ],
      });
      await prisma.sale.create({
        data: {
          reference: "SOURCE-BOUNDARY-SALE",
          manualReceiptNumber: "SOURCE-BOUNDARY-SALE",
          locationId: fixture.locations.branches.LU.id,
          paymentMethod: "CASH",
          totalAmount: 10,
          amountPaid: 10,
          postedById: fixture.users.branchStaff.id,
          lines: {
            create: {
              productId: product.id,
              productItemCode: product.itemCode,
              productName: product.name,
              quantity: 1,
              unitPrice: 10,
            },
          },
        },
      });
      const {
        canAccessTransferRecord,
        createTransfer,
        listTransfers,
      } = await import("../../lib/server/services/stock-transfers");
      const { inventoryListQuerySchema, listInventory } = await import(
        "../../lib/server/catalog"
      );
      const { listSales } = await import("../../lib/server/services/customer-sales");
      const stockActor = actor(fixture.users.stockStaff, fixture.locations.branches.SP);
      const qcActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);

      const qcTransfer = await createTransfer(stockActor, {
        destinationId: fixture.locations.branches.QC.id,
        lines: [{ productId: product.id, quantity: 1 }],
      });
      const luTransfer = await createTransfer(stockActor, {
        destinationId: fixture.locations.branches.LU.id,
        lines: [{ productId: product.id, quantity: 1 }],
      });

      expect(
        canAccessTransferRecord(
          stockActor,
          fixture.locations.branches.SP.id,
          fixture.locations.branches.LU.id,
        ),
      ).toBe(true);
      await expect(listTransfers(stockActor)).resolves.toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ id: qcTransfer.id }),
          expect.objectContaining({ id: luTransfer.id }),
        ]),
      });
      await expect(listTransfers(qcActor)).resolves.toMatchObject({
        data: [expect.objectContaining({ id: qcTransfer.id })],
      });
      await expect(
        listInventory(
          inventoryListQuerySchema.parse({ location: "LU" }),
          stockActor,
        ),
      ).rejects.toThrow(/Invalid inventory location scope/i);
      await expect(listSales(stockActor)).resolves.toEqual([]);
    });
  }, 30_000);

  it("moves stock branch to branch and refuses a source the actor does not hold", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "branch-to-branch" });
      const product = await prisma.product.create({ data: { itemCode: "B2B-ITEM", name: "Branch To Branch", status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 10, unitCost: 5 } });
      const { createTransfer, finalizeTransfer, dispatchTransfer, confirmReceipt } =
        await import("../../lib/server/services/stock-transfers");
      // Stock Staff scoped to Quezon City stands in for a branch sender.
      const qcSender = actor(fixture.users.stockStaff, fixture.locations.branches.QC);

      const draft = await createTransfer(qcSender, {
        destinationId: fixture.locations.branches.BL.id,
        lines: [{ productId: product.id, quantity: 4 }],
      });
      expect(draft).toMatchObject({
        source: { code: fixture.locations.branches.QC.code },
        destination: { code: fixture.locations.branches.BL.code },
      });

      // A source the sender does not hold is refused even when named explicitly.
      await expect(createTransfer(qcSender, {
        sourceId: fixture.locations.branches.LU.id,
        destinationId: fixture.locations.branches.BL.id,
        lines: [{ productId: product.id, quantity: 1 }],
      })).rejects.toMatchObject({ code: "FORBIDDEN" });

      // Nor can a transfer loop back to where it started.
      await expect(createTransfer(qcSender, {
        destinationId: fixture.locations.branches.QC.id,
        lines: [{ productId: product.id, quantity: 1 }],
      })).rejects.toMatchObject({ code: "INVALID_DESTINATION" });

      const finalized = await finalizeTransfer(qcSender, draft.id, draft.version);
      const dispatched = await dispatchTransfer(qcSender, draft.id, finalized.version);
      expect(dispatched.status).toBe("IN_TRANSIT");
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: product.id } } })).toMatchObject({ onHand: 6 });
      expect(await prisma.inventoryMovement.findFirst({ where: { transferId: draft.id, type: "TRANSFER_DISPATCH" } })).toMatchObject({ locationId: fixture.locations.branches.QC.id, quantity: -4 });

      const blReceiver = actor(fixture.users.branchStaff, fixture.locations.branches.BL);
      const received = await confirmReceipt(blReceiver, draft.id, dispatched.version);
      expect(received.status).toBe("RECEIVED");
      expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.BL.id, productId: product.id } } })).toMatchObject({ onHand: 4 });
    });
  }, 30_000);

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
          locationId: fixture.locations.branches.SP.id,
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
        sourceId: fixture.locations.branches.SP.id,
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
      // A draft has not gone anywhere, so neither date is set yet.
      expect(draft).toMatchObject({ dispatchedAt: null, deliveredAt: null });
      // And so no dispatch range can answer with it, however wide.
      await expect(
        listTransfers(adminActor, {
          page: 1,
          pageSize: 10,
          dispatchedFrom: "2020-01-01",
          dispatchedTo: "2099-12-31",
        }),
      ).resolves.toMatchObject({ data: [], meta: { total: 0 } });
      const finalized = await finalizeTransfer(adminActor, draft.id, draft.version);
      const dispatched = await dispatchTransfer(adminActor, finalized.id, finalized.version, "DR-4417");

      expect(dispatched.status).toBe("IN_TRANSIT");
      // Gone out but not arrived: a dispatch date and no delivery date.
      expect(dispatched.dispatchedAt).toEqual(expect.any(String));
      expect(dispatched).toMatchObject({ deliveredAt: null, dispatchReceiptNumber: "DR-4417" });
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
              locationId: fixture.locations.branches.SP.id,
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
      expect(received.deliveredAt).toEqual(expect.any(String));
      expect(received.dispatchedAt).toBe(dispatched.dispatchedAt);
      // The list reads the same row, so the new columns are populated there too.
      await expect(
        listTransfers(adminActor, { page: 1, pageSize: 10, transferId: draft.id }),
      ).resolves.toMatchObject({
        data: [{ deliveredAt: received.deliveredAt, dispatchedAt: received.dispatchedAt, dispatchReceiptNumber: "DR-4417" }],
      });
      const { exportTransfers } = await import("../../lib/server/services/stock-transfers");
      const dispatchDay = manilaDay(received.dispatchedAt!);
      const deliveryDay = manilaDay(received.deliveredAt!);
      // A single day given as both ends is inclusive, so it finds that day.
      await expect(
        listTransfers(adminActor, { page: 1, pageSize: 10, dispatchedFrom: dispatchDay, dispatchedTo: dispatchDay }),
      ).resolves.toMatchObject({ data: [{ id: draft.id }], meta: { total: 1 } });
      await expect(
        listTransfers(adminActor, { page: 1, pageSize: 10, deliveredFrom: deliveryDay, deliveredTo: deliveryDay }),
      ).resolves.toMatchObject({ data: [{ id: draft.id }], meta: { total: 1 } });
      // An open end bounds one side only.
      await expect(
        listTransfers(adminActor, { page: 1, pageSize: 10, dispatchedFrom: dispatchDay }),
      ).resolves.toMatchObject({ data: [{ id: draft.id }], meta: { total: 1 } });
      // A range that ends before the dispatch excludes it rather than
      // rounding into it, which is what the `lt` next-midnight bound buys.
      await expect(
        listTransfers(adminActor, { page: 1, pageSize: 10, dispatchedTo: "2020-01-01" }),
      ).resolves.toMatchObject({ data: [], meta: { total: 0 } });
      await expect(
        listTransfers(adminActor, { page: 1, pageSize: 10, deliveredFrom: "2099-01-01" }),
      ).resolves.toMatchObject({ data: [], meta: { total: 0 } });
      // The two ranges narrow together rather than either one winning.
      await expect(
        listTransfers(adminActor, {
          page: 1,
          pageSize: 10,
          dispatchedFrom: dispatchDay,
          deliveredFrom: "2099-01-01",
        }),
      ).resolves.toMatchObject({ data: [], meta: { total: 0 } });
      /*
       * The export has to answer the same filters as the table, because it is
       * sold to the user as a copy of it. A sheet selected differently from
       * the rows above it is worse than no sheet: it looks like the same
       * thing and quietly is not.
       */
      const exportedAll = await exportTransfers(adminActor, {});
      expect(exportedAll.rows.map((row) => row.id)).toEqual([draft.id]);
      expect(exportedAll.truncated).toBe(false);
      const exportedByDay = await exportTransfers(adminActor, {
        dispatchedFrom: dispatchDay,
        dispatchedTo: dispatchDay,
      });
      expect(exportedByDay.rows.map((row) => row.id)).toEqual([draft.id]);
      // The filters are named on the sheet so a printed copy says what it is.
      expect(exportedByDay.appliedFilters).toEqual([
        { label: "Dispatched", value: `${dispatchDay} to ${dispatchDay}` },
      ]);
      const exportedMiss = await exportTransfers(adminActor, { dispatchedTo: "2020-01-01" });
      expect(exportedMiss.rows).toEqual([]);
      // An open end is stated as such rather than implying a bound.
      expect((await exportTransfers(adminActor, { deliveredFrom: deliveryDay })).appliedFilters).toEqual([
        { label: "Delivered", value: `${deliveryDay} to Any` },
      ]);
      // A source filter prints the branch, not the opaque id.
      expect(
        (await exportTransfers(adminActor, { sourceId: fixture.locations.branches.SP.id })).appliedFilters,
      ).toEqual([
        { label: "Source", value: `${fixture.locations.branches.SP.name} (${fixture.locations.branches.SP.code})` },
      ]);
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
          locationId: fixture.locations.branches.SP.id,
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
      const stockActor = actor(fixture.users.stockStaff, fixture.locations.branches.SP);
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

      /*
       * A short delivery never reaches confirmReceipt, so it never gets a
       * receivedAt. The goods did arrive, and the count that found them short
       * is when: without this fallback the row reads as never delivered while
       * its stock sits on the destination's shelf.
       */
      expect(reported.deliveredAt).toEqual(expect.any(String));
      expect(reported.dispatchedAt).toBe(dispatched.dispatchedAt);
      await expect(
        prisma.stockTransfer.findUniqueOrThrow({ where: { id: reported.id }, select: { receivedAt: true } }),
      ).resolves.toMatchObject({ receivedAt: null });
      /*
       * The delivery date filter has to follow that same fallback. Filtering
       * on receivedAt alone would answer nothing here, hiding a transfer the
       * list itself shows as delivered -- the branch would read the date on
       * screen, filter for that day, and be told it does not exist.
       */
      const { listTransfers } = await import("../../lib/server/services/stock-transfers");
      const shortDeliveryDay = manilaDay(reported.deliveredAt!);
      await expect(
        listTransfers(adminActor, {
          page: 1,
          pageSize: 10,
          deliveredFrom: shortDeliveryDay,
          deliveredTo: shortDeliveryDay,
        }),
      ).resolves.toMatchObject({ data: [{ id: reported.id }], meta: { total: 1 } });
      await expect(
        listTransfers(adminActor, { page: 1, pageSize: 10, deliveredTo: "2020-01-01" }),
      ).resolves.toMatchObject({ data: [], meta: { total: 0 } });

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
        sourceId: fixture.locations.branches.SP.id,
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
          expect.objectContaining({ title: "Discrepancy needs investigation", read: false, relatedId: draft.id }),
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
