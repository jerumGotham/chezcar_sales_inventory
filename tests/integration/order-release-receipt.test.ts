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
describe("releasing a customer order", () => {
  it("asks for a receipt only when the release collects money, and still moves the goods when it does not", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "release-receipt" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "REL-1", name: "Roof Rack", price: 1_000, status: "ACTIVE", warrantyDurationMonths: 12 },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 20, unitCost: 100 },
      });

      const { createCustomerOrder, recordCustomerOrderPayment, releaseCustomerOrder } =
        await import("../../lib/server/services/customer-sales");

      const balanceFor = () =>
        prisma.inventoryBalance.findUniqueOrThrow({
          where: { locationId_productId: { locationId: branch.id, productId: product.id } },
        });

      const newOrder = (receipt: string, downpayment: number) =>
        createCustomerOrder(owner, {
          customer: { name: "Release Customer" },
          type: "RESERVATION_WITH_DP",
          locationId: branch.id,
          salespersonId: fixture.salespersons.QC.id,
          downpaymentAmount: downpayment,
          downpaymentReceiptNumber: receipt,
          lines: [{ productId: product.id, quantity: 2 }],
        });

      // ---- An order with a balance still behaves exactly as it did ----
      const owing = await newOrder("REL-DP-1", 500);
      await expect(
        releaseCustomerOrder(owner, owing.id, { finalReceiptNumber: "REL-FINAL-1", paymentMethod: "CASH", amountPaid: 1_500 }),
      ).resolves.toBeTruthy();
      const owingSale = await prisma.sale.findFirstOrThrow({ where: { orderId: owing.id }, include: { accountingReview: true } });
      expect(owingSale.manualReceiptNumber).toBe("REL-FINAL-1");
      expect(owingSale.receiptIssued).toBe(true);
      // Money collected at the counter is Accounting's to verify against paper.
      expect(owingSale.accountingReview?.status).toBe("UNVERIFIED");
      expect(await prisma.manualReceipt.count({ where: { number: "REL-FINAL-1" } })).toBe(1);
      expect((await balanceFor()).onHand).toBe(18);

      // ---- An order paid in full issues no receipt ----
      const settled = await newOrder("REL-DP-2", 500);
      await recordCustomerOrderPayment(owner, settled.id, { amount: 1_500, reference: "REL-PAY-2", method: "CASH" });
      expect((await prisma.customerOrder.findUniqueOrThrow({ where: { id: settled.id } })).remainingBalance.toNumber()).toBe(0);

      // Offering one is refused: there is no money for it to record.
      await expect(
        releaseCustomerOrder(owner, settled.id, { finalReceiptNumber: "REL-FINAL-2", paymentMethod: "CASH", amountPaid: 0 }),
      ).rejects.toMatchObject({ code: "RECEIPT_NOT_EXPECTED" });

      const beforeRelease = await balanceFor();
      await releaseCustomerOrder(owner, settled.id, { paymentMethod: "CASH", amountPaid: 0 });

      const sale = await prisma.sale.findFirstOrThrow({
        where: { orderId: settled.id },
        include: { accountingReview: true, lines: true },
      });
      // The sale exists, because the goods moved and the warranty starts.
      expect(sale.receiptIssued).toBe(false);
      expect(sale.manualReceiptNumber).toBe(settled.orderNo);
      expect(sale.lines[0].warrantyDurationMonths).toBe(12);
      // Nothing to compare against paper, so it never joins Accounting's queue.
      expect(sale.accountingReview?.status).toBe("VERIFIED");
      // The branch receipt book records handwritten numbers only.
      expect(await prisma.manualReceipt.count({ where: { number: settled.orderNo } })).toBe(0);

      // The ledger row carries the units into the report, settled and at zero.
      const payment = await prisma.payment.findFirstOrThrow({ where: { saleId: sale.id } });
      expect(payment.kind).toBe("ORDER_FINAL");
      expect(payment.amount.toNumber()).toBe(0);
      expect(payment.reviewStatus).toBe("VERIFIED");

      // The goods left the branch and the reservation went with them.
      const afterRelease = await balanceFor();
      expect(afterRelease.onHand).toBe(beforeRelease.onHand - 2);
      expect(afterRelease.reserved).toBe(beforeRelease.reserved - 2);
      expect(await prisma.inventoryMovement.count({
        where: { type: "CUSTOMER_ORDER_RELEASE", reference: settled.orderNo },
      })).toBe(1);

      const completed = await prisma.customerOrder.findUniqueOrThrow({ where: { id: settled.id } });
      expect(completed.status).toBe("COMPLETED");
      // No receipt was issued, so the order records none.
      expect(completed.finalReceiptNumber).toBeNull();

      // ---- A release that does collect money cannot skip the receipt ----
      const owingAgain = await newOrder("REL-DP-3", 500);
      await expect(
        releaseCustomerOrder(owner, owingAgain.id, { paymentMethod: "CASH", amountPaid: 1_500 }),
      ).rejects.toMatchObject({ code: "RECEIPT_REQUIRED" });
      // Refused means refused: the stock is untouched.
      expect((await balanceFor()).onHand).toBe(afterRelease.onHand);
    });
  }, 180_000);
});
