import { describe, expect, it } from "vitest";

import { createRequest } from "./requests";

describe("createRequest", () => {
  it("preserves duplicate, reordered, and hostile query parameters", () => {
    const request = createRequest("/api/inventory", {
      query: [
        ["location", "QC"],
        ["q", "first"],
        ["location", "SR"],
        ["q", "' OR 1=1 -- & + %00"],
      ],
    });

    expect([...new URL(request.url).searchParams.entries()]).toEqual([
      ["location", "QC"],
      ["q", "first"],
      ["location", "SR"],
      ["q", "' OR 1=1 -- & + %00"],
    ]);
  });

  it("passes direct bodies and hostile headers to the Request boundary", async () => {
    const body = "{\"amount\":1,\"amount\":999,\"raw\":\"\\u0000\"}";
    const request = createRequest("/api/users", {
      method: "POST",
      body,
      headers: [
        ["content-type", "application/json"],
        ["x-forwarded-for", "127.0.0.1"],
        ["x-forwarded-for", "203.0.113.9"],
        ["x-hostile-value", "' OR '1'='1"],
      ],
    });

    expect(await request.text()).toBe(body);
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(request.headers.get("x-forwarded-for")).toBe(
      "127.0.0.1, 203.0.113.9",
    );
    expect(request.headers.get("x-hostile-value")).toBe("' OR '1'='1");
  });

  it("does not add a body, content type, or query parameters by default", () => {
    const request = createRequest("/api/products");

    expect(request.method).toBe("GET");
    expect(new URL(request.url).search).toBe("");
    expect(request.headers.has("content-type")).toBe(false);
    expect(request.body).toBeNull();
  });
});
