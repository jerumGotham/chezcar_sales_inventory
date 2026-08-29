import { describe, expect, it } from "vitest";

import { capabilityIsAssignableToScope } from "./roles";

describe("role capability scope compatibility", () => {
  it("keeps shared reads assignable across operational scopes", () => {
    expect(capabilityIsAssignableToScope("customer-orders:view", "STOCK_ROOM")).toBe(true);
    expect(capabilityIsAssignableToScope("inventory:view", "BUSINESS_WIDE")).toBe(true);
  });

  it("limits workflow actions to scopes supported by their services", () => {
    expect(capabilityIsAssignableToScope("customer-orders:create", "BRANCH")).toBe(true);
    expect(capabilityIsAssignableToScope("customer-orders:create", "BUSINESS_WIDE")).toBe(false);
    expect(capabilityIsAssignableToScope("stock-transfers:dispatch", "STOCK_ROOM")).toBe(true);
    expect(capabilityIsAssignableToScope("stock-transfers:dispatch", "BRANCH")).toBe(false);
    expect(capabilityIsAssignableToScope("sales:resolve", "BUSINESS_WIDE")).toBe(true);
    expect(capabilityIsAssignableToScope("sales:resolve", "BRANCH")).toBe(false);
  });

  it("never exposes owner-only capabilities to assignable scopes", () => {
    expect(capabilityIsAssignableToScope("sales:void-replace", "BUSINESS_WIDE")).toBe(false);
  });
});
