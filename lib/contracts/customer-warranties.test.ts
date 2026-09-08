import { describe, expect, it } from "vitest";

import { returnWarrantyToCustomerSchema, warrantyActionSchema, warrantyCreateFieldsSchema, warrantyCreatePhotoSchema } from "./customer-warranties";

describe("customer warranty contracts", () => {
  it("accepts an omitted intake photo or the browser's empty file placeholder", () => {
    expect(warrantyCreatePhotoSchema.parse(undefined)).toBeUndefined();
    expect(warrantyCreatePhotoSchema.parse(null)).toBeUndefined();
    expect(warrantyCreatePhotoSchema.parse(new File([], ""))).toBeUndefined();
    const photo = new File(["image bytes"], "intake.jpg", { type: "image/jpeg" });
    expect(warrantyCreatePhotoSchema.parse(photo)).toBe(photo);
    expect(warrantyCreatePhotoSchema.safeParse("not a file").success).toBe(false);
    // A selected empty file still reaches the storage validator and is rejected there.
    const emptyPhoto = new File([], "empty.jpg", { type: "image/jpeg" });
    expect(warrantyCreatePhotoSchema.parse(emptyPhoto)).toBe(emptyPhoto);
  });

  it("requires either a sale line or complete legacy attribution", () => {
    const base = { idempotencyKey: crypto.randomUUID(), locationId: "branch", claimQuantity: 1, concern: "Defective" };
    expect(warrantyCreateFieldsSchema.safeParse(base).success).toBe(false);
    expect(warrantyCreateFieldsSchema.safeParse({ ...base, saleLineId: "line" }).success).toBe(true);
    expect(warrantyCreateFieldsSchema.safeParse({ ...base, productId: "product", legacyCustomerName: "Legacy Customer", legacyReason: "Paper record", warrantyBasisMonths: 12, warrantyBasisReason: "Documented paper warranty" }).success).toBe(true);
  });

  it("requires an idempotency key and optimistic version for actions", () => {
    expect(warrantyActionSchema.safeParse({ idempotencyKey: crypto.randomUUID(), version: 1 }).success).toBe(true);
    expect(warrantyActionSchema.safeParse({ idempotencyKey: "not-a-uuid", version: 0 }).success).toBe(false);
  });

  it("requires quantity and a reason when returning an unrepaired item", () => {
    const base = { idempotencyKey: crypto.randomUUID(), version: 1, quantity: 1 };
    expect(returnWarrantyToCustomerSchema.safeParse(base).success).toBe(false);
    expect(returnWarrantyToCustomerSchema.safeParse({ ...base, notes: "Customer declined repair" }).success).toBe(true);
  });
});
