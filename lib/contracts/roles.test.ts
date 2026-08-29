import { describe, expect, it } from "vitest";

import { ASSIGNABLE_CAPABILITY_CATALOG, createRoleRequestSchema } from "./roles";

describe("role action permissions", () => {
  it("makes every granular capability assignable, including administration", () => {
    const ids = ASSIGNABLE_CAPABILITY_CATALOG.map(({ id }) => id);
    expect(ids).toContain("locations:all");
    expect(ids).toContain("roles:update");
    expect(ids).toContain("sales:void-replace");
  });

  it("does not accept operational scope in the role contract", () => {
    const result = createRoleRequestSchema.parse({
      name: "Delegated manager",
      scope: "BUSINESS_WIDE",
      permissions: ["users:view"],
    });
    expect(result).not.toHaveProperty("scope");
  });
});
