import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import openingCatalog from "../../prisma/fixtures/opening-catalog.json";
import { reloadOpeningCatalog } from "../../lib/server/services/catalog-reset";
import { withDisposableDatabase } from "../helpers/database";

const execFileAsync = promisify(execFile);
const ADMIN_ENV = {
  SEED_ADMIN_EMAIL: "owner.seed@example.test",
  SEED_ADMIN_PASSWORD: "integration-password-123!",
  SEED_ADMIN_NAME: "Owner Admin",
};

async function runSeed(databaseUrl: string, admin = ADMIN_ENV) {
  return execFileAsync(process.execPath, ["prisma/seed.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...admin,
      NODE_ENV: "test",
      ALLOW_CATALOG_RESET: "true",
      DATABASE_URL: databaseUrl,
    },
  });
}

async function canonicalRows(prisma: PrismaClient) {
  const [locations, products, balances] = await Promise.all([
    prisma.location.findMany({
      orderBy: { code: "asc" },
      select: { code: true, name: true, type: true },
    }),
    prisma.product.findMany({
      orderBy: { itemCode: "asc" },
      select: { itemCode: true, name: true, price: true, status: true },
    }),
    prisma.inventoryBalance.findMany({
      orderBy: [{ product: { itemCode: "asc" } }, { location: { code: "asc" } }],
      select: {
        onHand: true,
        product: { select: { itemCode: true } },
        location: { select: { code: true } },
      },
    }),
  ]);

  return {
    locations,
    products: products.map((product) => ({
      itemCode: product.itemCode,
      name: product.name,
      salePrice: product.price?.toFixed(2) ?? null,
      status: product.status,
    })),
    balances: balances.map((balance) => ({
      itemCode: balance.product.itemCode,
      locationCode: balance.location.code,
      onHand: balance.onHand,
    })),
  };
}

describe("canonical opening seed", () => {
  it("loads exact reviewed rows twice, preserves auth, and rolls back injected failure", async () => {
    await withDisposableDatabase(async ({ databaseUrl, prisma }) => {
      await runSeed(databaseUrl);

      const expectedRows = {
        locations: openingCatalog.locations.map(({ code, name, type }) => ({
          code,
          name,
          type,
        })),
        products: openingCatalog.products.map(
          ({ itemCode, name, salePrice, status }) => ({
            itemCode,
            name,
            salePrice,
            status,
          }),
        ),
        balances: openingCatalog.openingBalances.map(
          ({ itemCode, locationCode, onHand }) => ({
            itemCode,
            locationCode,
            onHand,
          }),
        ),
      };
      expect(await canonicalRows(prisma)).toEqual(expectedRows);
      expect(
        await prisma.product.count({ where: { price: null, status: "INACTIVE" } }),
      ).toBe(707);

      const qc = await prisma.location.findUniqueOrThrow({ where: { code: "QC" } });
      const staff = await prisma.user.create({
        data: {
          id: "preserved-staff",
          name: "Preserved Staff",
          email: "preserved@example.test",
          role: "BRANCH_STAFF",
          locationId: qc.id,
        },
      });
      await prisma.session.create({
        data: {
          id: "preserved-session",
          token: "preserved-token",
          expiresAt: new Date(Date.now() + 60_000),
          userId: staff.id,
        },
      });
      await prisma.product.update({
        where: { itemCode: openingCatalog.products[0].itemCode },
        data: { name: "stale name" },
      });

      await runSeed(databaseUrl);

      expect(await canonicalRows(prisma)).toEqual(expectedRows);
      expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
      expect(await prisma.user.findUnique({ where: { id: staff.id } })).not.toBeNull();
      expect(
        await prisma.session.findUnique({ where: { id: "preserved-session" } }),
      ).not.toBeNull();

      const beforeFailure = await canonicalRows(prisma);
      await expect(
        reloadOpeningCatalog({
          prisma,
          environment: {
            nodeEnv: "test",
            databaseUrl,
            allowCatalogReset: "true",
          },
          failAfterDelete: true,
        }),
      ).rejects.toThrow(/injected catalog reload failure/i);
      expect(await canonicalRows(prisma)).toEqual(beforeFailure);

      for (const environment of [
        {
          nodeEnv: "production",
          databaseUrl,
          allowCatalogReset: "true",
        },
        {
          nodeEnv: "development",
          databaseUrl:
            "postgresql://postgres:postgres@localhost:5435/chezcar_db?schema=public",
          allowCatalogReset: "true",
        },
        {
          nodeEnv: "test",
          databaseUrl: "postgresql://postgres:postgres@localhost:55435/unknown?schema=public",
          allowCatalogReset: "true",
        },
        {
          nodeEnv: "development",
          databaseUrl:
            "postgresql://postgres:postgres@localhost:55436/chezcar_catalog_dev?schema=public",
          allowCatalogReset: "true",
        },
      ]) {
        await expect(
          reloadOpeningCatalog({ prisma, environment }),
        ).rejects.toThrow(/refus/i);
        expect(await canonicalRows(prisma)).toEqual(beforeFailure);
      }
    });
  }, 60_000);

  it("refuses a different existing Admin before catalog writes", async () => {
    await withDisposableDatabase(async ({ databaseUrl, prisma }) => {
      await prisma.user.create({
        data: {
          id: "different-owner",
          name: "Different Owner",
          email: "different-owner@example.test",
          role: "ADMIN",
        },
      });

      await expect(runSeed(databaseUrl)).rejects.toThrow();
      expect(await prisma.product.count()).toBe(0);
      expect(await prisma.inventoryBalance.count()).toBe(0);
      expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
    });
  }, 30_000);
});
