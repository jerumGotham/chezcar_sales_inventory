import { describe, expect, it } from "vitest";

import { warrantyActionSchema, warrantyCreateFieldsSchema } from "./customer-warranties";

describe("customer warranty contracts", () => {
  it("requires either a sale line or complete legacy attribution", () => {
    const base = { idempotencyKey: crypto.randomUUID(), locationId: "branch", claimQuantity: 1, concern: "Defective" };
    expect(warrantyCreateFieldsSchema.safeParse(base).success).toBe(false);
    expect(warrantyCreateFieldsSchema.safeParse({ ...base, saleLineId: "line" }).success).toBe(true);
    expect(warrantyCreateFieldsSchema.safeParse({ ...base, productId: "product", legacyCustomerName: "Legacy Customer", legacyReason: "Paper record" }).success).toBe(true);
  });

  it("requires an idempotency key and optimistic version for actions", () => {
    expect(warrantyActionSchema.safeParse({ idempotencyKey: crypto.randomUUID(), version: 1 }).success).toBe(true);
    expect(warrantyActionSchema.safeParse({ idempotencyKey: "not-a-uuid", version: 0 }).success).toBe(false);
  });
});
