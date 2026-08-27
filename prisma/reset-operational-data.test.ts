import { describe, expect, it } from "vitest";

import { assertOperationalResetEnvironment } from "./reset-operational-data.mjs";

const developmentDatabaseUrl =
  "postgresql://postgres:postgres@localhost:55436/chezcar_catalog_dev?schema=public";

describe("operational data reset guard", () => {
  it("requires explicit opt-in", () => {
    expect(() =>
      assertOperationalResetEnvironment({
        databaseUrl: developmentDatabaseUrl,
        allowOperationalDataReset: undefined,
      }),
    ).toThrow("ALLOW_OPERATIONAL_DATA_RESET=true");
  });

  it("rejects unapproved database identities", () => {
    expect(() =>
      assertOperationalResetEnvironment({
        databaseUrl: "postgresql://postgres:postgres@db/production?schema=public",
        allowOperationalDataReset: "true",
      }),
    ).toThrow("outside the approved isolated development or test database");
  });

  it("accepts the isolated development database with explicit opt-in", () => {
    expect(() =>
      assertOperationalResetEnvironment({
        databaseUrl: developmentDatabaseUrl,
        allowOperationalDataReset: "true",
      }),
    ).not.toThrow();
  });
});
