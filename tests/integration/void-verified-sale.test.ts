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

describe("Voiding a sale Accounting already verified", () => {
  it("returns the stock, voids the payment, records why, and is held back from everyone without the grant", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "void-verified" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);
      const accounting = actor(fixture.users.accountingStaff, branch);

      const product = await prisma.product.create({
        data: { itemCode: "VVS-1", name: "Roof Rack", price: 2000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 100 },
      });

      const { createDirectSale, reviewSale, voidVerifiedSale } =
        await import("../../lib/server/services/customer-sales");

      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "VVS-OR-1",
        paymentMethod: "CASH",
        amountPaid: 4000,
        lines: [{ productId: product.id, quantity: 2 }],
      });
      expect((await prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).onHand).toBe(8);

      // Not verified yet: this is not the way to undo an unreviewed sale.
      await expect(voidVerifiedSale(owner, sale.id, { note: "too early" })).rejects.toMatchObject({ code: "INVALID_STATE" });

      await prisma.saleAccountingReview.updateMany({
        where: { saleId: sale.id },
        data: { receiptPhotoKey: "test/vvs.jpg", receiptPhotoType: "image/jpeg", evidenceUploadedAt: new Date() },
      });
      await reviewSale(owner, sale.id, {
        status: "VERIFIED",
        comparison: {
          receiptBooklet: "",
          receiptNumber: "VVS-OR-1",
          paymentMethod: "CASH",
          discountAmount: 0,
          amountPaid: 4000,
          totalAmount: 4000,
          lines: [{ itemCode: "VVS-1", quantity: 2, unitPrice: 2000 }],
        },
      });
      expect((await prisma.payment.findFirstOrThrow({ where: { saleId: sale.id } })).reviewStatus).toBe("VERIFIED");

      // Verifying is one grant; undoing a verification is another.
      if (!accounting.capabilities.includes("sales:void-verified")) {
        await expect(voidVerifiedSale(accounting, sale.id, { note: "no grant" })).rejects.toThrow();
      }
      await expect(voidVerifiedSale(owner, sale.id, { note: "   " })).rejects.toThrow();

      await voidVerifiedSale(owner, sale.id, { note: "Verified against the wrong receipt" });

      const voided = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { accountingReview: true } });
      expect(voided.status).toBe("VOIDED");
      expect(voided.accountingReview?.resolutionAction).toBe("VOIDED");
      expect(voided.accountingReview?.resolutionNote).toBe("Verified against the wrong receipt");

      // The goods are back on the shelf.
      expect((await prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).onHand).toBe(10);

      // The payment no longer counts: the reports read ACTIVE rows only.
      const payment = await prisma.payment.findFirstOrThrow({ where: { saleId: sale.id } });
      expect(payment.status).toBe("VOIDED");

      expect(await prisma.auditLog.count({ where: { action: "Verified Sale Voided", reference: "VVS-OR-1" } })).toBe(1);

      // Once voided, there is nothing left to void.
      await expect(voidVerifiedSale(owner, sale.id, { note: "again" })).rejects.toMatchObject({ code: "INVALID_STATUS" });
    });
  });
});
