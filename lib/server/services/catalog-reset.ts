import "server-only";

import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import openingCatalog from "../../../prisma/fixtures/opening-catalog.json";

const TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
const DEVELOPMENT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55436/chezcar_catalog_dev?schema=public";
const APPROVED_FIXTURE_HASH =
  "a1570f220c260b7fe66e2e4a2eaf1eebe27538563b0b721fd0c9d80f6896d76b";
const LOCATION_CODES = ["BL", "LU", "QC", "SP", "SR", "VC"] as const;

const locationSchema = z.object({
  code: z.enum(LOCATION_CODES),
  name: z.string().trim().min(1),
  type: z.enum(["WAREHOUSE", "BRANCH"]),
  sourceIds: z.array(z.string()),
});
const productSchema = z.object({
  itemCode: z.string().trim().min(1),
  name: z.string().trim().min(1),
  salePrice: z.string().regex(/^\d+\.\d{2}$/).nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  sellable: z.boolean(),
  sourceIds: z.array(z.string().min(1)).min(1),
});
const balanceSchema = z.object({
  itemCode: z.string().trim().min(1),
  locationCode: z.enum(LOCATION_CODES),
  onHand: z.number().int().nonnegative(),
  sourceIds: z.array(z.string()),
});
const fixtureSchema = z.object({
  schemaVersion: z.literal(1),
  generatedFrom: z.object({
    workbookHash: z.string().regex(/^[a-f0-9]{64}$/),
    resolutionHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceMappingHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  locations: z.array(locationSchema).length(6),
  products: z.array(productSchema).length(1432),
  openingBalances: z.array(balanceSchema).length(8592),
  fixtureHash: z.literal(APPROVED_FIXTURE_HASH),
});

export type OpeningCatalogFixture = z.infer<typeof fixtureSchema>;
export type CatalogResetEnvironment = {
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
  allowCatalogReset: string | undefined;
};
export type ReloadOpeningCatalogOptions = {
  prisma: PrismaClient;
  environment?: CatalogResetEnvironment;
  fixture?: unknown;
  failAfterDelete?: boolean;
};

function stableFixtureHash(fixture: OpeningCatalogFixture) {
  const fixtureBase = {
    schemaVersion: fixture.schemaVersion,
    generatedFrom: fixture.generatedFrom,
    locations: fixture.locations,
    products: fixture.products,
    openingBalances: fixture.openingBalances,
  };

  return createHash("sha256")
    .update(`${JSON.stringify(fixtureBase, null, 2)}\n`)
    .digest("hex");
}

export function validateOpeningCatalog(value: unknown): OpeningCatalogFixture {
  const parsed = fixtureSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Canonical opening catalog fixture is invalid", {
      cause: parsed.error,
    });
  }
  const fixture = parsed.data;
  const expectedLocations = [
    { code: "BL", name: "BL Branch", type: "BRANCH" },
    { code: "LU", name: "LU Branch", type: "BRANCH" },
    { code: "QC", name: "QC Branch", type: "BRANCH" },
    { code: "SP", name: "SP Branch", type: "BRANCH" },
    { code: "SR", name: "Stock Room", type: "WAREHOUSE" },
    { code: "VC", name: "VC Branch", type: "BRANCH" },
  ];
  const actualLocations = fixture.locations.map(({ code, name, type }) => ({
    code,
    name,
    type,
  }));
  if (JSON.stringify(actualLocations) !== JSON.stringify(expectedLocations)) {
    throw new Error("Canonical opening catalog locations are not approved");
  }

  const productCodes = new Set(fixture.products.map((product) => product.itemCode));
  if (productCodes.size !== fixture.products.length) {
    throw new Error("Canonical opening catalog contains duplicate product codes");
  }
  for (const product of fixture.products) {
    const activeAndPriced =
      product.status === "ACTIVE" && product.sellable && product.salePrice !== null;
    const inactiveAndUnpriced =
      product.status === "INACTIVE" && !product.sellable && product.salePrice === null;
    if (!activeAndPriced && !inactiveAndUnpriced) {
      throw new Error(`Canonical product state is invalid: ${product.itemCode}`);
    }
  }

  const balanceKeys = new Set<string>();
  for (const balance of fixture.openingBalances) {
    if (!productCodes.has(balance.itemCode)) {
      throw new Error(`Opening balance references an unknown product: ${balance.itemCode}`);
    }
    const key = `${balance.itemCode}\u0000${balance.locationCode}`;
    if (balanceKeys.has(key)) {
      throw new Error(`Canonical opening catalog contains a duplicate balance: ${key}`);
    }
    balanceKeys.add(key);
  }
  if (
    fixture.products.some((product) =>
      LOCATION_CODES.some(
        (locationCode) => !balanceKeys.has(`${product.itemCode}\u0000${locationCode}`),
      ),
    )
  ) {
    throw new Error("Canonical opening catalog does not contain every product/location balance");
  }
  if (stableFixtureHash(fixture) !== fixture.fixtureHash) {
    throw new Error("Canonical opening catalog fixture hash is invalid");
  }

  return fixture;
}

