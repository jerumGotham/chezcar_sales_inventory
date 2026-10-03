import type { AuthContext } from "@/lib/server/authorization";
import { describe, expect, it, vi } from "vitest";

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

/*
 * One database for the whole file. The services reach the database through a
 * module-level client, and a second disposable container would leave that
 * client holding connections to the first one, which is already gone.
 */
describe("asking the branch for a missing payment receipt photo", () => {
  it("notifies the branch and the administrators once, and refuses when there is nothing to chase", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "payment-nudge" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "NUDGE-1", name: "Snorkel", price: 1000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 100 },
      });

      const { createCustomerOrder } = await import("../../lib/server/services/customer-sales");
      const { notifyPaymentEvidencePending } = await import("../../lib/server/services/receipt-evidence-notifications");

      const order = await createCustomerOrder(owner, {
        customer: { name: "Nudge Customer" },
        type: "RESERVATION_WITH_DP",
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        downpaymentAmount: 500,
        downpaymentReceiptNumber: "NUDGE-DP-1",
        lines: [{ productId: product.id, quantity: 1 }],
      });
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(payment.receiptPhotoKey).toBeNull();

      const first = await notifyPaymentEvidencePending(owner, payment.id);
      expect(first).toMatchObject({ notified: true });

      const notifications = await prisma.notification.findMany({
        where: { relatedType: "PAYMENT", relatedId: payment.id },
        select: { userId: true, title: true, type: true, description: true },
      });
      expect(notifications.length).toBeGreaterThan(0);
      for (const notification of notifications) {
        expect(notification.title).toBe("Payment receipt photo needed");
        expect(notification.type).toBe("WARNING");
        expect(notification.description).toContain("NUDGE-DP-1");
      }
      // Whoever took the money, and the branch staff who can attach a photo.
      const told = new Set(notifications.map((notification) => notification.userId));
      expect(told.has(fixture.users.admin.id)).toBe(true);
      expect(told.has(fixture.users.branchStaff.id)).toBe(true);
      // Not the stock staff, who cannot attach one and do not run the branch.
      expect(told.has(fixture.users.stockStaff.id)).toBe(false);

      // Pressing it again says so rather than sending the same nudge twice.
      const second = await notifyPaymentEvidencePending(owner, payment.id);
      expect(second).toMatchObject({ notified: false });
      expect(await prisma.notification.count({ where: { relatedType: "PAYMENT", relatedId: payment.id } }))
        .toBe(notifications.length);

      // A receipt that already has its photo has nothing to chase.
      await prisma.payment.update({
        where: { id: payment.id },
        data: { receiptPhotoKey: `${crypto.randomUUID()}.jpg`, receiptPhotoType: "image/jpeg", evidencePendingNotifiedAt: null },
      });
      await expect(notifyPaymentEvidencePending(owner, payment.id)).rejects.toMatchObject({ code: "EVIDENCE_PRESENT" });

      // Confirming receipts is what carries the button; a stock clerk has no say.
      await expect(
        notifyPaymentEvidencePending(actor(fixture.users.stockStaff, branch), payment.id),
      ).rejects.toThrow(/permission/i);
    });
  }, 120_000);
});
