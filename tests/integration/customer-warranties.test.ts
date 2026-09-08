import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

const environment = vi.hoisted(() => { process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public"; return {}; });
void environment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

describe("customer warranties", () => {
  it("receives a verified sold item into quarantine and idempotently releases a repair", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "warranty-flow" });
      const location = fixture.locations.branches.QC;
      const actor = authContextFor(fixture.users.admin, null);
      const customer = await prisma.customer.create({ data: { name: "Warranty Customer" } });
      const product = await prisma.product.create({ data: { itemCode: "WARRANTY-ITEM", name: "Warranty Item", warrantyDurationMonths: 12 } });
      const sale = await prisma.sale.create({ data: { reference: "SALE-WARRANTY-1", manualReceiptNumber: "WR-1", locationId: location.id, customerId: customer.id, status: "POSTED", paymentMethod: "CASH", totalAmount: 100, amountPaid: 100, postedById: fixture.users.admin.id, lines: { create: { productId: product.id, productItemCode: product.itemCode, productName: product.name, quantity: 2, unitPrice: 50 } }, accountingReview: { create: { status: "VERIFIED" } } }, include: { lines: true } });
      const { actOnCustomerWarranty, createCustomerWarranty } = await import("../../lib/server/services/customer-warranties");
      const createInput = { idempotencyKey: crypto.randomUUID(), locationId: location.id, saleLineId: sale.lines[0].id, claimQuantity: 2, concern: "Failed in use", warrantyBasisMonths: 12, warrantyBasisReason: "Test sale predates snapshot fixture" };
      const evidence = { key: `${crypto.randomUUID()}.jpg`, contentHash: "a".repeat(64), contentType: "image/jpeg", fileName: "item.jpg" };
      const [created, createReplay] = await Promise.all([
        createCustomerWarranty(actor, createInput, evidence),
        createCustomerWarranty(actor, createInput, { ...evidence, key: `${crypto.randomUUID()}.jpg` }),
      ]);
      expect(createReplay.warranty.id).toBe(created.warranty.id);
      expect([created.evidenceUsed, createReplay.evidenceUsed].sort()).toEqual([false, true]);
      await expect(createCustomerWarranty(actor, createInput, { ...evidence, key: `${crypto.randomUUID()}.jpg`, contentHash: "b".repeat(64) })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      let warranty = await actOnCustomerWarranty(actor, created.warranty.id, "receive-quarantine", { idempotencyKey: crypto.randomUUID(), version: 1, quantity: 2 });
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: product.id } } })).resolves.toMatchObject({ onHand: 2, quarantined: 2 });
      warranty = await actOnCustomerWarranty(actor, created.warranty.id, "approve-repair", { idempotencyKey: crypto.randomUUID(), version: warranty.version, targetDate: new Date(Date.now() + 86_400_000).toISOString() });
      warranty = await actOnCustomerWarranty(actor, warranty.id, "mark-ready", { idempotencyKey: crypto.randomUUID(), version: warranty.version });
      const releaseKey = crypto.randomUUID();
      const [released, replay] = await Promise.all([
        actOnCustomerWarranty(actor, warranty.id, "release", { idempotencyKey: releaseKey, version: warranty.version }),
        actOnCustomerWarranty(actor, warranty.id, "release", { idempotencyKey: releaseKey, version: warranty.version }),
      ]);
      expect(released.status).toBe("RELEASED"); expect(replay.version).toBe(released.version);
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: product.id } } })).resolves.toMatchObject({ onHand: 0, quarantined: 0 });
      await expect(prisma.customerWarrantyEvent.update({ where: { id: released.events[0].id }, data: { type: "TAMPERED" } })).rejects.toThrow();
    });
  }, 30_000);

  it("tracks current warranty quarantine through bounded supplier claims", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "warranty-supplier-claim" });
      const location = fixture.locations.branches.QC;
      const actor = authContextFor(fixture.users.admin, null);
      const product = await prisma.product.create({ data: { itemCode: "WARRANTY-SUPPLIER", name: "Warranty Supplier Item" } });
      const allocationProduct = await prisma.product.create({ data: { itemCode: "CLAIM-ALLOCATION", name: "Claim Allocation Item" } });
      const supplier = await prisma.supplier.create({ data: { name: "Warranty Supplier" } });
      const { actOnCustomerWarranty, createCustomerWarranty } = await import("../../lib/server/services/customer-warranties");
      const { actOnSupplierClaim, addSupplierClaimSettlement, createSupplierClaim } = await import("../../lib/server/services/supplier-claims");

      const missingClaim = await createSupplierClaim(actor, { idempotencyKey: crypto.randomUUID(), supplierId: supplier.id, locationId: location.id, lines: [{ productId: product.id, reason: "INCOMPLETE", quarantinedQuantity: 0, missingQuantity: 1, unitCost: 10 }] });
      const cancelled = await actOnSupplierClaim(actor, missingClaim.id, "cancel", { idempotencyKey: crypto.randomUUID(), version: missingClaim.version, lines: [] });
      expect(cancelled).toMatchObject({ status: "CANCELLED", lines: [{ openMissingQuantity: 0, openQuarantinedQuantity: 0 }] });

      await prisma.inventoryBalance.create({ data: { locationId: location.id, productId: product.id, onHand: 1, quarantined: 1 } });
      const quarantinedDraft = await createSupplierClaim(actor, { idempotencyKey: crypto.randomUUID(), supplierId: supplier.id, locationId: location.id, lines: [{ productId: product.id, reason: "DEFECT", quarantinedQuantity: 1, missingQuantity: 0, unitCost: 10 }] });
      await expect(actOnSupplierClaim(actor, quarantinedDraft.id, "cancel", { idempotencyKey: crypto.randomUUID(), version: quarantinedDraft.version, lines: [] })).rejects.toMatchObject({ code: "QUARANTINE_DISPOSITION_REQUIRED" });
      await expect(actOnSupplierClaim(actor, quarantinedDraft.id, "return-to-supplier", { idempotencyKey: crypto.randomUUID(), version: quarantinedDraft.version, lines: [] })).rejects.toMatchObject({ code: "INVALID_LINES" });
      await expect(actOnSupplierClaim(actor, quarantinedDraft.id, "return-to-supplier", { idempotencyKey: crypto.randomUUID(), version: quarantinedDraft.version, lines: [{ productId: allocationProduct.id, quantity: 1 }] })).rejects.toMatchObject({ code: "INVALID_LINES" });
      await expect(actOnSupplierClaim(actor, quarantinedDraft.id, "return-to-supplier", { idempotencyKey: crypto.randomUUID(), version: quarantinedDraft.version, lines: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 1 }] })).rejects.toMatchObject({ code: "INVALID_LINES" });
      await expect(actOnSupplierClaim(actor, quarantinedDraft.id, "receive-replacement", { idempotencyKey: crypto.randomUUID(), version: quarantinedDraft.version, lines: [{ productId: product.id, quantity: 1 }] })).rejects.toMatchObject({ code: "INVALID_LINES" });

      await prisma.inventoryBalance.create({ data: { locationId: location.id, productId: allocationProduct.id, onHand: 1, quarantined: 1 } });
      const allocationInput = { supplierId: supplier.id, locationId: location.id, lines: [{ productId: allocationProduct.id, reason: "DEFECT" as const, quarantinedQuantity: 1, missingQuantity: 0, unitCost: 10 }] };
      const allocationResults = await Promise.allSettled([
        createSupplierClaim(actor, { ...allocationInput, idempotencyKey: crypto.randomUUID() }),
        createSupplierClaim(actor, { ...allocationInput, idempotencyKey: crypto.randomUUID() }),
      ]);
      expect(allocationResults.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
      const rejectedAllocation = allocationResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(rejectedAllocation?.reason).toMatchObject({ code: "QUARANTINE_EXCEEDED" });

      let warranty = (await createCustomerWarranty(actor, { idempotencyKey: crypto.randomUUID(), locationId: location.id, productId: product.id, claimQuantity: 2, concern: "Supplier-covered defect", warrantyBasisMonths: 12, warrantyBasisReason: "Legacy test basis", legacyCustomerName: "Legacy Customer", legacyReason: "Legacy test sale" }, { key: `${crypto.randomUUID()}.jpg`, contentHash: "c".repeat(64), contentType: "image/jpeg", fileName: "warranty.jpg" })).warranty;
      warranty = await actOnCustomerWarranty(actor, warranty.id, "receive-quarantine", { idempotencyKey: crypto.randomUUID(), version: warranty.version, quantity: 2 });
      await expect(actOnCustomerWarranty(actor, warranty.id, "reject", { idempotencyKey: crypto.randomUUID(), version: warranty.version })).rejects.toMatchObject({ code: "QUARANTINE_UNRESOLVED" });
      await expect(createSupplierClaim(actor, { idempotencyKey: crypto.randomUUID(), supplierId: supplier.id, locationId: location.id, lines: [{ productId: product.id, reason: "WARRANTY", quarantinedQuantity: 1, missingQuantity: 0, unitCost: 10 }] })).rejects.toMatchObject({ code: "QUARANTINE_EXCEEDED" });

      const claimInput = { idempotencyKey: crypto.randomUUID(), supplierId: supplier.id, locationId: location.id, customerWarrantyId: warranty.id, lines: [{ productId: product.id, reason: "WARRANTY" as const, quarantinedQuantity: 2, missingQuantity: 0, unitCost: 10 }] };
      await expect(createSupplierClaim(actor, claimInput)).rejects.toMatchObject({ code: "INVALID_WARRANTY_STATE" });
      warranty = await actOnCustomerWarranty(actor, warranty.id, "approve-replacement", { idempotencyKey: crypto.randomUUID(), version: warranty.version, targetDate: new Date(Date.now() + 86_400_000).toISOString() });
      const [claim, claimReplay] = await Promise.all([createSupplierClaim(actor, claimInput), createSupplierClaim(actor, claimInput)]);
      expect(claimReplay.id).toBe(claim.id);
      await expect(createSupplierClaim(actor, { ...claimInput, idempotencyKey: crypto.randomUUID(), lines: [{ ...claimInput.lines[0], quarantinedQuantity: 1 }] })).rejects.toMatchObject({ code: "QUANTITY_EXCEEDED" });

      const submitKey = crypto.randomUUID();
      const submitInput = { idempotencyKey: submitKey, version: claim.version, targetDate: new Date(Date.now() + 86_400_000).toISOString(), lines: [] };
      const [submitted, submitReplay] = await Promise.all([actOnSupplierClaim(actor, claim.id, "submit", submitInput), actOnSupplierClaim(actor, claim.id, "submit", submitInput)]);
      expect(submitReplay.version).toBe(submitted.version);
      const returned = await actOnSupplierClaim(actor, claim.id, "return-to-supplier", { idempotencyKey: crypto.randomUUID(), version: submitted.version, lines: [{ productId: product.id, quantity: 2 }] });
      const settlementInput = { idempotencyKey: crypto.randomUUID(), type: "REFUND" as const, amount: 20, currency: "PHP", reference: "REFUND-1", lines: [{ productId: product.id, quantity: 2 }] };
      const [settlement, settlementReplay] = await Promise.all([addSupplierClaimSettlement(actor, returned.id, settlementInput), addSupplierClaimSettlement(actor, returned.id, settlementInput)]);
      expect(settlementReplay.id).toBe(settlement.id);

      await prisma.customerWarranty.update({ where: { id: warranty.id }, data: { status: "ASSESSMENT" } });
      const rejected = await actOnCustomerWarranty(actor, warranty.id, "reject", { idempotencyKey: crypto.randomUUID(), version: warranty.version });
      expect(rejected.status).toBe("REJECTED");
    });
  }, 30_000);

  it("returns only unassigned assessment custody to the customer before rejection", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "warranty-customer-return" });
      const location = fixture.locations.branches.QC;
      const actor = authContextFor(fixture.users.admin, null);
      const product = await prisma.product.create({ data: { itemCode: "WARRANTY-RETURN", name: "Warranty Return Item" } });
      const { actOnCustomerWarranty, createCustomerWarranty } = await import("../../lib/server/services/customer-warranties");
      const createInput = { idempotencyKey: crypto.randomUUID(), locationId: location.id, productId: product.id, claimQuantity: 2, concern: "Customer declined repair", warrantyBasisMonths: 12, warrantyBasisReason: "Legacy test basis", legacyCustomerName: "Return Customer", legacyReason: "Legacy test sale" };
      const created = await createCustomerWarranty(actor, createInput);
      expect(created).toMatchObject({ created: true, evidenceUsed: false, warranty: { intakePhotoKey: null, intakePhotoType: null, intakePhotoName: null } });
      const createReplay = await createCustomerWarranty(actor, createInput);
      expect(createReplay).toMatchObject({ created: false, evidenceUsed: false, warranty: { id: created.warranty.id } });
      await expect(createCustomerWarranty(actor, createInput, { key: `${crypto.randomUUID()}.jpg`, contentHash: "d".repeat(64), contentType: "image/jpeg", fileName: "return.jpg" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      let warranty = created.warranty;
      warranty = await actOnCustomerWarranty(actor, warranty.id, "receive-quarantine", { idempotencyKey: crypto.randomUUID(), version: warranty.version, quantity: 2 });

      const returnKey = crypto.randomUUID();
      const returned = await actOnCustomerWarranty(actor, warranty.id, "return-to-customer", { idempotencyKey: returnKey, version: warranty.version, quantity: 1, notes: "Returned unrepaired at customer request" });
      const replay = await actOnCustomerWarranty(actor, warranty.id, "return-to-customer", { idempotencyKey: returnKey, version: warranty.version, quantity: 1, notes: "Returned unrepaired at customer request" });
      expect(returned).toMatchObject({ status: "ASSESSMENT", receivedQuantity: 2, returnedQuantity: 1 });
      expect(replay.version).toBe(returned.version);
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: product.id } } })).resolves.toMatchObject({ onHand: 1, quarantined: 1 });
      await expect(actOnCustomerWarranty(actor, warranty.id, "approve-repair", { idempotencyKey: crypto.randomUUID(), version: returned.version, targetDate: new Date(Date.now() + 86_400_000).toISOString() })).rejects.toMatchObject({ code: "RETURN_ALREADY_STARTED" });
      await expect(actOnCustomerWarranty(actor, warranty.id, "reject", { idempotencyKey: crypto.randomUUID(), version: returned.version })).rejects.toMatchObject({ code: "QUARANTINE_UNRESOLVED" });

      const fullyReturned = await actOnCustomerWarranty(actor, warranty.id, "return-to-customer", { idempotencyKey: crypto.randomUUID(), version: returned.version, quantity: 1, notes: "Returned remaining unrepaired item" });
      const rejected = await actOnCustomerWarranty(actor, warranty.id, "reject", { idempotencyKey: crypto.randomUUID(), version: fullyReturned.version, notes: "Customer declined warranty service" });
      expect(rejected.status).toBe("REJECTED");
      await expect(prisma.inventoryBalance.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: product.id } } })).resolves.toMatchObject({ onHand: 0, quarantined: 0 });
      await expect(prisma.inventoryMovement.aggregate({ where: { warrantyId: warranty.id, type: "WARRANTY_RELEASE" }, _sum: { quantity: true }, _count: true })).resolves.toMatchObject({ _sum: { quantity: -2 }, _count: 2 });
    });
  }, 30_000);
});

afterEach(async () => { const { prisma } = await import("../../lib/server/prisma"); await prisma.$disconnect(); });
afterAll(async () => { const { prisma } = await import("../../lib/server/prisma"); await prisma.$disconnect(); });
