import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

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

describe("The note a reviewer writes on Receipt Verification", () => {
  it("is kept when the receipt is confirmed correct, not only when a mismatch is reported", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "review-notes" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "RNOTE-1", name: "Roof Rack", price: 1000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 100 },
      });

      const { createDirectSale, reviewSale } = await import("../../lib/server/services/customer-sales");

      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "RNOTE-OR-1",
        paymentMethod: "CASH",
        amountPaid: 1000,
        lines: [{ productId: product.id, quantity: 1 }],
      });

      // A sale is never reviewed without the photo of the paper receipt.
      await prisma.saleAccountingReview.updateMany({
        where: { saleId: sale.id },
        data: { receiptPhotoKey: "test/rnote.jpg", receiptPhotoType: "image/jpeg", evidenceUploadedAt: new Date() },
      });

      // What the reader wrote down off the paper: the same sale, nothing differs.
      const paperSays = {
        receiptBooklet: "",
        receiptNumber: "RNOTE-OR-1",
        paymentMethod: "CASH" as const,
        discountAmount: 0,
        amountPaid: 1000,
        totalAmount: 1000,
        lines: [{ itemCode: "RNOTE-1", quantity: 1, unitPrice: 1000 }],
      };

      await reviewSale(owner, sale.id, {
        status: "VERIFIED",
        notes: "Receipt handwriting is faint; confirmed against the GCash screenshot.",
        comparison: paperSays,
      });

      /*
       * The regression: the Notes box sits beside Confirm correct, so a note
       * typed there has to survive the verdict. It used to be written as null
       * for anything but a reported mismatch, and the panel then said no notes
       * were recorded.
       */
      const review = await prisma.saleAccountingReview.findFirstOrThrow({ where: { saleId: sale.id } });
      expect(review.status).toBe("VERIFIED");
      expect(review.notes).toBe("Receipt handwriting is faint; confirmed against the GCash screenshot.");
      expect(review.mismatchCategory).toBeNull();

      // The audit trail carries it too, rather than a fixed sentence.
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: "Sale Receipt Verified", reference: "RNOTE-OR-1" },
      });
      expect(entry.details).toContain("faint");
    });
  });

  it("is still kept when a mismatch is reported", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "review-notes-mismatch" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "RNOTE-2", name: "Bull Bar", price: 2000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 200 },
      });

      const { createDirectSale, reviewSale, listReceiptVerifications } =
        await import("../../lib/server/services/customer-sales");

      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "RNOTE-OR-2",
        paymentMethod: "CASH",
        amountPaid: 2000,
        lines: [{ productId: product.id, quantity: 1 }],
      });
      await prisma.saleAccountingReview.updateMany({
        where: { saleId: sale.id },
        data: { receiptPhotoKey: "test/rnote2.jpg", receiptPhotoType: "image/jpeg", evidenceUploadedAt: new Date() },
      });

      await reviewSale(owner, sale.id, {
        status: "MISMATCH_REPORTED",
        mismatchCategory: "TOTAL_MISMATCH",
        notes: "Paper says 2,500.",
        comparison: {
          receiptBooklet: "",
          receiptNumber: "RNOTE-OR-2",
          paymentMethod: "CASH" as const,
          discountAmount: 0,
          amountPaid: 2500,
          totalAmount: 2500,
          lines: [{ itemCode: "RNOTE-2", quantity: 1, unitPrice: 2500 }],
        },
      });

      /*
       * The panel reads the note off the serialized sale, so assert the key it
       * actually arrives under. It read `notes`, which the serializer has never
       * sent, so every reported mismatch claimed to have no note.
       */
      const listed = await listReceiptVerifications(owner, { page: 1, pageSize: 20, saleId: sale.id });
      const row = listed.data.find((entry) => entry.id === sale.id);
      expect(row?.reviewNotes).toBe("Paper says 2,500.");
    });
  });
});

/* The singleton client is bound to the container the previous test destroyed. */
afterEach(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});

afterAll(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
