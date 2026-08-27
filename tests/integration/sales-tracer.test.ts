import type { AuthContext } from "@/lib/server/authorization";
import type { PaymentMethod } from "@prisma/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import {
  authContextFor,
  createAuthFixture,
  createBranchStaffFixture,
  createInventoryBalanceFixture,
  createProductFixture,
} from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});

void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

function actor(user: { id: string; role: AuthContext["role"]; locationId: string | null }, location: AuthContext["location"]): AuthContext {
  return { userId: user.id, role: user.role, locationId: user.locationId, location };
}

function matchingComparison(sale: { receiptBooklet: string; manualReceiptNumber: string; paymentMethod: PaymentMethod; discountAmount?: number; amountPaid: number; totalAmount: number; lines: Array<{ itemCode: string; quantity: number; unitPrice: number }> }) {
  return { receiptBooklet: sale.receiptBooklet, receiptNumber: sale.manualReceiptNumber, paymentMethod: sale.paymentMethod, discountAmount: sale.discountAmount ?? 0, amountPaid: sale.amountPaid, totalAmount: sale.totalAmount, lines: sale.lines };
}

describe("sales tracer — per-branch receipt, stock deduction, Accounting VERIFIED", () => {
  it("proves branch receipt reuse, duplicate guard, stock deduction, and VERIFIED terminality", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "sales-tracer" });
      // Create additional BL branch staff distinct from QC staff in fixture
      const blStaff = await createBranchStaffFixture(prisma, fixture.locations, "sales-tracer", "BL", "branch-bl-staff");
      const qcStaff = fixture.users.branchStaff; // QC
      const admin = fixture.users.admin;
      const accounting = fixture.users.accountingStaff;

      const blActor = actor(blStaff, fixture.locations.branches.BL);
      const qcActor = actor(qcStaff, fixture.locations.branches.QC);
      const adminActor = actor(admin, null);
      const accountingActor = actor(accounting, null);

      // Product with price Decimal
      const product = await createProductFixture(prisma, { itemCode: "TRACER-ITEM", name: "Tracer Item", price: 50 });
      expect(product.price?.toNumber()).toBe(50);

      // Seed balances for BL and QC
       await createInventoryBalanceFixture(prisma, { locationId: fixture.locations.branches.BL.id, productId: product.id, onHand: 10, reserved: 0, unitCost: 10 });
       await createInventoryBalanceFixture(prisma, { locationId: fixture.locations.branches.QC.id, productId: product.id, onHand: 10, reserved: 1, unitCost: 10 });

      const { createDirectSale, getSaleById, reviewSale, listSales } = await import("../../lib/server/services/customer-sales");

      const booklet = "BK-01";
      const receiptNumber = "0001";

      // BL posts same booklet+number succeeds
      const blSale = await createDirectSale(blActor, {
        receiptBooklet: booklet,
        manualReceiptNumber: receiptNumber,
        amountPaid: 100,
        paymentMethod: "CASH",
        lines: [{ productId: product.id, quantity: 2 }],
      });
      expect(blSale.receiptBooklet).toBe(booklet);
      expect(blSale.manualReceiptNumber).toBe(receiptNumber);
      expect(blSale.branch).toBe("BL Branch");
      expect(blSale.totalAmount).toBe(100);
      expect(blSale.reviewStatus).toBe("UNVERIFIED");
      expect(blSale.version).toBe(1);

      // QC posts same booklet+number succeeds (per-branch isolation)
      const qcSale = await createDirectSale(qcActor, {
        receiptBooklet: booklet,
        manualReceiptNumber: receiptNumber,
        amountPaid: 50,
        paymentMethod: "GCASH",
        lines: [{ productId: product.id, quantity: 1 }],
      });
      expect(qcSale.id).not.toBe(blSale.id);
      expect(qcSale.receiptBooklet).toBe(booklet);
      expect(qcSale.branch).toBe("QC Branch");

      // Duplicate same branch/booklet/number → 409
      await expect(
        createDirectSale(blActor, {
          receiptBooklet: booklet,
          manualReceiptNumber: receiptNumber,
          amountPaid: 50,
          paymentMethod: "CASH",
          lines: [{ productId: product.id, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: "DUPLICATE_RECEIPT", status: 409 });

      // Same number different booklet in same branch succeeds (different composite)
      const altBookletSale = await createDirectSale(blActor, {
        receiptBooklet: "BK-02",
        manualReceiptNumber: receiptNumber,
        amountPaid: 50,
        paymentMethod: "CASH",
        lines: [{ productId: product.id, quantity: 1 }],
      });
      expect(altBookletSale.receiptBooklet).toBe("BK-02");

      // Insufficient stock → 409 and leaves onHand unchanged
      const beforeBlBalance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { locationId_productId: { locationId: fixture.locations.branches.BL.id, productId: product.id } },
      });
      await expect(
        createDirectSale(blActor, {
          receiptBooklet: "BK-01",
          manualReceiptNumber: "0099",
          amountPaid: 1000,
          paymentMethod: "CASH",
          lines: [{ productId: product.id, quantity: 20 }],
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", status: 409 });
      const afterBlBalance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { locationId_productId: { locationId: fixture.locations.branches.BL.id, productId: product.id } },
      });
      expect(afterBlBalance.onHand).toBe(beforeBlBalance.onHand);
      expect(afterBlBalance.reserved).toBe(beforeBlBalance.reserved);

      // Server total validation (amountPaid mismatch)
      await expect(
        createDirectSale(blActor, {
          receiptBooklet: "BK-01",
          manualReceiptNumber: "0098",
          amountPaid: 999,
          paymentMethod: "CASH",
          lines: [{ productId: product.id, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: "INVALID_PAYMENT" });

      // Stock deduction check for BL sale (2 units from 10 → 8, QC sale 1 from 10→9 considering reserved)
      const blBalance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { locationId_productId: { locationId: fixture.locations.branches.BL.id, productId: product.id } },
      });
      // BL had 10, deduct 2 (blSale) +1 (altBookletSale) = 7 remaining
      expect(blBalance.onHand).toBe(7);
      expect(blBalance.version).toBeGreaterThan(1);
      const qcBalance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: { locationId_productId: { locationId: fixture.locations.branches.QC.id, productId: product.id } },
      });
      expect(qcBalance.onHand).toBe(9);
      // reserved should remain 1 for QC (not affected by direct sale)
      expect(qcBalance.reserved).toBe(1);

      // Movements immutable and present
      const blMovements = await prisma.inventoryMovement.findMany({
        where: { productId: product.id, locationId: fixture.locations.branches.BL.id, type: "DIRECT_SALE" },
      });
      expect(blMovements.length).toBeGreaterThanOrEqual(2);
      const qcMovements = await prisma.inventoryMovement.findMany({
        where: { productId: product.id, locationId: fixture.locations.branches.QC.id, type: "DIRECT_SALE" },
      });
      expect(qcMovements).toHaveLength(1);
      // Reference should contain receipt number
      expect(blMovements[0]?.reference).toContain(receiptNumber);

      // Prisma Decimal round-trip: stored Decimal equals serialized number via serializeSale
      const rawBlSale = await prisma.sale.findUniqueOrThrow({ where: { id: blSale.id } });
      expect(rawBlSale.totalAmount.toNumber()).toBe(100);
      expect(rawBlSale.totalAmount.toNumber()).toBe(blSale.totalAmount);

      // Sale survives reload via GET /api/sales/:id (service getSaleById)
      const reloaded = await getSaleById(blActor, blSale.id);
      expect(reloaded.id).toBe(blSale.id);
      expect(reloaded.receiptBooklet).toBe(booklet);
      expect(reloaded.reviewStatus).toBe("UNVERIFIED");

      // Branch staff cannot view QC sale via getSaleById (cross-branch isolation)
      await expect(getSaleById(blActor, qcSale.id)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      // Admin / Accounting can view any
      await expect(getSaleById(adminActor, blSale.id)).resolves.toMatchObject({ id: blSale.id });
      await expect(getSaleById(accountingActor, blSale.id)).resolves.toMatchObject({ id: blSale.id });

      // listSales branch scoping
      const blList = await listSales(blActor);
      expect(blList.every((s) => s.branch === "BL Branch")).toBe(true);
      expect(blList.find((s) => s.id === blSale.id)).toBeDefined();
      expect(blList.find((s) => s.id === qcSale.id)).toBeUndefined();

      // Accounting marks UNVERIFIED → VERIFIED
       const verified = await reviewSale(accountingActor, blSale.id, { status: "VERIFIED", comparison: matchingComparison(blSale) });
      expect(verified.status).toBe("VERIFIED");
      expect(verified.reviewedById).toBe(accounting.id);
      expect(verified.reviewedAt).toBeInstanceOf(Date);

      // Reload shows VERIFIED
      const afterVerify = await getSaleById(blActor, blSale.id);
      expect(afterVerify.reviewStatus).toBe("VERIFIED");

      // Second verify → 409 terminal guard
       await expect(reviewSale(accountingActor, blSale.id, { status: "VERIFIED", comparison: matchingComparison(blSale) })).rejects.toMatchObject({
        code: "INVALID_STATE",
        status: 409,
      });

      // BRANCH_STAFF cannot verify
       await expect(reviewSale(blActor, qcSale.id, { status: "VERIFIED", comparison: matchingComparison(qcSale) })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      // ADMIN cannot verify per ADR 0014 §2
       await expect(reviewSale(adminActor, qcSale.id, { status: "VERIFIED", comparison: matchingComparison(qcSale) })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

      // QC sale still UNVERIFIED, verify it succeeds then terminal
       await expect(reviewSale(accountingActor, qcSale.id, { status: "VERIFIED", comparison: matchingComparison(qcSale) })).resolves.toMatchObject({ status: "VERIFIED" });
       await expect(reviewSale(accountingActor, qcSale.id, { status: "VERIFIED", comparison: matchingComparison(qcSale) })).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  }, 60_000);
});

afterEach(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});

afterAll(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