export function assertCatalogResetEnvironment(
  environment: CatalogResetEnvironment,
) {
  if (environment.allowCatalogReset !== "true") {
    throw new Error("ALLOW_CATALOG_RESET=true is required for catalog replacement");
  }
  const acceptedTestTarget =
    environment.nodeEnv === "test" && environment.databaseUrl === TEST_DATABASE_URL;
  const acceptedDevelopmentTarget =
    environment.nodeEnv === "development" &&
    environment.databaseUrl === DEVELOPMENT_DATABASE_URL;
  if (!acceptedTestTarget && !acceptedDevelopmentTarget) {
    throw new Error(
      "Refusing catalog replacement outside the approved disposable test or isolated development database",
    );
  }
}

async function assertConnectedDatabaseTarget(
  tx: Prisma.TransactionClient,
  environment: CatalogResetEnvironment,
) {
  const expectedDatabase = decodeURIComponent(
    new URL(environment.databaseUrl!).pathname.slice(1),
  );
  const [identity] = await tx.$queryRaw<Array<{ databaseName: string }>>`
    SELECT current_database() AS "databaseName"
  `;
  if (identity?.databaseName !== expectedDatabase) {
    throw new Error("Refusing catalog replacement because the connected database identity differs");
  }
}

export async function replaceOpeningCatalog(
  tx: Prisma.TransactionClient,
  fixture: OpeningCatalogFixture,
  options: { failAfterDelete?: boolean } = {},
) {
  const locationCodes = fixture.locations.map((location) => location.code);
  const usersOutsideCanonicalLocations = await tx.user.count({
    where: {
      locationId: { not: null },
      location: { code: { notIn: locationCodes } },
    },
  });
  if (usersOutsideCanonicalLocations > 0) {
    throw new Error(
      "Refusing catalog replacement while a user is assigned outside canonical locations",
    );
  }

  for (const location of fixture.locations) {
    await tx.location.upsert({
      where: { code: location.code },
      create: {
        code: location.code,
        name: location.name,
        type: location.type,
        isActive: true,
      },
      update: {
        name: location.name,
        type: location.type,
        isActive: true,
      },
    });
  }

  await tx.inventoryBalance.deleteMany();
  await tx.product.deleteMany();
  await tx.location.deleteMany({ where: { code: { notIn: locationCodes } } });
  if (options.failAfterDelete) {
    throw new Error("Injected catalog reload failure after delete");
  }

  await tx.product.createMany({
    data: fixture.products.map((product) => ({
      itemCode: product.itemCode,
      name: product.name,
      price: product.salePrice,
      status: product.status,
    })),
  });
  const [locations, products] = await Promise.all([
    tx.location.findMany({
      where: { code: { in: locationCodes } },
      select: { id: true, code: true },
    }),
    tx.product.findMany({ select: { id: true, itemCode: true } }),
  ]);
  const locationByCode = new Map(locations.map((location) => [location.code, location.id]));
  const productByCode = new Map(products.map((product) => [product.itemCode, product.id]));

  await tx.inventoryBalance.createMany({
    data: fixture.openingBalances.map((balance) => ({
      locationId: locationByCode.get(balance.locationCode)!,
      productId: productByCode.get(balance.itemCode)!,
      onHand: balance.onHand,
    })),
  });

  return {
    locations: fixture.locations.length,
    products: fixture.products.length,
    openingBalances: fixture.openingBalances.length,
  };
}

export async function reloadOpeningCatalog({
  prisma,
  environment = {
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    allowCatalogReset: process.env.ALLOW_CATALOG_RESET,
  },
  fixture: fixtureInput = openingCatalog,
  failAfterDelete = false,
}: ReloadOpeningCatalogOptions) {
  assertCatalogResetEnvironment(environment);
  const fixture = validateOpeningCatalog(fixtureInput);

  return prisma.$transaction(
    async (tx) => {
      await assertConnectedDatabaseTarget(tx, environment);
      return replaceOpeningCatalog(tx, fixture, { failAfterDelete });
    },
    { timeout: 30_000 },
  );
}
