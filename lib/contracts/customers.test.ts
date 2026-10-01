import { describe, expect, it } from "vitest";

import {
  CUSTOMER_TYPE_OPTIONS,
  CUSTOMER_TYPES,
  customerNameLabel,
  customerOptionLabel,
  customerTypeLabel,
  customerTypeSchema,
  DEFAULT_CUSTOMER_TYPE,
} from "./customers";

describe("customer type", () => {
  it("accepts the four kinds of party the business sells to", () => {
    for (const type of CUSTOMER_TYPES) {
      expect(customerTypeSchema.parse(type)).toBe(type);
    }
  });

  it("rejects a type it does not define", () => {
    expect(customerTypeSchema.safeParse("PARTNERSHIP").success).toBe(false);
  });

  it("offers every type as a dropdown option, in order", () => {
    expect(CUSTOMER_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      ...CUSTOMER_TYPES,
    ]);
    expect(CUSTOMER_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      "Individual",
      "Company",
      "Government",
      "Religious Organization",
    ]);
  });
});

describe("customerNameLabel", () => {
  it("names the field for the kind of party", () => {
    expect(customerNameLabel("INDIVIDUAL")).toBe("Customer Name");
    expect(customerNameLabel("COMPANY")).toBe("Company Name");
    expect(customerNameLabel("GOVERNMENT")).toBe("Agency Name");
    expect(customerNameLabel("RELIGIOUS_ORGANIZATION")).toBe("Organization Name");
  });

  it("falls back to the individual wording for a customer stored before the type existed", () => {
    expect(customerNameLabel(null)).toBe(customerNameLabel(DEFAULT_CUSTOMER_TYPE));
    expect(customerNameLabel(undefined)).toBe("Customer Name");
  });
});

describe("customerOptionLabel", () => {
  it("reads as name then type, so a person and their company are told apart", () => {
    expect(customerOptionLabel("Juan Dela Cruz", "INDIVIDUAL")).toBe(
      "Juan Dela Cruz - Individual",
    );
    expect(customerOptionLabel("Dela Cruz Trading", "COMPANY")).toBe(
      "Dela Cruz Trading - Company",
    );
    expect(customerOptionLabel("LTO Region IV", "GOVERNMENT")).toBe(
      "LTO Region IV - Government",
    );
    expect(customerOptionLabel("St. Jude Parish", "RELIGIOUS_ORGANIZATION")).toBe(
      "St. Jude Parish - Religious Organization",
    );
  });

  it("still labels a customer whose type was never set", () => {
    expect(customerOptionLabel("Walk-in", undefined)).toBe("Walk-in - Individual");
  });

  it("keeps the type label and the option suffix in step", () => {
    for (const type of CUSTOMER_TYPES) {
      expect(customerOptionLabel("Acme", type)).toBe(`Acme - ${customerTypeLabel(type)}`);
    }
  });
});
