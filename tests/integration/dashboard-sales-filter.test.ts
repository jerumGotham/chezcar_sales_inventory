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

const DAY = 86_400_000;

describe("the Direct Sales list taking the dashboard's own filter", () => {
  it("narrows by period and branch the way the dashboard measures them", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "dash-filter" });
      const quezon = fixture.locations.branches.QC;
      const binan = fixture.locations.branches.BL;
      const owner = actor(fixture.users.admin, quezon);

      const product = await prisma.product.create({
        data: { itemCode: "DASHF-1", name: "Tow Hook", price: 1000, status: "ACTIVE" },
      });
      for (const branch of [quezon, binan]) {
        await prisma.inventoryBalance.create({
          data: { locationId: branch.id, productId: product.id, onHand: 50, unitCost: 100 },
        });
      }

      const { createDirectSale, getDirectSalesOverview, createCustomerOrder, releaseCustomerOrder } =
        await import("../../lib/server/services/customer-sales");

      const post = async (branch: typeof quezon, receipt: string, salespersonId: string) =>
        createDirectSale(actor(fixture.users.admin, branch), {
          locationId: branch.id,
          salespersonId,
          manualReceiptNumber: receipt,
          paymentMethod: "CASH",
          amountPaid: 1000,
          lines: [{ productId: product.id, quantity: 1 }],
        });

      const todayQc = await post(quezon, "DASHF-QC-TODAY", fixture.salespersons.QC.id);
      const oldQc = await post(quezon, "DASHF-QC-OLD", fixture.salespersons.QC.id);
      const todayBl = await post(binan, "DASHF-BL-TODAY", fixture.salespersons.BL.id);

      /*
       * Backdated in the table rather than through the service: postedAt is the
       * encoding moment and is not an input, and postedAt is what the
       * dashboard's filtered total measures.
       */
      await prisma.sale.update({
        where: { id: oldQc.id },
        data: { postedAt: new Date(Date.now() - 10 * DAY) },
      });

      const references = async (filters: Record<string, string> = {}) =>
        (await getDirectSalesOverview(owner, filters)).data.map((sale) => sale.manualReceiptNumber).sort();

      // No filter is still every branch and every date.
      expect(await references()).toEqual(["DASHF-BL-TODAY", "DASHF-QC-OLD", "DASHF-QC-TODAY"]);

      // Ten days back falls outside a seven-day window, and inside a month.
      expect(await references({ salesPeriod: "today" })).toEqual(["DASHF-BL-TODAY", "DASHF-QC-TODAY"]);
      expect(await references({ salesPeriod: "last7Days" })).toEqual(["DASHF-BL-TODAY", "DASHF-QC-TODAY"]);

      // One branch only.
      expect(await references({ salesBranchId: quezon.id })).toEqual(["DASHF-QC-OLD", "DASHF-QC-TODAY"]);

      // Both together, which is what a filtered dashboard card links to.
      expect(await references({ salesPeriod: "today", salesBranchId: quezon.id })).toEqual(["DASHF-QC-TODAY"]);

      // The totals follow the filter, or the page would contradict its own list.
      const narrowed = await getDirectSalesOverview(owner, { salesPeriod: "today", salesBranchId: quezon.id });
      expect(narrowed.summary.totalSales).toBe(1);
      expect(narrowed.summary.totalAmount).toBe(1000);
      // Said back so the page can state what it narrowed to.
      expect(narrowed.appliedFilter).toMatchObject({ periodLabel: "Today", branchLabel: quezon.name });
      expect((await getDirectSalesOverview(owner, {})).appliedFilter).toBeNull();

      // "all" is how every branch is spelled in these filters, not a branch id.
      // Reading it as one answered the dashboard's own link with a 400.
      expect(await references({ salesBranchId: "all" })).toEqual(["DASHF-BL-TODAY", "DASHF-QC-OLD", "DASHF-QC-TODAY"]);
      expect((await getDirectSalesOverview(owner, { salesBranchId: "all" })).appliedFilter).toBeNull();

      // A branch that is not an active one is refused rather than ignored.
      await expect(getDirectSalesOverview(owner, { salesBranchId: "not-a-branch" })).rejects.toMatchObject({
        code: "INVALID_BRANCH",
      });

      // The dashboard's filters are Admin-only, and so are these: letting a
      // branch user pass them would read another branch's sales.
      await expect(
        getDirectSalesOverview(actor(fixture.users.branchStaff, quezon), { salesBranchId: binan.id }),
      ).rejects.toThrow(/Admin-only/);

      /*
       * The dashboard's Sales card totals every posted sale, so the All Sales
       * tab it opens has to as well. A release writes a Sale against the order,
       * and leaving those out is what made the card and the list it opened
       * disagree.
       */
      const order = await createCustomerOrder(owner, {
        customer: { name: "Dash Filter Customer" },
        type: "RESERVATION_WITH_DP",
        locationId: quezon.id,
        salespersonId: fixture.salespersons.QC.id,
        downpaymentAmount: 400,
        downpaymentReceiptNumber: "DASHF-DP-1",
        lines: [{ productId: product.id, quantity: 1 }],
      });
      await releaseCustomerOrder(owner, order.id, {
        finalReceiptNumber: "DASHF-REL-1",
        paymentMethod: "CASH",
        amountPaid: 600,
      });

      const directOnly = await getDirectSalesOverview(owner, {});
      const everything = await getDirectSalesOverview(owner, {}, { includeOrderReleases: true });
      expect(directOnly.data.map((sale) => sale.manualReceiptNumber)).not.toContain("DASHF-REL-1");
      expect(everything.data.map((sale) => sale.manualReceiptNumber)).toContain("DASHF-REL-1");
      expect(everything.summary.totalSales).toBe(directOnly.summary.totalSales + 1);
      expect(everything.summary.totalAmount).toBe(directOnly.summary.totalAmount + 1000);
      expect(everything.includesOrderReleases).toBe(true);
      expect(directOnly.includesOrderReleases).toBe(false);

      void todayQc;
      void todayBl;
    });
  });
});
