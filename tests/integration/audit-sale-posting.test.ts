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

describe("Audit trail after a sale is corrected", () => {
  it("keeps the posting as it was posted, once, and records the discount in the correction", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "audit-posting" });
      const branch = fixture.locations.branches.QC;
      const owner: AuthContext = authContextFor(fixture.users.admin, branch);

      const product = await prisma.product.create({ data: { itemCode: "AUD-1", name: "Strut Support", price: 2500, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: product.id, onHand: 5, unitCost: 10 } });

      const { createDirectSale, correctEncodedSale } = await import("../../lib/server/services/customer-sales");
      const { getAuditTrail } = await import("../../lib/server/services/audit");

      const sale = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        customer: { name: "Audit Customer" },
        manualReceiptNumber: "AUD-OR-1",
        paymentMethod: "CASH",
        discountAmount: 0,
        amountPaid: 2500,
        lines: [{ productId: product.id, quantity: 1, unitPrice: 2500 }],
      });
      await prisma.saleAccountingReview.updateMany({ where: { saleId: sale.id }, data: { receiptPhotoKey: "test/aud.jpg", receiptPhotoType: "image/jpeg" } });

      // Accounting opens the receipt at version 1 and corrects it.
      const openedAt = (await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).version;
      await correctEncodedSale(owner, sale.id, {
        expectedVersion: openedAt,
        action: "VOIDED_REPLACED",
        note: "Price on the paper is 3,500",
        replacement: {
          receiptBooklet: "", receiptNumber: "AUD-OR-1", paymentMethod: "CASH",
          discountAmount: 499, amountPaid: 3001, totalAmount: 3001,
          lines: [{ itemCode: "AUD-1", quantity: 1, unitPrice: 3500 }],
        },
      });

      // A second correction filled before the first landed -- the form still
      // holding the old figures -- is refused instead of writing them back.
      await expect(correctEncodedSale(owner, sale.id, {
        action: "VOIDED_REPLACED",
        note: "Stale form",
        expectedVersion: openedAt,
        replacement: {
          receiptBooklet: "", receiptNumber: "AUD-OR-1", paymentMethod: "CASH",
          discountAmount: 0, amountPaid: 2500, totalAmount: 2500,
          lines: [{ itemCode: "AUD-1", quantity: 1, unitPrice: 2500 }],
        },
      })).rejects.toMatchObject({ code: "STALE_SALE" });

      const trail = await getAuditTrail(owner, { search: "AUD-OR-1", pageSize: 100 });
      const postings = trail.data.filter((row) => row.action === "Direct Sale Posted");
      // One posting, and it is the one written when the sale was posted.
      expect(postings).toHaveLength(1);
      expect(postings[0].details).toContain("total 2500");
      expect(postings[0].details).toContain("Audit Customer");

      // The correction says what the discount was and became.
      const correction = trail.data.find((row) => row.action === "Sale Encoding Corrected");
      const facts = Object.fromEntries((correction?.facts ?? []).map((fact) => [fact.label, fact.value]));
      expect(facts.Was).toContain("less discount 0 = 2500");
      expect(facts.Now).toContain("less discount 499 = 3001");
      expect(correction?.details).toContain("Audit Customer");
    });
  }, 60_000);
});
