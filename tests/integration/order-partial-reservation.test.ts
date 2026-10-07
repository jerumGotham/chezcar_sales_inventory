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

describe("Waiting-stock orders hold what the branch has", () => {
  it("holds part of a line, tops it up, gives back exactly what it held, and releases once complete", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "partial-reserve" });
      const branch = fixture.locations.branches.QC;
      const staff: AuthContext = authContextFor(fixture.users.admin, branch);

      const product = await prisma.product.create({ data: { itemCode: "PART-1", name: "Light Bar", price: 1000, status: "ACTIVE" } });
      const other = await prisma.product.create({ data: { itemCode: "PART-2", name: "Snorkel", price: 500, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: product.id, onHand: 1, unitCost: 10 } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: other.id, onHand: 5, unitCost: 10 } });
      const balance = (productId: string) =>
        prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: branch.id, productId } } });
      const lines = (orderId: string) =>
        prisma.customerOrderLine.findMany({ where: { orderId }, orderBy: { productItemCode: "asc" } });

      const {
        createCustomerOrder, reserveCustomerOrder, cancelCustomerOrder, updateCustomerOrderLines, releaseCustomerOrder,
      } = await import("../../lib/server/services/customer-sales");

      // Two wanted, one on hand: the one is held and the order waits. A
      // discount comes off the whole order at creation.
      const order = await createCustomerOrder(staff, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        customer: { name: "Partial Customer" },
        type: "WAITING_STOCK",
        downpaymentAmount: 0,
        discountAmount: 200,
        lines: [{ productId: product.id, quantity: 2 }],
      });
      expect(order).toMatchObject({ statusCode: "WAITING_STOCK", status: "Partially reserved", totalAmount: 1800, discountAmount: 200, balance: 1800 });
      expect((await lines(order.id))[0].reservedQuantity).toBe(1);
      expect((await balance(product.id)).reserved).toBe(1);

      // The rest arrives and is topped up; the order is then reserved in full.
      await prisma.inventoryBalance.update({ where: { locationId_productId: { locationId: branch.id, productId: product.id } }, data: { onHand: 2 } });
      const reserved = await reserveCustomerOrder(staff, order.id);
      expect(reserved).toMatchObject({ statusCode: "RESERVED", status: "Reserved" });
      expect((await lines(order.id))[0].reservedQuantity).toBe(2);
      expect((await balance(product.id)).reserved).toBe(2);

      // Released: the two units leave on hand and nothing stays held.
      const released = await releaseCustomerOrder(staff, order.id, {
        finalReceiptNumber: "PART-OR-1", paymentMethod: "CASH", amountPaid: 1800,
      });
      expect(released).toMatchObject({ statusCode: "COMPLETED" });
      expect(await balance(product.id)).toMatchObject({ onHand: 0, reserved: 0 });
      expect((await lines(order.id))[0].reservedQuantity).toBe(0);

      // Cancelling a part-held order gives back only what it held.
      await prisma.inventoryBalance.update({ where: { locationId_productId: { locationId: branch.id, productId: product.id } }, data: { onHand: 1 } });
      const waiting = await createCustomerOrder(staff, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        customer: { name: "Partial Customer" },
        type: "WAITING_STOCK",
        downpaymentAmount: 0,
        lines: [{ productId: product.id, quantity: 3 }, { productId: other.id, quantity: 2 }],
      });
      expect(waiting.status).toBe("Partially reserved");
      expect((await balance(product.id)).reserved).toBe(1);
      expect((await balance(other.id)).reserved).toBe(2);

      // Editing keeps what is still needed and hands back the rest.
      await updateCustomerOrderLines(staff, waiting.id, {
        lines: [{ productId: product.id, quantity: 3 }, { productId: other.id, quantity: 1 }],
      });
      expect((await balance(other.id)).reserved).toBe(1);
      expect((await lines(waiting.id)).map((line) => line.reservedQuantity)).toEqual([1, 1]);

      await cancelCustomerOrder(staff, waiting.id, { settlement: "FORFEITED" });
      expect((await balance(product.id)).reserved).toBe(0);
      expect((await balance(other.id)).reserved).toBe(0);
      expect((await lines(waiting.id)).every((line) => line.reservedQuantity === 0)).toBe(true);

      // A discount larger than the goods is refused.
      await expect(createCustomerOrder(staff, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        customer: { name: "Partial Customer" },
        type: "RESERVATION_NO_DP",
        downpaymentAmount: 0,
        discountAmount: 9999,
        lines: [{ productId: other.id, quantity: 1 }],
      })).rejects.toMatchObject({ code: "INVALID_DISCOUNT" });
    });
  }, 60_000);
});
