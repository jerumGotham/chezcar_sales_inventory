import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/server/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

import { GET } from "../../app/api/health/route";

describe("health route", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
  });

  it("reports readiness without caching when PostgreSQL responds", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const result = await GET();

    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    await expect(result.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns a data-free 503 when PostgreSQL is unavailable", async () => {
    mocks.queryRaw.mockImplementation(() => {
      throw new Error("database details");
    });

    const result = await GET();

    expect(result.status).toBe(503);
    await expect(result.json()).resolves.toEqual({ status: "unavailable" });
  });
});
