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

describe("Accounting correcting a wrongly encoded sale itself", () => {
  it("keeps the receipt number, carries the photo over, verifies, and never waits for the branch", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "accounting-correction" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const sold = await prisma.product.create({
        data: { itemCode: "ACORR-1", name: "Light Bar", price: 1000, status: "ACTIVE" },
      });
      const actuallySold = await prisma.product.create({
        data: { itemCode: "ACORR-2", name: "Snorkel", price: 2500, status: "ACTIVE" },
      });
      for (const product of [sold, actuallySold]) {
        await prisma.inventoryBalance.create({
          data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 100 },
        });
      }

      const { createDirectSale, reviewSale, correctEncodedSale } =
        await import("../../lib/server/services/customer-sales");

      // Keyed wrongly: one Light Bar, when the receipt says two Snorkels.
      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "ACORR-OR-1",
        paymentMethod: "CASH",
        amountPaid: 1000,
        lines: [{ productId: sold.id, quantity: 1 }],
      });

      const paperSays = {
        receiptBooklet: "",
        receiptNumber: "ACORR-OR-1",
        paymentMethod: "CASH" as const,
        discountAmount: 0,
        amountPaid: 5000,
        totalAmount: 5000,
        lines: [{ itemCode: "ACORR-2", quantity: 2, unitPrice: 2500 }],
      };

      // Nothing is open to correction until Accounting has put on record that
      // the sale does not match the paper.
      await expect(
        correctEncodedSale(owner, sale.id, { action: "VOIDED_REPLACED", note: "n/a", replacement: paperSays }),
      ).rejects.toMatchObject({ code: "INVALID_STATE" });

      const photo = { receiptPhotoKey: "test/acorr.jpg", receiptPhotoType: "image/jpeg", evidenceUploadedAt: new Date() };
      await prisma.saleAccountingReview.updateMany({ where: { saleId: sale.id }, data: photo });

      await reviewSale(owner, sale.id, {
        status: "MISMATCH_REPORTED",
        mismatchCategory: "ITEM_MISMATCH",
        notes: "The receipt lists two snorkels, not a light bar",
        comparison: paperSays,
      });

      // No branch response is recorded, and none is waited for.
      const beforeFix = await prisma.saleAccountingReview.findFirstOrThrow({ where: { saleId: sale.id } });
      expect(beforeFix.branchResponse).toBeNull();

      // A sale is never verified without a photo, and this step verifies, so
      // it is refused outright while there is none -- even for the owner.
      await prisma.saleAccountingReview.updateMany({
        where: { saleId: sale.id },
        data: { receiptPhotoKey: null },
      });
      await expect(
        correctEncodedSale(owner, sale.id, { action: "VOIDED_REPLACED", note: "n/a", replacement: paperSays }),
      ).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
      await prisma.saleAccountingReview.updateMany({ where: { saleId: sale.id }, data: photo });

      const result = await correctEncodedSale(owner, sale.id, {
        action: "VOIDED_REPLACED",
        note: "Receipt is right; the encoding was wrong",
        replacement: paperSays,
      });
      expect(result.action).toBe("ENCODING_CORRECTED");

      // One sale throughout: it is put right, not superseded, so there is no
      // second row competing for the same receipt number.
      expect(await prisma.sale.count({ where: { correctionOfId: sale.id } })).toBe(0);
      const fixed = await prisma.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { lines: true, accountingReview: true },
      });
      expect(fixed.status).toBe("POSTED");
      // The whole point: the paper keeps its number, so the sale keeps it too.
      expect(fixed.manualReceiptNumber).toBe("ACORR-OR-1");
      expect(fixed.totalAmount.toNumber()).toBe(5000);
      expect(fixed.lines).toHaveLength(1);
      expect(fixed.lines[0]).toMatchObject({ productItemCode: "ACORR-2", quantity: 2 });

      // Verified on the strength of the photo already attached, not on nothing.
      expect(fixed.accountingReview?.status).toBe("VERIFIED");
      expect(fixed.accountingReview?.receiptPhotoKey).toBe("test/acorr.jpg");
      expect(fixed.accountingReview?.verifiedAt).not.toBeNull();

      // Stock followed: the light bar came back, the snorkels went out.
      const lightBar = await prisma.inventoryBalance.findFirstOrThrow({
        where: { locationId: branch.id, productId: sold.id },
      });
      const snorkel = await prisma.inventoryBalance.findFirstOrThrow({
        where: { locationId: branch.id, productId: actuallySold.id },
      });
      expect(lightBar.onHand).toBe(10);
      expect(snorkel.onHand).toBe(8);

      // The receipt really did collect the money and its number never moved,
      // so the ledger row is restated rather than voided and rewritten.
      const payments = await prisma.payment.findMany({ where: { saleId: sale.id } });
      expect(payments).toHaveLength(1);
      expect(payments[0].status).toBe("ACTIVE");
      expect(payments[0].amount.toNumber()).toBe(5000);
      expect(payments[0].reviewStatus).toBe("VERIFIED");

      // What it used to say survives only here.
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: "Sale Encoding Corrected" },
        orderBy: { occurredAt: "desc" },
      });
      expect(entry.reference).toBe("ACORR-OR-1");
    });
  });
});
