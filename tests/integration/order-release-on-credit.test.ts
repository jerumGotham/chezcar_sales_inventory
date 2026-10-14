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

describe("Releasing a customer order while money is still owed", () => {
  it("hands the goods over, keeps the balance, and closes the order on the last payment", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "release-credit" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "CREDIT-1", name: "Roll Bar", price: 10_000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 5, reserved: 0, unitCost: 1_000 },
      });

      const { createCustomerOrder, releaseCustomerOrder, recordCustomerOrderPayment } =
        await import("../../lib/server/services/customer-sales");

      // 20,000 ordered, 5,000 down: 15,000 outstanding before release.
      const order = await createCustomerOrder(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        customer: { name: "Credit Customer", mobile: "09170000001" },
        type: "RESERVATION_WITH_DP",
        downpaymentAmount: 5_000,
        downpaymentReceiptNumber: "CREDIT-DP-1",
        lines: [{ productId: product.id, quantity: 2 }],
      });
      expect(order.balance).toBe(15_000);

      // Collects 4,000 of the 15,000 and lets the goods go on the rest.
      const released = await releaseCustomerOrder(owner, order.id, {
        finalReceiptNumber: "CREDIT-REL-1",
        amountPaid: 4_000,
        paymentMethod: "CASH",
      });
      expect(released.statusCode).toBe("RELEASED_UNPAID");
      expect(released.balance).toBe(11_000);

      // The stock really left: this is what makes it a credit sale and not a
      // reservation, and it is why the balance has to be chased afterwards.
      const afterRelease = await prisma.inventoryBalance.findFirstOrThrow({
        where: { locationId: branch.id, productId: product.id },
      });
      expect(afterRelease.onHand).toBe(3);
      expect(afterRelease.reserved).toBe(0);

      /*
       * One ORDER_FINAL row carries the units into the sales report, holding
       * only what was collected at the counter. The rest arrives on its own
       * receipts, so the report never counts money before it exists.
       */
      const finalRow = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id, kind: "ORDER_FINAL" },
      });
      expect(finalRow.amount.toNumber()).toBe(4_000);
      expect(finalRow.saleId).not.toBeNull();

      // The balance is collected afterwards, on receipts of its own.
      const partly = await recordCustomerOrderPayment(owner, order.id, {
        amount: 6_000,
        reference: "CREDIT-PAY-1",
        method: "CASH",
      });
      expect(partly.statusCode).toBe("RELEASED_UNPAID");
      expect(partly.balance).toBe(5_000);

      const settled = await recordCustomerOrderPayment(owner, order.id, {
        amount: 5_000,
        reference: "CREDIT-PAY-2",
        method: "CASH",
      });
      // The last payment is what closes it; nothing else is handed over.
      expect(settled.statusCode).toBe("COMPLETED");
      expect(settled.balance).toBe(0);

      /*
       * Each later payment is its own receipt, waiting in the payment side of
       * Receipt Verification, and carries no units so the goods stay counted
       * once on the release.
       */
      const laterRows = await prisma.payment.findMany({
        where: { orderId: order.id, kind: "ORDER_PAYMENT" },
        orderBy: { collectedAt: "asc" },
      });
      expect(laterRows.map((row) => [row.receiptNumber, row.amount.toNumber(), row.reviewStatus, row.saleId])).toEqual([
        ["CREDIT-PAY-1", 6_000, "UNVERIFIED", null],
        ["CREDIT-PAY-2", 5_000, "UNVERIFIED", null],
      ]);

      // The order's ledger adds up to its total exactly once.
      const ledger = await prisma.payment.aggregate({
        where: { orderId: order.id, status: "ACTIVE" },
        _sum: { amount: true },
      });
      expect(ledger._sum.amount?.toNumber()).toBe(20_000);
    });
  });

  it("refuses to release on credit without the grant, and refuses to overcollect", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "release-credit-guard" });
      const branch = fixture.locations.branches.QC;
      const owner = actor(fixture.users.admin, branch);

      const product = await prisma.product.create({
        data: { itemCode: "CREDIT-2", name: "Snorkel", price: 3_000, status: "ACTIVE" },
      });
      await prisma.inventoryBalance.create({
        data: { locationId: branch.id, productId: product.id, onHand: 5, reserved: 0, unitCost: 300 },
      });

      const { createCustomerOrder, releaseCustomerOrder } =
        await import("../../lib/server/services/customer-sales");

      const order = await createCustomerOrder(owner, {
        locationId: branch.id,
        salespersonId: fixture.salespersons.QC.id,
        customer: { name: "Guarded Customer", mobile: "09170000002" },
        type: "RESERVATION_WITH_DP",
        downpaymentAmount: 1_000,
        downpaymentReceiptNumber: "CREDIT-DP-2",
        lines: [{ productId: product.id, quantity: 1 }],
      });

      // More than is owed is not a release, it is a keying error.
      await expect(
        releaseCustomerOrder(owner, order.id, { finalReceiptNumber: "CREDIT-REL-2", amountPaid: 5_000, paymentMethod: "CASH" }),
      ).rejects.toMatchObject({ code: "INVALID_BALANCE" });

      /*
       * Handing out stock on credit is a decision of its own, so the ordinary
       * release grant is not enough for it.
       */
      const withoutGrant: AuthContext = {
        ...owner,
        isOwner: false,
        capabilities: owner.capabilities.filter((capability) => capability !== "customer-orders:release-unpaid"),
      };
      await expect(
        releaseCustomerOrder(withoutGrant, order.id, { amountPaid: 0, paymentMethod: "CASH" }),
      ).rejects.toMatchObject({ status: 403 });

      // The goods never moved while it was refused.
      const balance = await prisma.inventoryBalance.findFirstOrThrow({
        where: { locationId: branch.id, productId: product.id },
      });
      expect(balance.onHand).toBe(5);
      expect((await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).status).not.toBe("RELEASED_UNPAID");
    });
  });
});

afterEach(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});

afterAll(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
