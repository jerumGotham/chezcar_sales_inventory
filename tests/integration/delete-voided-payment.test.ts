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

describe("deleting a voided payment receipt", () => {
  it("refuses an active payment, and frees the receipt number once voided", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "delete-voided-payment" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "DELPAY-1", name: "Winch", price: 1000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 100 },
      });

      const { createCustomerOrder } = await import("../../lib/server/services/customer-sales");
      const { reviewPayment, respondToPaymentMismatch, resolvePaymentMismatch, deleteVoidedPayment } =
        await import("../../lib/server/services/payments");

      const order = await createCustomerOrder(owner, {
        customer: { name: "Delete Payment Customer" },
        type: "RESERVATION_WITH_DP",
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        downpaymentAmount: 500,
        downpaymentReceiptNumber: "DELPAY-OR-1",
        lines: [{ productId: product.id, quantity: 1 }],
      });
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });

      // The number is taken the moment the downpayment is recorded.
      expect(
        await prisma.manualReceipt.count({ where: { number: "DELPAY-OR-1", locationId: branch.id } }),
      ).toBe(1);

      // An active payment is not deletable: only voiding gives the money back.
      await expect(deleteVoidedPayment(owner, payment.id)).rejects.toMatchObject({
        code: "INVALID_STATUS",
      });

      // Accounting cannot review a receipt it cannot see, so stand a photo up.
      await prisma.payment.update({
        where: { id: payment.id },
        data: { receiptPhotoKey: "test/delpay-or-1.jpg", receiptPhotoType: "image/jpeg", evidenceUploadedAt: new Date() },
      });
      await reviewPayment(owner, payment.id, {
        status: "MISMATCH_REPORTED",
        mismatchCategory: "AMOUNT_MISMATCH",
        notes: "The amount keyed does not match the receipt",
      });
      await respondToPaymentMismatch(owner, payment.id, {
        response: "PAYMENT_ENCODED_INCORRECTLY",
        note: "We keyed the wrong amount; the paper receipt is correct",
      });
      await resolvePaymentMismatch(owner, payment.id, {
        action: "VOIDED",
        note: "Voided so the branch can record it again",
      });

      const voided = await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
      const balanceAfterVoid = voided.remainingBalance.toNumber();

      const result = await deleteVoidedPayment(owner, payment.id);
      expect(result).toMatchObject({ deleted: true, receiptNumber: "DELPAY-OR-1", receiptFreed: true });

      const afterDeleteOrder = await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
      // The row is gone and, with it, the claim on the receipt number.
      expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toBeNull();
      expect(
        await prisma.manualReceipt.count({ where: { number: "DELPAY-OR-1", locationId: branch.id } }),
      ).toBe(0);
      // The order carries the number in a unique column of its own; a branch
      // cannot write that receipt again while this still holds it.
      expect(afterDeleteOrder.downpaymentReceiptNumber).toBeNull();

      // Deleting moves no money: voiding already put it back on the balance.
      expect(afterDeleteOrder.remainingBalance.toNumber()).toBe(balanceAfterVoid);

      // The point of the whole exercise: the branch can write that paper
      // receipt again under the number actually printed on it.
      const reorder = await createCustomerOrder(owner, {
        customer: { name: "Delete Payment Customer" },
        type: "RESERVATION_WITH_DP",
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        downpaymentAmount: 500,
        downpaymentReceiptNumber: "DELPAY-OR-1",
        lines: [{ productId: product.id, quantity: 1 }],
      });
      expect(reorder.id).toBeTruthy();

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: "Voided Payment Deleted" },
        orderBy: { occurredAt: "desc" },
      });
      expect(entry.reference).toBe("DELPAY-OR-1");

      /*
       * The other half of the guard: a receipt that settles a sale is deleted
       * with that sale, never on its own, or the sale's money would be
       * recorded nowhere.
       */
      const { createDirectSale } = await import("../../lib/server/services/customer-sales");
      const saleProduct = await prisma.product.create({
        data: { itemCode: "DELPAY-2", name: "Roof Rack", price: 1000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: saleProduct.id, onHand: 10, unitCost: 100 },
      });
      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "DELPAY-SALE-1",
        paymentMethod: "CASH",
        amountPaid: 1000,
        lines: [{ productId: saleProduct.id, quantity: 1 }],
      });
      const salePayment = await prisma.payment.findFirstOrThrow({ where: { saleId: sale.id } });
      // Voided straight in the table: the guard under test is the sale link,
      // not the route that voided it.
      await prisma.payment.update({ where: { id: salePayment.id }, data: { status: "VOIDED" } });
      await expect(deleteVoidedPayment(owner, salePayment.id)).rejects.toMatchObject({
        code: "PAYMENT_IN_USE",
      });
    });
  });
});
