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

describe("the monthly sales report", () => {
  it("counts what left the premises, not what was collected, and nets off returns", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "msr" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "MSR-1", name: "Winch", price: 1000, status: "ACTIVE" },
      });
      const returned = await prisma.product.create({
        data: { itemCode: "MSR-2", name: "Snorkel", price: 1000, status: "ACTIVE" },
      });
      for (const item of [product, returned]) {
        await prisma.inventoryBalance.create({
          data: { locationId: branch.id, productId: item.id, onHand: 100, unitCost: 100 },
        });
      }

      const { createDirectSale, createCustomerOrder, releaseCustomerOrder } =
        await import("../../lib/server/services/customer-sales");
      const { refundPostedSale } = await import("../../lib/server/services/refunds");
      const reports = await import("../../lib/server/services/reports");

      // Sold and gone: the whole of this belongs to the month.
      await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "MSR-DS-1",
        paymentMethod: "CASH",
        amountPaid: 2000,
        lines: [{ productId: product.id, quantity: 2 }],
      });

      /*
       * Money in, goods still in the warehouse. A deposit is owed back until
       * the order is handed over, so it is not a sale and must not appear.
       */
      await createCustomerOrder(owner, {
        customer: { name: "Still Waiting" },
        type: "RESERVATION_WITH_DP",
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        downpaymentAmount: 500,
        downpaymentReceiptNumber: "MSR-DP-HELD",
        lines: [{ productId: product.id, quantity: 1 }],
      });

      // Paid in two parts and released: one sale, at its full value.
      const released = await createCustomerOrder(owner, {
        customer: { name: "Collected In Full" },
        type: "RESERVATION_WITH_DP",
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        downpaymentAmount: 400,
        downpaymentReceiptNumber: "MSR-DP-1",
        lines: [{ productId: product.id, quantity: 3 }],
      });
      await releaseCustomerOrder(owner, released.id, {
        finalReceiptNumber: "MSR-REL-1",
        paymentMethod: "CASH",
        amountPaid: 2600,
      });

      // Sold, then one unit came back.
      const refundable = await createDirectSale(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "MSR-RET-1",
        paymentMethod: "CASH",
        amountPaid: 4000,
        lines: [{ productId: returned.id, quantity: 4 }],
      });
      await refundPostedSale(owner, refundable.id, {
        scope: "PARTIAL",
        acknowledgementNumber: "ACK-MSR-1",
        reason: "Customer returned one unit",
        refundMethod: "CASH",
        disposition: "RESELLABLE",
        lines: [{ productId: returned.id, quantity: 1, disposition: "RESELLABLE" }],
      });

      const today = new Date();
      const range = {
        dateFrom: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
        dateTo: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10),
      };

      const msr = await reports.getReport(owner, { type: "sales", ...range });
      if (msr.type !== "sales") throw new Error("Expected the monthly sales report");

      const receipts = msr.rows.map((row) => row.manualReceiptNumber).sort();
      // The two direct sales and the release. The deposit on the order still in
      // the warehouse is money received, not a sale, and is not here.
      expect(receipts).toEqual(["MSR-DS-1", "MSR-REL-1", "MSR-RET-1"]);
      expect(receipts).not.toContain("MSR-DP-HELD");
      expect(receipts).not.toContain("MSR-DP-1");

      // The released order counts once, at the whole 3,000 it was worth, not at
      // the 2,600 collected on the day it went out.
      const release = msr.rows.find((row) => row.manualReceiptNumber === "MSR-REL-1");
      expect(release?.source).toBe("Order Release");
      expect(release?.netAmount).toBe(3000);
      expect(release?.units).toBe(3);

      // 2,000 + 3,000 + 4,000 sold, less the 1,000 handed back.
      expect(msr.grandTotal.receiptCount).toBe(3);
      expect(msr.grandTotal.units).toBe(9);
      expect(msr.grandTotal.grossAmount).toBe(9000);
      expect(msr.grandTotal.totalReturns).toBe(1000);
      expect(msr.grandTotal.netAmount).toBe(8000);

      // Listed as well as subtracted: gross minus returns has to be checkable
      // by whoever receives the page.
      expect(msr.returns).toHaveLength(1);
      expect(msr.returns[0]).toMatchObject({ amount: 1000, reason: "Customer returned one unit" });

      /*
       * The same period read as collections is a different figure, and that is
       * the point of keeping the two reports apart: every receipt of money,
       * including the deposit on goods nobody has received.
       */
      const collections = await reports.getReport(owner, { type: "collections", ...range });
      if (collections.type !== "collections") throw new Error("Expected the collections report");
      const collected = collections.rows.map((row) => row.manualReceiptNumber).sort();
      expect(collected).toContain("MSR-DP-HELD");
      expect(collected.length).toBeGreaterThan(msr.rows.length);
    });
  }, 120_000);
});
