import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), readdir: vi.fn() }));

vi.mock("@/lib/server/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

vi.mock("node:fs/promises", () => ({ readdir: mocks.readdir }));

import { GET } from "../../app/api/health/route";

/** What readdir returns: directories are migrations, files are not. */
function folders(...names: string[]) {
  return names.map((name) => ({ name, isDirectory: () => true }));
}

describe("health route", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
    mocks.readdir.mockReset();
  });

  /*
   * The first query is the liveness probe; the second reads the applied
   * migrations. Only the second returns rows.
   */
  function database(applied: string[]) {
    mocks.queryRaw
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockResolvedValueOnce(applied.map((migration_name) => ({ migration_name })));
  }

  it("reports readiness without caching when PostgreSQL responds and the schema is current", async () => {
    database(["20260101000000_first", "20260202000000_second"]);
    mocks.readdir.mockResolvedValue(folders("20260101000000_first", "20260202000000_second"));

    const result = await GET();

    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    await expect(result.json()).resolves.toEqual({
      status: "ok",
      migrations: { checked: true, shipped: 2, pending: 0 },
    });
  });

  /*
   * The failure that a SELECT 1 probe cannot see: the database answers, but a
   * migration this build depends on was never applied, so the release will
   * throw on whatever the missing column feeds.
   */
  it("refuses a build whose migrations the database has not run", async () => {
    database(["20260101000000_first"]);
    mocks.readdir.mockResolvedValue(folders("20260101000000_first", "20260202000000_second"));

    const result = await GET();

    expect(result.status).toBe(503);
    await expect(result.json()).resolves.toEqual({
      status: "schema-behind",
      migrations: { checked: true, shipped: 2, pending: 1 },
    });
  });

  it("says so rather than guessing when the migration folder cannot be read", async () => {
    database([]);
    mocks.readdir.mockRejectedValue(new Error("ENOENT"));

    const result = await GET();

    // The application is up, so this is not a 503; the caller is told the
    // schema could not be checked and decides for itself.
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({
      status: "ok",
      migrations: { checked: false, shipped: null, pending: null },
    });
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
