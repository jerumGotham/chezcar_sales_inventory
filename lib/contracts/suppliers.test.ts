import { describe, expect, it } from "vitest";

import {
  createSupplierSchema,
  supplierStatusRequestSchema,
  updateSupplierSchema,
} from "./suppliers";

describe("supplier contracts", () => {
  it("normalizes supplier master-data input", () => {
    expect(createSupplierSchema.parse({
      code: " acme-01 ",
      name: " Acme Trading ",
      contactPerson: " ",
      email: "sales@example.com",
    })).toMatchObject({
      code: "ACME-01",
      name: "Acme Trading",
      contactPerson: null,
      email: "sales@example.com",
    });
  });

  it("rejects blank names, malformed emails, and empty updates", () => {
    expect(() => createSupplierSchema.parse({ name: " " })).toThrow();
    expect(() => createSupplierSchema.parse({ name: "Acme", email: "invalid" })).toThrow();
    expect(() => updateSupplierSchema.parse({})).toThrow();
  });

  it("accepts only explicit lifecycle states", () => {
    expect(supplierStatusRequestSchema.parse({ status: "INACTIVE" })).toEqual({ status: "INACTIVE" });
    expect(() => supplierStatusRequestSchema.parse({ status: "DELETED" })).toThrow();
  });
});
