import { describe, expect, it } from "vitest";

import { effectiveCapabilities, hasCapability } from "./permissions";

describe("granular permissions", () => {
  it("lets an action grant open its module without granting sibling actions", () => {
    const granted = ["products:create"] as const;

    expect(hasCapability(granted, "products:view")).toBe(true);
    expect(hasCapability(granted, "products:create")).toBe(true);
    expect(hasCapability(granted, "products:update")).toBe(false);
    expect(hasCapability(granted, "products:delete")).toBe(false);
  });

  it("never lets a view grant authorize a mutation", () => {
    const granted = ["products:view"] as const;

    expect(hasCapability(granted, "products:create")).toBe(false);
    expect(hasCapability(granted, "products:update")).toBe(false);
    expect(hasCapability(granted, "products:delete")).toBe(false);
  });

  it("expands transitive implications for the shell and menus", () => {
    expect(effectiveCapabilities(["inventory-receiving:create"])).toEqual(
      expect.arrayContaining([
        "inventory-receiving:create",
        "stock-receipts:view",
        "inventory-movements:view",
        "inventory:view",
      ]),
    );
  });

  it("keeps supplier maintenance separate from receiving lookup access", () => {
    expect(effectiveCapabilities(["suppliers:create"])).toEqual(
      expect.arrayContaining(["suppliers:create", "suppliers:view"]),
    );
    expect(hasCapability(["inventory-receiving:create"], "suppliers:view")).toBe(false);
    expect(hasCapability(["suppliers:view"], "inventory-receiving:create")).toBe(false);
  });

  it("keeps personnel maintenance actions independent", () => {
    expect(effectiveCapabilities(["personnel:create"])).toEqual(
      expect.arrayContaining(["personnel:create", "personnel:view"]),
    );
    expect(hasCapability(["personnel:view"], "personnel:update")).toBe(false);
    expect(hasCapability(["personnel:view"], "sales:post")).toBe(false);
  });

  it("grants Backjob stock actions only their required views", () => {
    expect(effectiveCapabilities(["backjobs:parts:issue"])).toEqual(
      expect.arrayContaining(["backjobs:view", "inventory:view", "inventory-movements:view"]),
    );
    expect(hasCapability(["backjobs:view"], "backjobs:parts:issue")).toBe(false);
  });

  it("keeps warranty approvals separate from physical inventory actions", () => {
    expect(hasCapability(["customer-warranties:approve"], "customer-warranties:view")).toBe(true);
    expect(hasCapability(["customer-warranties:approve"], "customer-warranties:release")).toBe(false);
    expect(effectiveCapabilities(["customer-warranties:receive-quarantine"])).toEqual(
      expect.arrayContaining(["inventory:view", "inventory-movements:view"]),
    );
  });
});
