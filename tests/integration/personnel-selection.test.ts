import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

describe("actor-scoped transaction personnel", () => {
  it("uses authorized personnel locations for options, offline snapshots, sales and order release", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "personnel-scope-sales" });
      const qc = fixture.locations.branches.QC;
      const bl = fixture.locations.branches.BL;
      const scoped = authContextFor(fixture.users.branchStaff, qc);
      const all = { ...scoped, isOwner: false, capabilities: [...scoped.capabilities, "locations:all"] };
      const multi = { ...scoped, locationIds: [qc.id, bl.id] };
      const { listActiveSalespersonOptions } = await import("../../lib/server/services/personnel");
      const { createDirectSale, createCustomerOrder, updateCustomerOrderSalesperson, releaseCustomerOrder } = await import("../../lib/server/services/customer-sales");
      const { activateOfflineDevice, getOfflineSnapshot, syncOfflineSale } = await import("../../lib/server/services/offline-sales");
      const remote = fixture.salespersons.BL;
      const both = await prisma.personnel.create({ data: { fullName: "Remote Both", locationId: bl.id, type: "BOTH" } });
      const inactive = await prisma.personnel.create({ data: { fullName: "Inactive", locationId: bl.id, type: "SALESPERSON", status: "INACTIVE" } });
      const installer = await prisma.personnel.create({ data: { fullName: "Installer", locationId: bl.id, type: "INSTALLER" } });
      expect((await listActiveSalespersonOptions(all, qc.id)).map((row) => row.id)).toEqual(expect.arrayContaining([remote.id, both.id]));
      expect((await listActiveSalespersonOptions(scoped, qc.id)).every((row) => row.locationId === qc.id)).toBe(true);
      expect((await listActiveSalespersonOptions(multi, qc.id)).map((row) => row.id)).toContain(remote.id);
      await expect(listActiveSalespersonOptions(scoped, bl.id)).rejects.toThrow();

      const offlineActor = { ...all, capabilities: [...all.capabilities, "offline-sales:activate-device", "offline-sales:snapshot", "offline-sales:sync"] };
      await activateOfflineDevice(offlineActor, { locationId: qc.id, deviceId: "personnel-scope-device" });
      expect((await getOfflineSnapshot(offlineActor, { deviceId: "personnel-scope-device" })).salespersons.map((row) => row.id)).toContain(remote.id);
      const scopedSnapshotActor = { ...offlineActor, capabilities: offlineActor.capabilities.filter((capability) => capability !== "locations:all") };
      expect((await getOfflineSnapshot(scopedSnapshotActor, { deviceId: "personnel-scope-device" })).salespersons.every((row) => row.locationId === qc.id)).toBe(true);

      const product = await prisma.product.create({ data: { itemCode: "PERSONNEL-SCOPE", name: "Scope", price: 50, status: "ACTIVE" } });
      await prisma.inventoryBalance.create({ data: { locationId: qc.id, productId: product.id, onHand: 10, unitCost: 10 } });
      const saleInput = { locationId: qc.id, salespersonId: remote.id, manualReceiptNumber: "SCOPE-SALE", paymentMethod: "CASH" as const, amountPaid: 50, lines: [{ productId: product.id, quantity: 1 }] };
      await expect(createDirectSale(scoped, saleInput)).rejects.toMatchObject({ code: "INVALID_SALESPERSON" });
      await expect(createDirectSale(scoped, { ...saleInput, locationId: bl.id, salespersonId: fixture.salespersons.QC.id })).rejects.toThrow();
      for (const salespersonId of [inactive.id, installer.id, "missing"]) {
        await expect(createDirectSale(all, { ...saleInput, salespersonId })).rejects.toMatchObject({ code: "INVALID_SALESPERSON" });
      }
      await expect(prisma.sale.count()).resolves.toBe(0);
      await expect(prisma.inventoryBalance.findFirstOrThrow({ where: { productId: product.id } })).resolves.toMatchObject({ onHand: 10 });
      const sale = await createDirectSale(all, saleInput);
      expect(sale.salesperson).toMatchObject({ personnelId: remote.id, branch: { id: bl.id } });
      await expect(prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).resolves.toMatchObject({ locationId: qc.id, salespersonLocationId: bl.id });
      await createDirectSale(multi, { ...saleInput, manualReceiptNumber: "SCOPE-MULTI", salespersonId: both.id });
      const offlineInput = { deviceId: "personnel-scope-device", idempotencyKey: randomUUID(), occurredAt: new Date().toISOString(), operationType: "DIRECT_SALE", payload: { ...saleInput, manualReceiptNumber: "SCOPE-OFFLINE" } };
      await expect(syncOfflineSale(scopedSnapshotActor, offlineInput)).resolves.toMatchObject({ status: "NEEDS_REVIEW" });
      await expect(syncOfflineSale(offlineActor, { ...offlineInput, idempotencyKey: randomUUID() })).resolves.toMatchObject({ status: "ACCEPTED" });

      const orderInput = { locationId: qc.id, salespersonId: remote.id, customer: { name: "Scope Customer" }, type: "RESERVATION_NO_DP" as const, downpaymentAmount: 0, lines: [{ productId: product.id, quantity: 1 }] };
      await expect(createCustomerOrder(scoped, orderInput)).rejects.toMatchObject({ code: "INVALID_SALESPERSON" });
      const order = await createCustomerOrder(all, orderInput);
      await expect(updateCustomerOrderSalesperson(scoped, order.id, { salespersonId: both.id })).rejects.toMatchObject({ code: "INVALID_SALESPERSON" });
      await updateCustomerOrderSalesperson(all, order.id, { salespersonId: both.id });
      const release = { finalReceiptNumber: "SCOPE-RELEASE", amountPaid: 50, paymentMethod: "CASH" as const };
      await expect(releaseCustomerOrder(scoped, order.id, release)).rejects.toMatchObject({ code: "INVALID_SALESPERSON" });
      await releaseCustomerOrder(all, order.id, release);
      await expect(prisma.sale.findFirstOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ locationId: qc.id, salespersonId: both.id, salespersonLocationId: bl.id });

      await prisma.location.update({ where: { id: bl.id }, data: { isActive: false } });
      expect((await listActiveSalespersonOptions(all, qc.id)).map((row) => row.id)).not.toContain(remote.id);
      await expect(createDirectSale(all, { ...saleInput, manualReceiptNumber: "INACTIVE-BRANCH" })).rejects.toMatchObject({ code: "INVALID_SALESPERSON" });
    });
  }, 30_000);

  it("applies installer scope consistently at options, schedule, start and completion", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "personnel-scope-backjobs" });
      const qc = fixture.locations.branches.QC;
      const bl = fixture.locations.branches.BL;
      const scoped = { ...authContextFor(fixture.users.branchStaff, qc), capabilities: ["backjobs:view", "backjobs:schedule", "backjobs:update", "backjobs:complete"] };
      const all = { ...scoped, isOwner: false, capabilities: [...scoped.capabilities, "locations:all"] };
      const installer = await prisma.personnel.create({ data: { fullName: "Remote Installer", locationId: bl.id, type: "BOTH" } });
      const customer = await prisma.customer.create({ data: { name: "Backjob Customer" } });
      const row = await prisma.backjob.create({ data: { reference: "SCOPE-BJ", locationId: qc.id, customerId: customer.id, customerName: customer.name, locationCode: qc.code, locationName: qc.name, concern: "Scope", isLegacy: true, coverage: "COVERED", createdById: scoped.userId } });
      const { getBackjob, scheduleBackjob, startBackjob, completeBackjob } = await import("../../lib/server/services/backjobs");
      expect((await getBackjob(all, row.id)).options.installers.map((item) => item.id)).toContain(installer.id);
      expect((await getBackjob(scoped, row.id)).options.installers.map((item) => item.id)).not.toContain(installer.id);
      const schedule = { version: row.version, installerId: installer.id, scheduledFor: new Date(Date.now() + 86_400_000).toISOString() };
      await expect(scheduleBackjob(scoped, row.id, schedule)).rejects.toMatchObject({ code: "INVALID_INSTALLER" });
      await expect(scheduleBackjob(all, row.id, { ...schedule, installerId: fixture.salespersons.BL.id })).rejects.toMatchObject({ code: "INVALID_INSTALLER" });
      await prisma.location.update({ where: { id: bl.id }, data: { isActive: false } });
      expect((await getBackjob(all, row.id)).options.installers.map((item) => item.id)).not.toContain(installer.id);
      await expect(scheduleBackjob(all, row.id, schedule)).rejects.toMatchObject({ code: "INVALID_INSTALLER" });
      await prisma.location.update({ where: { id: bl.id }, data: { isActive: true } });
      const scheduled = await scheduleBackjob(all, row.id, schedule);
      expect(scheduled).toMatchObject({ locationId: qc.id, installerLocationId: bl.id });
      await expect(startBackjob(scoped, row.id, scheduled.version)).rejects.toMatchObject({ code: "INVALID_INSTALLER" });
      await prisma.personnel.update({ where: { id: installer.id }, data: { status: "INACTIVE" } });
      await expect(startBackjob(all, row.id, scheduled.version)).rejects.toMatchObject({ code: "INVALID_INSTALLER" });
      await prisma.personnel.update({ where: { id: installer.id }, data: { status: "ACTIVE" } });
      const started = await startBackjob(all, row.id, scheduled.version);
      const completion = { version: started.version, workPerformed: "Fixed", acknowledgementMethod: "VERBAL" as const, acknowledgedByName: customer.name };
      await expect(completeBackjob(scoped, row.id, completion)).rejects.toMatchObject({ code: "INVALID_INSTALLER" });
      await prisma.personnel.update({ where: { id: installer.id }, data: { type: "SALESPERSON" } });
      await expect(completeBackjob(all, row.id, completion)).rejects.toMatchObject({ code: "INVALID_INSTALLER" });
      await prisma.personnel.update({ where: { id: installer.id }, data: { type: "INSTALLER" } });
      await expect(completeBackjob(all, row.id, completion)).resolves.toMatchObject({ status: "COMPLETED", installerLocationId: bl.id });
      const outside = { ...scoped, locationIds: [bl.id] };
      await expect(getBackjob(outside, row.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(scheduleBackjob(outside, row.id, schedule)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  }, 30_000);
});

afterEach(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
