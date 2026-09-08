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

describe("salesperson transaction attribution", () => {
  it("snapshots a branch salesperson separately from the encoder", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "salesperson-sale" });
      const branch = fixture.locations.branches.QC;
      const salesperson = fixture.salespersons.QC;
      const product = await prisma.product.create({ data: { itemCode: "ATTR-SALE", name: "Attributed Sale", price: 50, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: product.id, onHand: 3, unitCost: 10 } });
      const { createDirectSale, getSaleById } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, branch);

      const sale = await createDirectSale(branchActor, {
        locationId: branch.id,
        salespersonId: salesperson.id,
        manualReceiptNumber: "ATTR-001",
        paymentMethod: "CASH",
        amountPaid: 50,
        lines: [{ productId: product.id, quantity: 1 }],
      });
      expect(sale).toMatchObject({
        postedBy: fixture.users.branchStaff.name,
        salesperson: { personnelId: salesperson.id, name: salesperson.fullName, branch: { id: branch.id, code: branch.code, name: branch.name } },
      });

      await prisma.personnel.update({ where: { id: salesperson.id }, data: { fullName: "Renamed Salesperson", status: "INACTIVE" } });
      await expect(getSaleById(branchActor, sale.id)).resolves.toMatchObject({
        salesperson: { personnelId: salesperson.id, name: salesperson.fullName },
      });
    });
  }, 30_000);

  it("rejects ineligible salespersons without changing stock", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "salesperson-invalid" });
      const branch = fixture.locations.branches.QC;
      const product = await prisma.product.create({ data: { itemCode: "ATTR-INVALID", name: "Invalid Attribution", price: 20, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: product.id, onHand: 2, unitCost: 5 } });
      const installer = await prisma.personnel.create({ data: { fullName: "Installer Only", locationId: branch.id, type: "INSTALLER" } });
      const { createDirectSale } = await import("../../lib/server/services/customer-sales");

      await expect(createDirectSale(actor(fixture.users.branchStaff, branch), {
        locationId: branch.id,
        salespersonId: installer.id,
        manualReceiptNumber: "ATTR-INVALID-001",
        paymentMethod: "CASH",
        amountPaid: 20,
        lines: [{ productId: product.id, quantity: 1 }],
      })).rejects.toMatchObject({ code: "INVALID_SALESPERSON" });
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 2 });
      await expect(prisma.sale.count()).resolves.toBe(0);
    });
  }, 30_000);

  it("copies Customer Order attribution to the released Sale and revalidates stale assignments", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "salesperson-order" });
      const branch = fixture.locations.branches.QC;
      const salesperson = fixture.salespersons.QC;
      const product = await prisma.product.create({ data: { itemCode: "ATTR-ORDER", name: "Attributed Order", price: 100, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: branch.id, productId: product.id, onHand: 2, unitCost: 20 } });
      const { createCustomerOrder, releaseCustomerOrder, updateCustomerOrderSalesperson } = await import("../../lib/server/services/customer-sales");
      const branchActor = actor(fixture.users.branchStaff, branch);
      const order = await createCustomerOrder(branchActor, {
        locationId: branch.id,
        salespersonId: salesperson.id,
        customer: { name: "Attributed Customer" },
        type: "RESERVATION_NO_DP",
        downpaymentAmount: 0,
        lines: [{ productId: product.id, quantity: 1 }],
      });
      expect(order.salesperson).toMatchObject({ personnelId: salesperson.id, name: salesperson.fullName });

      await prisma.personnel.update({ where: { id: salesperson.id }, data: { status: "INACTIVE" } });
      await expect(releaseCustomerOrder(branchActor, order.id, { finalReceiptNumber: "ATTR-ORDER-001", amountPaid: 100, paymentMethod: "CASH" })).rejects.toMatchObject({ code: "INVALID_SALESPERSON" });

      const replacement = await prisma.personnel.create({ data: { fullName: "Replacement Salesperson", locationId: branch.id, type: "SALESPERSON" } });
      await updateCustomerOrderSalesperson(branchActor, order.id, { salespersonId: replacement.id });
      await updateCustomerOrderSalesperson(branchActor, order.id, { salespersonId: replacement.id });
      const reassignment = await prisma.customerOrderSalespersonEvent.findFirstOrThrow({ where: { orderId: order.id } });
      expect(reassignment).toMatchObject({
        previousSalespersonId: salesperson.id,
        previousSalespersonName: salesperson.fullName,
        previousSalespersonLocationId: branch.id,
        previousSalespersonLocationCode: branch.code,
        previousSalespersonLocationName: branch.name,
        newSalespersonId: replacement.id,
        newSalespersonName: replacement.fullName,
        newSalespersonLocationId: branch.id,
        newSalespersonLocationCode: branch.code,
        newSalespersonLocationName: branch.name,
        actorId: branchActor.userId,
      });
      await expect(prisma.customerOrderSalespersonEvent.count({ where: { orderId: order.id } })).resolves.toBe(1);
      await expect(prisma.customerOrderSalespersonEvent.update({ where: { id: reassignment.id }, data: { newSalespersonName: "Tampered" } })).rejects.toThrow();
      await releaseCustomerOrder(branchActor, order.id, { finalReceiptNumber: "ATTR-ORDER-001", amountPaid: 100, paymentMethod: "CASH" });
      await expect(prisma.sale.findFirstOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({
        salespersonId: replacement.id,
        salespersonName: replacement.fullName,
        postedById: branchActor.userId,
      });
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
