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
describe("a branch correcting the sale it encoded", () => {
  it("replaces the receipt, restores the stock, leaves it for Accounting, and refuses anything else", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "branch-correct" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "CORRECT-1", name: "Rollbar", price: 1000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 100 },
      });

      const { createDirectSale, reviewSale, respondToSaleMismatch, resolveSale } =
        await import("../../lib/server/services/customer-sales");

      const onHand = async () =>
        (await prisma.inventoryBalance.findUniqueOrThrow({
          where: { locationId_productId: { locationId: branch.id, productId: product.id } },
        })).onHand;

      const comparison = (receiptNumber: string, quantity: number, unitPrice: number) => ({
        receiptNumber,
        receiptBooklet: "",
        paymentMethod: "CASH" as const,
        discountAmount: 0,
        totalAmount: quantity * unitPrice,
        amountPaid: quantity * unitPrice,
        lines: [{ itemCode: "CORRECT-1", quantity, unitPrice }],
      });

      // Encoded as three, but only two were sold.
      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "CORRECT-001",
        paymentMethod: "CASH",
        amountPaid: 3000,
        lines: [{ productId: product.id, quantity: 3 }],
      });
      expect(await onHand()).toBe(7);

      await prisma.saleAccountingReview.update({
        where: { saleId: sale.id },
        data: { receiptPhotoKey: `${crypto.randomUUID()}.jpg`, receiptPhotoType: "image/jpeg" },
      });
      await reviewSale(owner, sale.id, {
        status: "MISMATCH_REPORTED",
        mismatchCategory: "QUANTITY_MISMATCH",
        notes: "Receipt says two, the system says three",
        comparison: comparison("CORRECT-001", 2, 1000),
      });

      // Confirming its own encoding correct is Accounting's call, not the branch's.
      await expect(
        resolveSale(owner, sale.id, { action: "CONFIRMED_CORRECT", note: "I am right" }, { branchCorrection: true }),
      ).rejects.toMatchObject({ code: "INVALID_RESOLUTION" });

      // Nor may it replace a sale it has not admitted encoding wrongly.
      await respondToSaleMismatch(owner, sale.id, {
        response: "ORIGINAL_ENCODING_CORRECT",
        note: "The receipt is wrong, not the system",
      });
      await expect(
        resolveSale(
          owner,
          sale.id,
          { action: "VOIDED_REPLACED", note: "Sneaking a change through", replacement: comparison("CORRECT-009", 1, 500) },
          { branchCorrection: true },
        ),
      ).rejects.toMatchObject({ code: "INVALID_RESOLUTION" });
      expect(await onHand()).toBe(7);

      // Admitting the mistake opens the correction.
      await respondToSaleMismatch(owner, sale.id, {
        response: "SALE_ENCODED_INCORRECT",
        note: "I keyed three by mistake",
      });
      await resolveSale(
        owner,
        sale.id,
        { action: "VOIDED_REPLACED", note: "Corrected to the two actually sold", replacement: comparison("CORRECT-002", 2, 1000) },
        { branchCorrection: true },
      );

      // Three went out, three came back, two went out again.
      expect(await onHand()).toBe(8);
      expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("VOIDED");

      const replacement = await prisma.sale.findFirstOrThrow({
        where: { manualReceiptNumber: "CORRECT-002" },
        include: { lines: true, accountingReview: true },
      });
      expect(replacement.status).toBe("POSTED");
      expect(replacement.totalAmount.toNumber()).toBe(2000);
      expect(replacement.lines[0].quantity).toBe(2);
      // Back to Accounting: a branch does not verify its own correction.
      expect(replacement.accountingReview?.status).toBe("UNVERIFIED");
    });
  }, 120_000);
});
