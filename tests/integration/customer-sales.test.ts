import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return { getSession: vi.fn() };
});

void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({ auth: { api: { getSession: testEnvironment.getSession } } }));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

function actor(user: { id: string; role: AuthContext["role"]; locationId: string | null }, location: AuthContext["location"]): AuthContext {
  return { userId: user.id, role: user.role, locationId: user.locationId, location };
}

describe("customer orders, direct sales, accounting", () => {
  it("reserves branch stock, rejects duplicate receipts, releases order into sale", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "customer-order" });
      const product = await prisma.product.create({ data: { itemCode: "ORDER-ITEM", name: "Order Item", price: 100, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 5, reserved: 0, reorderLevel: 1, unitCost: 10 } });
      const { createCustomerOrder, releaseCustomerOrder } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);

      const order = await createCustomerOrder(branchActor, {
        customer: { name: "Reservation Customer", mobile: "09170000000" },
        type: "RESERVATION_WITH_DP",
        downpaymentAmount: 50,
        downpaymentReceiptNumber: "DP-0001",
        lines: [{ productId: product.id, quantity: 2 }],
      });

      expect(order).toMatchObject({ status: "Reserved", downpayment: 50, balance: 150 });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 5, reserved: 2 });
      await expect(createCustomerOrder(branchActor, {
        customer: { name: "Duplicate Receipt" },
        type: "RESERVATION_WITH_DP",
        downpaymentAmount: 10,
        downpaymentReceiptNumber: "DP-0001",
        lines: [{ productId: product.id, quantity: 1 }],
      })).rejects.toMatchObject({ code: "DUPLICATE_RECEIPT" });

      const released = await releaseCustomerOrder(branchActor, order.id, { finalReceiptNumber: "FINAL-0001", amountPaid: 150, paymentMethod: "CASH" });

      expect(released).toMatchObject({ status: "Released", balance: 0 });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 3, reserved: 0 });
      await expect(prisma.sale.findUniqueOrThrow({ where: { manualReceiptNumber: "FINAL-0001" }, include: { accountingReview: true } })).resolves.toMatchObject({ totalAmount: expect.anything(), accountingReview: { status: "UNVERIFIED" } });
      await expect(prisma.inventoryMovement.findMany({ where: { productId: product.id, type: "CUSTOMER_ORDER_RELEASE" } })).resolves.toHaveLength(1);
    });
  }, 30_000);

  it("cancels no-DP reservations by branch and requires Admin note for DP cancellation", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "customer-order-cancel" });
      const product = await prisma.product.create({ data: { itemCode: "CANCEL-ITEM", name: "Cancel Item", price: 100, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 4, reorderLevel: 1, unitCost: 10 } });
      const { cancelCustomerOrder, createCustomerOrder } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);
      const adminActor = actor(fixture.users.admin, null);

      const noDp = await createCustomerOrder(branchActor, { customer: { name: "No DP" }, type: "RESERVATION_NO_DP", downpaymentAmount: 0, lines: [{ productId: product.id, quantity: 1 }] });
      await expect(cancelCustomerOrder(branchActor, noDp.id, {})).resolves.toMatchObject({ status: "Cancelled" });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ reserved: 0 });

      const dp = await createCustomerOrder(branchActor, { customer: { name: "DP" }, type: "RESERVATION_WITH_DP", downpaymentAmount: 10, downpaymentReceiptNumber: "DP-CANCEL-1", lines: [{ productId: product.id, quantity: 1 }] });
      await expect(cancelCustomerOrder(branchActor, dp.id, {})).rejects.toMatchObject({ code: "DP_CANCEL_ADMIN_ONLY" });
      await expect(cancelCustomerOrder(adminActor, dp.id, { note: "Refund approved" })).resolves.toMatchObject({ status: "Cancelled" });
    });
  }, 30_000);

  it("posts direct sales, deducts available stock, and lets Accounting flag mismatches", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "direct-sale" });
      const product = await prisma.product.create({ data: { itemCode: "SALE-ITEM", name: "Sale Item", price: 75, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 3, reserved: 1, reorderLevel: 1, unitCost: 10 } });
      const { createDirectSale, reviewSale } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);
      const accountingActor = actor(fixture.users.accountingStaff, null);

      const sale = await createDirectSale(branchActor, { manualReceiptNumber: "SALE-0001", amountPaid: 75, paymentMethod: "GCASH", lines: [{ productId: product.id, quantity: 1 }] });

      expect(sale).toMatchObject({ manualReceiptNumber: "SALE-0001", totalAmount: 75, reviewStatus: "UNVERIFIED" });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 2, reserved: 1 });
      await expect(createDirectSale(branchActor, { manualReceiptNumber: "SALE-0001", amountPaid: 75, paymentMethod: "GCASH", lines: [{ productId: product.id, quantity: 1 }] })).rejects.toMatchObject({ code: "DUPLICATE_RECEIPT" });
      await expect(reviewSale(accountingActor, sale.id, { status: "FLAGGED", mismatchCategory: "receipt-total", notes: "Receipt total differs" })).resolves.toMatchObject({ status: "FLAGGED", reviewedById: fixture.users.accountingStaff.id });
    });
  }, 30_000);
});

afterEach(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});

afterAll(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
