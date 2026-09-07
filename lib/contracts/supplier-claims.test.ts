import { describe, expect, it } from "vitest";
import { createSupplierClaimSchema, supplierClaimActionSchema } from "./supplier-claims";

describe("supplier claim contracts", () => {
  it("rejects an empty claimed quantity", () => {
    expect(createSupplierClaimSchema.safeParse({ idempotencyKey: "claim-key", supplierId: "s", locationId: "l", lines: [{ productId: "p", reason: "DAMAGE", quarantinedQuantity: 0, missingQuantity: 0, unitCost: 10 }] }).success).toBe(false);
  });

  it("requires positive action quantities", () => {
    expect(supplierClaimActionSchema.safeParse({ version: 1, idempotencyKey: "action-key", lines: [{ productId: "p", quantity: 0 }] }).success).toBe(false);
  });
});
