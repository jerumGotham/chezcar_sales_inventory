import { describe, expect, it } from "vitest";

import { assertOperationalResetEnvironment } from "./reset-operational-data.mjs";

const developmentDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5435/chezcar_db?schema=public";

describe("operational data reset guard", () => {
  it("requires explicit opt-in", () => {
    expect(() =>
      assertOperationalResetEnvironment({
        nodeEnv: "development",
        databaseUrl: developmentDatabaseUrl,
        allowOperationalDataReset: undefined,
      }),
    ).toThrow("ALLOW_OPERATIONAL_DATA_RESET=true");
  });

  it("rejects unapproved database identities", () => {
    expect(() =>
      assertOperationalResetEnvironment({
        nodeEnv: "development",
        databaseUrl: "postgresql://postgres:postgres@db/production?schema=public",
        allowOperationalDataReset: "true",
      }),
    ).toThrow("outside the approved local development or disposable test database");
  });

  it("rejects production even when the URL matches local Compose", () => {
    expect(() =>
      assertOperationalResetEnvironment({
        nodeEnv: "production",
        databaseUrl: developmentDatabaseUrl,
        allowOperationalDataReset: "true",
      }),
    ).toThrow("production");
  });

  it("accepts the local Compose database with explicit opt-in", () => {
    expect(() =>
      assertOperationalResetEnvironment({
        nodeEnv: "development",
        databaseUrl: developmentDatabaseUrl,
        allowOperationalDataReset: "true",
      }),
    ).not.toThrow();
  });
});
