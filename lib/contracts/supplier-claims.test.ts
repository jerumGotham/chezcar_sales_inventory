import { describe, expect, it } from "vitest";
import { createSupplierClaimSchema, supplierClaimActionSchema } from "./supplier-claims";

describe("supplier claim contracts", () => {
  it("rejects an empty claimed quantity", () => {
    expect(createSupplierClaimSchema.safeParse({ idempotencyKey: "claim-key", supplierId: "s", locationId: "l", lines: [{ productId: "p", reason: "DAMAGE", quarantinedQuantity: 0, missingQuantity: 0, unitCost: 10 }] }).success).toBe(false);
  });

  it("requires positive action quantities", () => {
    expect(supplierClaimActionSchema.safeParse({ version: 1, idempotencyKey: "action-key", lines: [{ productId: "p", quantity: 0 }] }).success).toBe(false);
  });

  it("accepts at most two decimal places for unit cost", () => {
    const input = { idempotencyKey: "claim-key", supplierId: "s", locationId: "l", lines: [{ productId: "p", reason: "DAMAGE", quarantinedQuantity: 1, missingQuantity: 0, unitCost: 10.12 }] };
    expect(createSupplierClaimSchema.safeParse(input).success).toBe(true);
    expect(createSupplierClaimSchema.safeParse({ ...input, lines: [{ ...input.lines[0], unitCost: 10.123 }] }).success).toBe(false);
  });

  it("rejects duplicate action products", () => {
    expect(supplierClaimActionSchema.safeParse({ version: 1, idempotencyKey: "action-key", lines: [{ productId: "p", quantity: 1 }, { productId: "p", quantity: 1 }] }).success).toBe(false);
  });
});
