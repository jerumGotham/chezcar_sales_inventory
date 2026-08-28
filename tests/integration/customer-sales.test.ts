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
       await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 5, reserved: 0, unitCost: 10 } });
      const { createCustomerOrder, recordCustomerOrderPayment, releaseCustomerOrder } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);

      const order = await createCustomerOrder(branchActor, {
        customer: { name: "Reservation Customer", mobile: "09170000000" },
        type: "RESERVATION_WITH_DP",
        downpaymentAmount: 50,
        downpaymentReceiptNumber: "DP-0001",
        lines: [{ productId: product.id, quantity: 2 }],
      });

      expect(order).toMatchObject({ status: "Reserved", statusCode: "RESERVED", downpayment: 50, balance: 150 });
      await expect(recordCustomerOrderPayment(branchActor, order.id, { amount: 25, reference: "DP-0002" })).resolves.toMatchObject({ downpayment: 75, balance: 125 });
      await expect(recordCustomerOrderPayment(branchActor, order.id, { amount: 5 })).resolves.toMatchObject({ downpayment: 80, balance: 120 });
      await expect(recordCustomerOrderPayment(branchActor, order.id, { amount: 121, reference: "DP-TOO-MUCH" })).rejects.toMatchObject({ code: "INVALID_PAYMENT" });
      await expect(recordCustomerOrderPayment(branchActor, order.id, { amount: 5, reference: "DP-0002" })).rejects.toMatchObject({ code: "DUPLICATE_RECEIPT" });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 5, reserved: 2 });
      await expect(createCustomerOrder(branchActor, {
        customer: { name: "Duplicate Receipt" },
        type: "RESERVATION_WITH_DP",
        downpaymentAmount: 10,
        downpaymentReceiptNumber: "DP-0001",
        lines: [{ productId: product.id, quantity: 1 }],
      })).rejects.toMatchObject({ code: "DUPLICATE_RECEIPT" });

      const released = await releaseCustomerOrder(branchActor, order.id, { finalReceiptNumber: "FINAL-0001", amountPaid: 120, paymentMethod: "CASH" });

      expect(released).toMatchObject({ status: "Released", balance: 0 });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 3, reserved: 0 });
      await expect(prisma.sale.findFirstOrThrow({ where: { manualReceiptNumber: "FINAL-0001" }, include: { accountingReview: true } })).resolves.toMatchObject({ totalAmount: expect.anything(), accountingReview: { status: "UNVERIFIED" } });
      await expect(prisma.inventoryMovement.findMany({ where: { productId: product.id, type: "CUSTOMER_ORDER_RELEASE" } })).resolves.toHaveLength(1);
    });
  }, 30_000);

  it("cancels no-DP reservations by branch and requires Admin note for DP cancellation", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "customer-order-cancel" });
      const product = await prisma.product.create({ data: { itemCode: "CANCEL-ITEM", name: "Cancel Item", price: 100, status: "ACTIVE" } });
       await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 4, unitCost: 10 } });
      const { cancelCustomerOrder, createCustomerOrder } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);
      const adminActor = actor(fixture.users.admin, null);

      const noDp = await createCustomerOrder(branchActor, { customer: { name: "No DP" }, type: "RESERVATION_NO_DP", downpaymentAmount: 0, lines: [{ productId: product.id, quantity: 1 }] });
      await expect(cancelCustomerOrder(branchActor, noDp.id, {})).resolves.toMatchObject({ status: "Cancelled" });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ reserved: 0 });

      const dp = await createCustomerOrder(branchActor, { customer: { name: "DP" }, type: "RESERVATION_WITH_DP", downpaymentAmount: 10, downpaymentReceiptNumber: "DP-CANCEL-1", lines: [{ productId: product.id, quantity: 1 }] });
      await expect(cancelCustomerOrder(branchActor, dp.id, {})).rejects.toMatchObject({ code: "DP_CANCEL_ADMIN_ONLY" });
      await expect(cancelCustomerOrder(adminActor, dp.id, {})).rejects.toMatchObject({ code: "CANCELLATION_NOTE_REQUIRED", status: 400 });
      await expect(cancelCustomerOrder(adminActor, dp.id, { note: "Refund approved" })).resolves.toMatchObject({ status: "Cancelled" });
    });
  }, 30_000);

  it("posts direct sales, deducts available stock, and lets Accounting flag mismatches", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "direct-sale" });
      const product = await prisma.product.create({ data: { itemCode: "SALE-ITEM", name: "Sale Item", price: 75, reorderLevel: 1, status: "ACTIVE" } });
       const balance = await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 3, reserved: 1, unitCost: 10 } });
      const { createDirectSale, reviewSale } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);
      const adminActor = actor(fixture.users.admin, null);

      const sale = await createDirectSale(branchActor, { receiptBooklet: "", manualReceiptNumber: "SALE-0001", amountPaid: 75, paymentMethod: "GCASH", lines: [{ productId: product.id, quantity: 1 }] });

      expect(sale).toMatchObject({ manualReceiptNumber: "SALE-0001", totalAmount: 75, reviewStatus: "UNVERIFIED" });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 2, reserved: 1 });
      await expect(prisma.notification.findMany({ where: { relatedId: balance.id } })).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: fixture.users.admin.id, title: "Low Stock: SALE-ITEM" }),
        expect.objectContaining({ userId: fixture.users.branchStaff.id, title: "Low Stock: SALE-ITEM" }),
      ]));
      await expect(createDirectSale(branchActor, { receiptBooklet: "", manualReceiptNumber: "SALE-0001", amountPaid: 75, paymentMethod: "GCASH", lines: [{ productId: product.id, quantity: 1 }] })).rejects.toMatchObject({ code: "DUPLICATE_RECEIPT" });
       await expect(reviewSale(adminActor, sale.id, { status: "VERIFIED", comparison: { receiptBooklet: "", receiptNumber: "SALE-0001", paymentMethod: "GCASH", discountAmount: 0, amountPaid: 75, totalAmount: 75, lines: [{ itemCode: "SALE-ITEM", quantity: 1, unitPrice: 75 }] } })).resolves.toMatchObject({ status: "VERIFIED", reviewedById: fixture.users.admin.id });
    });
  }, 30_000);

  it("creates waiting-stock orders for unavailable products and reserves all lines atomically", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "waiting-stock-reserve" });
      const [availableProduct, unavailableProduct] = await Promise.all([
        prisma.product.create({ data: { itemCode: "WAITING-A", name: "Waiting A", price: 100, status: "ACTIVE" } }),
        prisma.product.create({ data: { itemCode: "WAITING-B", name: "Waiting B", price: 200, status: "ACTIVE" } }),
      ]);
      await Promise.all([
        prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: availableProduct.id, onHand: 2, reserved: 0, unitCost: 10 } }),
        prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: unavailableProduct.id, onHand: 0, reserved: 0, unitCost: 20 } }),
      ]);
      const { createCustomerOrder, reserveCustomerOrder } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);
      const order = await createCustomerOrder(branchActor, {
        customer: { name: "Waiting Customer" },
        type: "WAITING_STOCK",
        downpaymentAmount: 0,
        lines: [
          { productId: availableProduct.id, quantity: 1 },
          { productId: unavailableProduct.id, quantity: 1 },
        ],
      });

      expect(order).toMatchObject({ status: "Pending", statusCode: "WAITING_STOCK" });
      await expect(reserveCustomerOrder(branchActor, order.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: availableProduct.id } } })).resolves.toMatchObject({ reserved: 0 });

      await prisma.inventoryBalance.update({ where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: unavailableProduct.id } }, data: { onHand: 1 } });
      testEnvironment.getSession.mockResolvedValue({ user: { id: fixture.users.branchStaff.id } });
      const { POST } = await import("../../app/api/customer-orders/[orderId]/[action]/route");
      const reserveResponse = await POST(new Request(`http://localhost/api/customer-orders/${order.id}/reserve`, { method: "POST" }), { params: Promise.resolve({ orderId: order.id, action: "reserve" }) });
      expect(reserveResponse.status).toBe(200);
      await expect(reserveResponse.json()).resolves.toMatchObject({ data: { status: "Reserved", statusCode: "RESERVED" } });
      const balances = await prisma.inventoryBalance.findMany({ where: { productId: { in: [availableProduct.id, unavailableProduct.id] } }, orderBy: { productId: "asc" } });
      expect(balances.every((balance) => balance.reserved === 1)).toBe(true);
      await expect(reserveCustomerOrder(branchActor, order.id)).rejects.toMatchObject({ code: "INVALID_STATUS" });
    });
  }, 30_000);

  it("includes unavailable products only when customer orders request them", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "order-options-unavailable" });
      const [availableProduct, unavailableProduct] = await Promise.all([
        prisma.product.create({ data: { itemCode: "OPTION-AVAILABLE", name: "Available", price: 10, status: "ACTIVE" } }),
        prisma.product.create({ data: { itemCode: "OPTION-UNAVAILABLE", name: "Unavailable", price: 20, status: "ACTIVE" } }),
      ]);
      await Promise.all([
        prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: availableProduct.id, onHand: 1, reserved: 0, unitCost: 1 } }),
        prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: unavailableProduct.id, onHand: 0, reserved: 0, unitCost: 1 } }),
      ]);
      testEnvironment.getSession.mockResolvedValue({ user: { id: fixture.users.branchStaff.id } });
      const { GET } = await import("../../app/api/customer-orders/options/route");
      const baseUrl = `http://localhost/api/customer-orders/options?locationId=${fixture.locations.branches.QC.id}`;

      const posResponse = await GET(new Request(baseUrl));
      const posPayload = await posResponse.json() as { data: { products: Array<{ id: string }> } };
      expect(posPayload.data.products.map((product) => product.id)).toEqual([availableProduct.id]);

      const waitingResponse = await GET(new Request(`${baseUrl}&includeUnavailable=true`));
      const waitingPayload = await waitingResponse.json() as { data: { products: Array<{ id: string; availableQuantity: number }> } };
      expect(waitingPayload.data.products).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: availableProduct.id, availableQuantity: 1 }),
        expect.objectContaining({ id: unavailableProduct.id, availableQuantity: 0 }),
      ]));

      testEnvironment.getSession.mockResolvedValue({ user: { id: fixture.users.accountingStaff.id } });
      const deniedResponse = await GET(new Request(baseUrl));
      expect(deniedResponse.status).toBe(403);
    });
  }, 30_000);

  it("lets Admin void a mismatched sale and create a JSON-safe replacement", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "sale-replacement" });
      const product = await prisma.product.create({ data: { itemCode: "REPLACE-ITEM", name: "Replacement Item", price: 50, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 5, reserved: 0, unitCost: 10 } });
      const { createDirectSale, listReceiptVerifications, resolveSale, respondToSaleMismatch, reviewSale } = await import("../../lib/server/services/customer-sales");
      const { listNotifications } = await import("../../lib/server/services/notifications");
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);
      const accountingActor = actor(fixture.users.accountingStaff, null);
      const adminActor = actor(fixture.users.admin, null);

      const original = await createDirectSale(branchActor, { receiptBooklet: "", manualReceiptNumber: "ORIGINAL-001", amountPaid: 50, paymentMethod: "CASH", lines: [{ productId: product.id, quantity: 1 }] });
      await reviewSale(accountingActor, original.id, { status: "MISMATCH_REPORTED", mismatchCategory: "QUANTITY_MISMATCH", notes: "Paper receipt shows two pieces", comparison: { receiptBooklet: "", receiptNumber: "ORIGINAL-001", paymentMethod: "CASH", discountAmount: 0, amountPaid: 100, totalAmount: 100, lines: [{ itemCode: product.itemCode, quantity: 2, unitPrice: 50 }] } });
      await expect(listNotifications(branchActor)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ title: "Receipt mismatch reported", relatedId: original.id }),
      ]));
      await expect(listReceiptVerifications(adminActor, {})).resolves.toMatchObject({
        data: [
          expect.objectContaining({
            id: original.id,
            reportedComparison: expect.objectContaining({
              receiptBooklet: "",
              receiptNumber: "ORIGINAL-001",
              paymentMethod: "CASH",
              discountAmount: 0,
              amountPaid: 100,
              totalAmount: 100,
              lines: [expect.objectContaining({ itemCode: product.itemCode, quantity: 2 })],
            }),
          }),
        ],
      });
      await respondToSaleMismatch(branchActor, original.id, {
        response: "RECEIPT_CORRECTION_NEEDED",
        note: "Physical receipt confirms two pieces.",
        replacementReceiptNumber: "REPLACEMENT-001",
      });
      await expect(listReceiptVerifications(adminActor, {})).resolves.toMatchObject({
        data: [expect.objectContaining({
          id: original.id,
          branchResponse: "RECEIPT_CORRECTION_NEEDED",
          branchReplacementReceiptNumber: "REPLACEMENT-001",
        })],
      });
      await expect(resolveSale(accountingActor, original.id, { action: "VOIDED_REPLACED", note: "Accounting attempted correction", replacement: { receiptBooklet: "", receiptNumber: "REPLACEMENT-001", paymentMethod: "CASH", discountAmount: 0, amountPaid: 100, totalAmount: 100, lines: [{ itemCode: product.itemCode, quantity: 2, unitPrice: 50 }] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(resolveSale(adminActor, original.id, { action: "VOIDED_REPLACED", note: "Inconsistent total", replacement: { receiptBooklet: "", receiptNumber: "REPLACEMENT-001", paymentMethod: "CASH", discountAmount: 0, amountPaid: 100, totalAmount: 99.99, lines: [{ itemCode: product.itemCode, quantity: 2, unitPrice: 50 }] } })).rejects.toMatchObject({ code: "INVALID_TOTAL" });
      await expect(resolveSale(adminActor, original.id, { action: "VOIDED_REPLACED", note: "Duplicate line", replacement: { receiptBooklet: "", receiptNumber: "REPLACEMENT-001", paymentMethod: "CASH", discountAmount: 0, amountPaid: 100, totalAmount: 100, lines: [{ itemCode: product.itemCode, quantity: 1, unitPrice: 50 }, { itemCode: product.itemCode, quantity: 1, unitPrice: 50 }] } })).rejects.toMatchObject({ code: "INVALID_LINES" });
      const result = await resolveSale(adminActor, original.id, { action: "VOIDED_REPLACED", note: "Corrected from paper receipt", replacement: { receiptBooklet: "", receiptNumber: "REPLACEMENT-001", paymentMethod: "CASH", discountAmount: 0, amountPaid: 100, totalAmount: 100, lines: [{ itemCode: product.itemCode, quantity: 2, unitPrice: 50 }] } });

      expect(() => JSON.stringify(result)).not.toThrow();
      expect(result).toMatchObject({ action: "VOIDED_REPLACED", sale: { manualReceiptNumber: "REPLACEMENT-001", totalAmount: 100 } });
      await expect(prisma.sale.findUniqueOrThrow({ where: { id: original.id } })).resolves.toMatchObject({ status: "VOIDED" });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 3 });

      const branchConfirmedSale = await createDirectSale(branchActor, { receiptBooklet: "", manualReceiptNumber: "BRANCH-CONFIRMED-001", amountPaid: 50, paymentMethod: "CASH", lines: [{ productId: product.id, quantity: 1 }] });
      await reviewSale(accountingActor, branchConfirmedSale.id, { status: "MISMATCH_REPORTED", mismatchCategory: "OTHER", notes: "Needs branch confirmation", comparison: { receiptBooklet: "", receiptNumber: "BRANCH-CONFIRMED-001", paymentMethod: "CASH", discountAmount: 0, amountPaid: 50, totalAmount: 50, lines: [{ itemCode: product.itemCode, quantity: 1, unitPrice: 50 }] } });
      await respondToSaleMismatch(branchActor, branchConfirmedSale.id, { response: "ORIGINAL_ENCODING_CORRECT", note: "Checked the physical receipt; original encoding is correct." });
      await expect(resolveSale(accountingActor, branchConfirmedSale.id, { action: "CONFIRMED_CORRECT", note: "Closed after branch confirmation" })).resolves.toMatchObject({ action: "CONFIRMED_CORRECT", review: { status: "VERIFIED" } });
    });
  }, 30_000);

  it("lets Admin load reports summaries", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "reports-admin" });
      const { getReportsSummary } = await import("../../lib/server/services/customer-sales");
      const adminActor = actor(fixture.users.admin, null);
      const branchActor = actor(fixture.users.branchStaff, fixture.locations.branches.QC);

      await expect(getReportsSummary(adminActor)).resolves.toMatchObject({
        sales: expect.any(Object),
        accounting: expect.any(Object),
        orders: expect.any(Object),
        inventory: expect.any(Array),
      });
      await expect(getReportsSummary(branchActor)).rejects.toMatchObject({ code: "FORBIDDEN" });
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
