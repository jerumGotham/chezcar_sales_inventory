import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reloadOpeningCatalog } from "./catalog-reset";

const TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
const DEVELOPMENT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55436/chezcar_catalog_dev?schema=public";

function prismaWithTransaction(transaction = vi.fn()) {
  return { $transaction: transaction } as unknown as PrismaClient;
}

describe("reloadOpeningCatalog safety", () => {
  it.each([
    {
      name: "production",
      nodeEnv: "production",
      databaseUrl: TEST_DATABASE_URL,
      allowCatalogReset: "true",
    },
    {
      name: "the checked-in development bind mount",
      nodeEnv: "development",
      databaseUrl:
        "postgresql://postgres:postgres@localhost:5435/chezcar_db?schema=public",
      allowCatalogReset: "true",
    },
    {
      name: "an unknown database",
      nodeEnv: "test",
      databaseUrl: "postgresql://postgres:postgres@localhost:55435/unknown?schema=public",
      allowCatalogReset: "true",
    },
    {
      name: "a missing explicit reset gate",
      nodeEnv: "test",
      databaseUrl: TEST_DATABASE_URL,
      allowCatalogReset: undefined,
    },
  ])("refuses $name before opening a transaction", async (environment) => {
    const transaction = vi.fn();

    await expect(
      reloadOpeningCatalog({
        prisma: prismaWithTransaction(transaction),
        environment,
      }),
    ).rejects.toThrow(/refus|allow_catalog_reset/i);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("accepts only the explicit disposable test and isolated development identities", async () => {
    const completed = {
      locations: 6,
      products: 1432,
      openingBalances: 8592,
    };
    const transaction = vi.fn(async () => completed);
    const prisma = prismaWithTransaction(transaction);

    for (const environment of [
      {
        nodeEnv: "test",
        databaseUrl: TEST_DATABASE_URL,
        allowCatalogReset: "true",
      },
      {
        nodeEnv: "development",
        databaseUrl: DEVELOPMENT_DATABASE_URL,
        allowCatalogReset: "true",
      },
    ]) {
      await expect(
        reloadOpeningCatalog({ prisma, environment }),
      ).resolves.toEqual(completed);
    }
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty or malformed fixture before opening a transaction", async () => {
    for (const fixture of [null, {}, { locations: [], products: [], openingBalances: [] }]) {
      const transaction = vi.fn();
      await expect(
        reloadOpeningCatalog({
          prisma: prismaWithTransaction(transaction),
          environment: {
            nodeEnv: "test",
            databaseUrl: TEST_DATABASE_URL,
            allowCatalogReset: "true",
          },
          fixture,
        }),
      ).rejects.toThrow(/fixture|catalog/i);
      expect(transaction).not.toHaveBeenCalled();
    }
  });
});
