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

describe("removing a voided sale from a deployed database", () => {
  it("refuses a posted sale, and clears a voided one with everything hanging off it", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "delete-voided" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "VOIDME-1", name: "Light Bar", price: 1000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 100 },
      });

      const { createDirectSale, reviewSale, respondToSaleMismatch, resolveSale } =
        await import("../../lib/server/services/customer-sales");
      const { deleteVoidedSale } = await import("../../prisma/delete-voided-sale.mjs");

      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "2738",
        paymentMethod: "CASH",
        amountPaid: 1000,
        lines: [{ productId: product.id, quantity: 1 }],
      });

      // A posted sale is live money and is refused outright.
      await expect(deleteVoidedSale(prisma, "2738", { apply: true })).resolves.toMatchObject({
        found: true,
        deleted: false,
        refused: expect.stringContaining("POSTED"),
      });
      expect(await prisma.sale.count({ where: { id: sale.id } })).toBe(1);

      await prisma.saleAccountingReview.update({
        where: { saleId: sale.id },
        data: { receiptPhotoKey: `${crypto.randomUUID()}.jpg`, receiptPhotoType: "image/jpeg" },
      });
      await reviewSale(owner, sale.id, {
        status: "MISMATCH_REPORTED",
        mismatchCategory: "RECEIPT_NOT_FOUND",
        notes: "No paper receipt for this at all",
        comparison: {
          receiptNumber: "2738",
          receiptBooklet: "",
          paymentMethod: "CASH",
          discountAmount: 0,
          totalAmount: 1000,
          amountPaid: 1000,
          lines: [{ itemCode: "VOIDME-1", quantity: 1, unitPrice: 1000 }],
        },
      });
      await respondToSaleMismatch(owner, sale.id, {
        response: "SALE_ENCODED_INCORRECT",
        note: "This receipt should never have been encoded",
      });
      await resolveSale(owner, sale.id, { action: "VOIDED", note: "Encoded in error" });

      // Reporting first changes nothing.
      await expect(deleteVoidedSale(prisma, "2738")).resolves.toMatchObject({
        found: true,
        wouldDelete: true,
        deleted: false,
      });
      expect(await prisma.sale.count({ where: { id: sale.id } })).toBe(1);

      const removed = await deleteVoidedSale(prisma, "2738", { apply: true });
      expect(removed).toMatchObject({ deleted: true });

      // The sale and everything that pointed at it are gone.
      expect(await prisma.sale.count({ where: { id: sale.id } })).toBe(0);
      expect(await prisma.saleLine.count({ where: { saleId: sale.id } })).toBe(0);
      expect(await prisma.payment.count({ where: { saleId: sale.id } })).toBe(0);
      expect(await prisma.saleAccountingReview.count({ where: { saleId: sale.id } })).toBe(0);
      // The number is free again, which it would not be if the registry kept it.
      expect(await prisma.manualReceipt.count({ where: { saleId: sale.id } })).toBe(0);

      // Voiding already put the stock back; deleting the record leaves it there.
      expect((await prisma.inventoryBalance.findUniqueOrThrow({
        where: { locationId_productId: { locationId: branch.id, productId: product.id } },
      })).onHand).toBe(10);

      await expect(deleteVoidedSale(prisma, "2738")).resolves.toMatchObject({ found: false });

      /*
       * A sale that was voided *and replaced* is a different case: the
       * replacement is live and records this one as what it corrected.
       */
      const replaced = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "2739",
        paymentMethod: "CASH",
        amountPaid: 2000,
        lines: [{ productId: product.id, quantity: 2 }],
      });
      await prisma.saleAccountingReview.update({
        where: { saleId: replaced.id },
        data: { receiptPhotoKey: `${crypto.randomUUID()}.jpg`, receiptPhotoType: "image/jpeg" },
      });
      await reviewSale(owner, replaced.id, {
        status: "MISMATCH_REPORTED",
        mismatchCategory: "QUANTITY_MISMATCH",
        notes: "Receipt says one, the system says two",
        comparison: {
          receiptNumber: "2739",
          receiptBooklet: "",
          paymentMethod: "CASH",
          discountAmount: 0,
          totalAmount: 1000,
          amountPaid: 1000,
          lines: [{ itemCode: "VOIDME-1", quantity: 1, unitPrice: 1000 }],
        },
      });
      await respondToSaleMismatch(owner, replaced.id, {
        response: "RECEIPT_CORRECTION_NEEDED",
        replacementReceiptNumber: "2740",
        note: "Rewriting the receipt",
      });
      await resolveSale(owner, replaced.id, {
        action: "VOIDED_REPLACED",
        note: "Corrected to the one actually sold",
        replacement: {
          receiptNumber: "2740",
          receiptBooklet: "",
          paymentMethod: "CASH",
          discountAmount: 0,
          totalAmount: 1000,
          amountPaid: 1000,
          lines: [{ itemCode: "VOIDME-1", quantity: 1, unitPrice: 1000 }],
        },
      });

      const refusedReplaced = await deleteVoidedSale(prisma, "2739", { apply: true });
      expect(refusedReplaced).toMatchObject({ found: true, deleted: false });
      expect(refusedReplaced.refused).toContain("2740");
      expect(await prisma.sale.count({ where: { id: replaced.id } })).toBe(1);

      /*
       * The same removal offered in Receipt Verification, which is the path a
       * branch actually uses after a sale was voided and has to be encoded
       * again. It carries the authorisation the script does not.
       */
      const { deleteVoidedSale: deleteThroughTheApp } =
        await import("../../lib/server/services/customer-sales");

      const encoded = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "2750",
        paymentMethod: "CASH",
        amountPaid: 1_000,
        lines: [{ productId: product.id, quantity: 1 }],
      });

      // A posted sale is live money: void it first.
      await expect(deleteThroughTheApp(owner, encoded.id))
        .rejects.toMatchObject({ code: "INVALID_STATUS" });

      await prisma.saleAccountingReview.update({
        where: { saleId: encoded.id },
        data: { receiptPhotoKey: `${crypto.randomUUID()}.jpg`, receiptPhotoType: "image/jpeg" },
      });
      await reviewSale(owner, encoded.id, {
        status: "MISMATCH_REPORTED",
        mismatchCategory: "RECEIPT_NOT_FOUND",
        notes: "Encoded in error",
        comparison: {
          receiptNumber: "2750",
          receiptBooklet: "",
          paymentMethod: "CASH",
          discountAmount: 0,
          totalAmount: 1_000,
          amountPaid: 1_000,
          lines: [{ itemCode: "VOIDME-1", quantity: 1, unitPrice: 1_000 }],
        },
      });
      await respondToSaleMismatch(owner, encoded.id, {
        response: "SALE_ENCODED_INCORRECT",
        note: "Should never have been encoded",
      });
      await resolveSale(owner, encoded.id, { action: "VOIDED", note: "Encoded in error" });

      const removedThroughTheApp = await deleteThroughTheApp(owner, encoded.id);
      expect(removedThroughTheApp).toMatchObject({ deleted: true, manualReceiptNumber: "2750" });
      expect(await prisma.sale.count({ where: { id: encoded.id } })).toBe(0);
      // The number is free again, which is the point of removing the record.
      expect(await prisma.manualReceipt.count({ where: { number: "2750" } })).toBe(0);
      // Deleting a sale is itself a business action and is recorded.
      expect(await prisma.auditLog.count({
        where: { action: "Voided Sale Deleted", reference: "2750" },
      })).toBe(1);

      // A stock clerk cannot remove a sale.
      await expect(
        deleteThroughTheApp(actor(fixture.users.stockStaff, branch), replaced.id),
      ).rejects.toThrow(/permission/i);
    });
  }, 120_000);
});
