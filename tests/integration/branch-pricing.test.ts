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

describe("branch selling prices", () => {
  it("charges the branch its own price, leaves other branches on the product's, and keeps what was charged", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "branch-pricing" });
      const qc = fixture.locations.branches.QC;
      const bl = fixture.locations.branches.BL;

      const product = await prisma.product.create({
        data: { itemCode: "PRICE-1", name: "Priced Item", price: 50, status: "ACTIVE" },
      });
      const qcBalance = await prisma.inventoryBalance.create({
        data: { locationId: qc.id, productId: product.id, onHand: 5, unitCost: 10 },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: bl.id, productId: product.id, onHand: 5, unitCost: 10 },
      });

      const { setBranchPrice } = await import("../../lib/server/catalog");
      const { createDirectSale } = await import("../../lib/server/services/customer-sales");
      const owner = actor(fixture.users.admin, null);

      await setBranchPrice(owner, qcBalance.id, { price: 35 });

      // Neither sale passes a unit price, so each one is priced by the server.
      await createDirectSale(actor(fixture.users.admin, qc), {
        locationId: qc.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "PRICE-QC",
        paymentMethod: "CASH",
        amountPaid: 35,
        lines: [{ productId: product.id, quantity: 1 }],
      });
      await createDirectSale(actor(fixture.users.admin, bl), {
        locationId: bl.id,
        salespersonId: fixture.salespersons.BL.id,
        manualReceiptNumber: "PRICE-BL",
        paymentMethod: "CASH",
        amountPaid: 50,
        lines: [{ productId: product.id, quantity: 1 }],
      });

      const charged = async (receipt: string) => {
        const sale = await prisma.sale.findFirstOrThrow({
          where: { manualReceiptNumber: receipt },
          include: { lines: true, payment: true },
        });
        return {
          unitPrice: sale.lines[0].unitPrice.toNumber(),
          total: sale.totalAmount.toNumber(),
          // What the Sales report counts, so it has to agree with the line.
          payment: sale.payment?.amount.toNumber() ?? null,
        };
      };

      expect(await charged("PRICE-QC")).toEqual({ unitPrice: 35, total: 35, payment: 35 });
      expect(await charged("PRICE-BL")).toEqual({ unitPrice: 50, total: 50, payment: 50 });

      // Moving the price afterwards must not rewrite what was already sold:
      // the reports read these recorded figures, not the price list.
      await setBranchPrice(owner, qcBalance.id, { price: 80 });
      expect(await charged("PRICE-QC")).toEqual({ unitPrice: 35, total: 35, payment: 35 });

      // Clearing returns the branch to the product's price for the next sale.
      await setBranchPrice(owner, qcBalance.id, { price: null });
      await createDirectSale(actor(fixture.users.admin, qc), {
        locationId: qc.id,
        salespersonId: fixture.salespersons.QC.id,
        manualReceiptNumber: "PRICE-QC-2",
        paymentMethod: "CASH",
        amountPaid: 50,
        lines: [{ productId: product.id, quantity: 1 }],
      });
      expect(await charged("PRICE-QC-2")).toEqual({ unitPrice: 50, total: 50, payment: 50 });
    });
  }, 60_000);
});
