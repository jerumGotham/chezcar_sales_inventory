import { describe, expect, it } from "vitest";

import { resolveAuthTrustedOrigins } from "./auth-origins";

describe("resolveAuthTrustedOrigins", () => {
  it("includes the canonical and explicitly trusted origins", () => {
    expect(
      resolveAuthTrustedOrigins({
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_TRUSTED_ORIGINS:
          "http://localhost:3000, http://192.168.1.14:3000",
      }),
    ).toEqual(["http://localhost:3000", "http://192.168.1.14:3000"]);
  });

  it("omits empty values", () => {
    expect(resolveAuthTrustedOrigins({})).toEqual([]);
  });
});
