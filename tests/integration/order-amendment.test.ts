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
describe("amending a customer order before release", () => {
  it("moves the reservation by the difference, hands back what was overpaid, and refuses what it should", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "order-amend" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const bumper = await prisma.product.create({
        data: { itemCode: "AMEND-1", name: "Bumper", price: 1000, status: "ACTIVE" },
      });
      const light = await prisma.product.create({
        data: { itemCode: "AMEND-2", name: "Light Bar", price: 500, status: "ACTIVE" },
      });
      for (const product of [bumper, light]) {
        await prisma.inventoryBalance.create({
          data: { locationId: branch.id, productId: product.id, onHand: 10, unitCost: 100 },
        });
      }

      const { createCustomerOrder, updateCustomerOrderLines, releaseCustomerOrder } =
        await import("../../lib/server/services/customer-sales");

      const balanceFor = (productId: string) =>
        prisma.inventoryBalance.findUniqueOrThrow({
          where: { locationId_productId: { locationId: branch.id, productId } },
        });

      const order = await createCustomerOrder(owner, {
        customer: { name: "Amend Customer" },
        type: "RESERVATION_WITH_DP",
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        downpaymentAmount: 2000,
        downpaymentReceiptNumber: "AMEND-DP-1",
        lines: [{ productId: bumper.id, quantity: 2 }],
      });
      expect((await balanceFor(bumper.id)).reserved).toBe(2);

      // Dropping to one bumper leaves 1,000 overpaid, which needs paperwork.
      await expect(
        updateCustomerOrderLines(owner, order.id, { lines: [{ productId: bumper.id, quantity: 1 }] }),
      ).rejects.toMatchObject({ code: "REFUND_DETAILS_REQUIRED" });
      // Refused means refused: the reservation is untouched.
      expect((await balanceFor(bumper.id)).reserved).toBe(2);

      // The customer swaps one bumper for a light bar.
      await updateCustomerOrderLines(owner, order.id, {
        lines: [
          { productId: bumper.id, quantity: 1 },
          { productId: light.id, quantity: 1 },
        ],
        acknowledgementNumber: "ACK-AMEND-1",
        note: "Customer swapped one bumper for a light bar",
      });

      const bumperBalance = await balanceFor(bumper.id);
      const lightBalance = await balanceFor(light.id);
      expect(bumperBalance.reserved).toBe(1);
      expect(lightBalance.reserved).toBe(1);
      // The goods never left, so on hand is untouched by an amendment.
      expect(bumperBalance.onHand).toBe(10);
      expect(lightBalance.onHand).toBe(10);

      const amended = await prisma.customerOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { lines: true },
      });
      expect(amended.totalAmount.toNumber()).toBe(1500);
      expect(amended.lines).toHaveLength(2);

      // 2,000 paid against a 1,500 order: 500 goes back, and nothing is owed.
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id } });
      expect(refund.kind).toBe("AMENDED_ORDER");
      expect(refund.amount.toNumber()).toBe(500);
      expect(amended.remainingBalance.toNumber()).toBe(0);

      // Raising the total asks for the balance rather than a second refund.
      await updateCustomerOrderLines(owner, order.id, {
        lines: [
          { productId: bumper.id, quantity: 2 },
          { productId: light.id, quantity: 1 },
        ],
      });
      const raised = await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(raised.totalAmount.toNumber()).toBe(2500);
      expect(raised.remainingBalance.toNumber()).toBe(1000);
      expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(1);

      // Once released there is nothing left to amend.
      await releaseCustomerOrder(owner, order.id, {
        finalReceiptNumber: "AMEND-FINAL-1",
        paymentMethod: "CASH",
        amountPaid: 1000,
      });
      await expect(
        updateCustomerOrderLines(owner, order.id, { lines: [{ productId: bumper.id, quantity: 1 }] }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_EDITABLE" });
    });
  }, 120_000);
});
