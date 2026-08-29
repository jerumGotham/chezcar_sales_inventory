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
});
