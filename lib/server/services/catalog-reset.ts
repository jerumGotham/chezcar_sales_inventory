import "server-only";

import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import openingCatalog from "../../../prisma/fixtures/opening-catalog.json";

const TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
const DEVELOPMENT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5435/chezcar_db?schema=public";
const APPROVED_FIXTURE_HASH =
  "87f985b2235889ba41506730948150ef4a0c06a01dc2f4c73d9ba19a67af17c4";
const LOCATION_CODES = ["BL", "LU", "QC", "SP", "SR", "VC"] as const;
const LOCATION_DISPLAY_NAMES: Record<(typeof LOCATION_CODES)[number], string> = {
  BL: "Biñan Laguna",
  LU: "La Union",
  QC: "Quezon City",
  SP: "San Fernando Pampanga",
  SR: "Stock Room",
  VC: "Vigan City",
};

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
  description: z.string().nullable(),
  brand: z.string().nullable(),
  vehicleCompatibilities: z.array(z.object({
    make: z.string().nullable(),
    model: z.string().min(1),
    startYear: z.number().int().nullable(),
    endYear: z.number().int().nullable(),
  }).refine(
    (value) => value.startYear === null || value.endYear === null || value.startYear <= value.endYear,
  )),
});
const balanceSchema = z.object({
  itemCode: z.string().trim().min(1),
  locationCode: z.enum(LOCATION_CODES),
  onHand: z.number().int().nonnegative(),
  sourceId: z.string(),
});
const fixtureSchema = z.object({
  schemaVersion: z.literal(2),
  generatedFrom: z.object({
    workbookHash: z.string().regex(/^[a-f0-9]{64}$/),
    sheet: z.string(),
    range: z.string(),
    policy: z.string(),
  }),
  importSummary: z.record(z.string(), z.unknown()),
  locations: z.array(locationSchema).length(6),
  products: z.array(productSchema).length(1382),
  openingBalances: z.array(balanceSchema).length(8292),
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
    importSummary: fixture.importSummary,
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
  if (stableFixtureHash(value as OpeningCatalogFixture) !== fixture.fixtureHash) {
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
    (environment.nodeEnv === undefined || environment.nodeEnv === "development") &&
    environment.databaseUrl === DEVELOPMENT_DATABASE_URL;
  if (!acceptedTestTarget && !acceptedDevelopmentTarget) {
    throw new Error(
      "Refusing catalog replacement outside the approved disposable test or local development database",
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

  for (const location of fixture.locations) {
    const name = LOCATION_DISPLAY_NAMES[location.code];
    await tx.location.upsert({
      where: { code: location.code },
      create: {
        code: location.code,
        name,
        type: location.type,
        isActive: true,
      },
      update: {
        name,
        type: location.type,
        isActive: true,
      },
    });
  }

  await tx.inventoryBalance.deleteMany();
  if (options.failAfterDelete) {
    throw new Error("Injected catalog reload failure after delete");
  }

  const existingProducts = await tx.product.findMany({
    where: { itemCode: { in: fixture.products.map((product) => product.itemCode) } },
    select: { itemCode: true },
  });
  const existingCodes = new Set(existingProducts.map((product) => product.itemCode));
  await Promise.all(
    fixture.products
      .filter((product) => existingCodes.has(product.itemCode))
      .map((product) =>
        tx.product.update({
          where: { itemCode: product.itemCode },
          data: {
            name: product.name,
            description: product.description,
            brand: product.brand,
            price: product.salePrice,
            status: product.status,
          },
        }),
      ),
  );
  await tx.product.createMany({
    data: fixture.products
      .filter((product) => !existingCodes.has(product.itemCode))
      .map((product) => ({
        itemCode: product.itemCode,
        name: product.name,
        description: product.description,
        brand: product.brand,
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

  await tx.productVehicleCompatibility.deleteMany({
    where: { productId: { in: [...productByCode.values()] } },
  });
  await tx.productVehicleCompatibility.createMany({
    data: fixture.products.flatMap((product) =>
      product.vehicleCompatibilities.map((compatibility) => ({
        productId: productByCode.get(product.itemCode)!,
        ...compatibility,
      }))),
  });

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
