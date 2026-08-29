import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();
const TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
const DEVELOPMENT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:55436/chezcar_catalog_dev?schema=public";
const APPROVED_FIXTURE_HASH =
  "a1570f220c260b7fe66e2e4a2eaf1eebe27538563b0b721fd0c9d80f6896d76b";
const LOCATION_CODES = Object.freeze(["BL", "LU", "QC", "SP", "SR", "VC"]);
const LOCATION_DISPLAY_NAMES = Object.freeze({
  BL: "Biñan Laguna",
  LU: "La Union",
  QC: "Quezon City",
  SP: "San Fernando Pampanga",
  SR: "Stock Room",
  VC: "Vigan City",
});
const ALL_CAPABILITIES = Object.freeze([
  "dashboard:view", "notifications:view", "notifications:mark-read", "notifications:push",
  "customers:view", "customers:create", "customers:update", "customers:deactivate",
  "customer-orders:view", "customer-orders:create", "customer-orders:reserve",
  "customer-orders:record-payment", "customer-orders:release", "customer-orders:cancel",
  "customer-orders:cancel-paid", "sales:view", "sales:post", "sales:verify:view",
  "sales:verify", "sales:resolve", "sales:void-replace", "sales:mismatch:respond",
  "sales:evidence:view", "sales:evidence:upload", "products:view", "products:create",
  "products:update", "products:delete", "products:image:update", "inventory:view",
  "inventory-availability:view", "inventory-movements:view", "inventory:adjust",
  "inventory:cost:update", "stock-receipts:view", "inventory-receiving:create",
  "stock-transfers:view", "stock-transfers:create", "stock-transfers:update",
  "stock-transfers:delete", "stock-transfers:finalize", "stock-transfers:dispatch",
  "stock-transfers:receive", "stock-transfers:report-discrepancy",
  "stock-transfers:investigate", "stock-transfers:resolve", "stock-transfers:audit:view",
  "reports:view", "reports:export", "offline-sales:snapshot", "offline-sales:sync",
  "offline-sales:activate-device", "users:view", "users:create", "users:update",
  "users:set-status", "users:reset-password", "branches:view", "branches:create",
  "branches:update", "roles:view", "roles:create", "roles:update",
]);
const BUILT_IN_ROLES = Object.freeze([
  {
    id: "role-admin",
    key: "admin",
    name: "Admin",
    description: "Immutable owner role with full application access.",
    scope: "OWNER",
    permissions: ALL_CAPABILITIES,
  },
  {
    id: "role-stock-staff",
    key: "stock-staff",
    name: "Stock Staff",
    description: "Built-in Stock Room operational role.",
    scope: "STOCK_ROOM",
    permissions: [
      "dashboard:view", "notifications:view", "notifications:mark-read", "notifications:push",
      "customers:view", "customer-orders:view", "products:view",
      "inventory:view", "inventory-availability:view", "inventory-movements:view",
      "stock-receipts:view", "inventory-receiving:create", "stock-transfers:view",
      "stock-transfers:audit:view", "stock-transfers:create", "stock-transfers:update",
      "stock-transfers:delete", "stock-transfers:finalize", "stock-transfers:dispatch",
      "stock-transfers:investigate",
    ],
  },
  {
    id: "role-branch-staff",
    key: "branch-staff",
    name: "Branch Staff",
    description: "Built-in branch operational role.",
    scope: "BRANCH",
    permissions: [
      "dashboard:view", "notifications:view", "notifications:mark-read", "notifications:push",
      "customers:view", "customers:create", "customers:update", "customers:deactivate",
      "customer-orders:view", "customer-orders:create", "customer-orders:reserve",
      "customer-orders:record-payment", "customer-orders:release", "customer-orders:cancel",
      "sales:view", "sales:post", "sales:verify:view", "sales:mismatch:respond",
      "sales:evidence:view", "sales:evidence:upload", "inventory:view",
      "inventory-availability:view", "inventory-movements:view", "stock-transfers:view", "stock-transfers:receive",
      "stock-transfers:report-discrepancy", "offline-sales:snapshot", "offline-sales:sync",
    ],
  },
  {
    id: "role-accounting-staff",
    key: "accounting-staff",
    name: "Accounting Staff",
    description: "Built-in business-wide accounting role.",
    scope: "BUSINESS_WIDE",
    permissions: [
      "dashboard:view", "notifications:view", "notifications:mark-read", "notifications:push",
      "customers:view", "customer-orders:view", "sales:view", "sales:verify",
      "sales:verify:view", "sales:resolve", "sales:evidence:view", "sales:evidence:upload",
      "reports:view", "reports:export",
    ],
  },
]);

async function upsertBuiltInRoles(tx) {
  for (const role of BUILT_IN_ROLES) {
    await tx.roleDefinition.upsert({
      where: { key: role.key },
      create: { ...role, isSystem: true },
      update: {
        name: role.name,
        description: role.description,
        scope: role.scope,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }
}

function assertCatalogResetEnvironment() {
  if (process.env.ALLOW_CATALOG_RESET !== "true") {
    throw new Error("ALLOW_CATALOG_RESET=true is required for catalog replacement");
  }
  const acceptedTestTarget =
    process.env.NODE_ENV === "test" && process.env.DATABASE_URL === TEST_DATABASE_URL;
  const acceptedDevelopmentTarget =
    process.env.NODE_ENV === "development" &&
    process.env.DATABASE_URL === DEVELOPMENT_DATABASE_URL;
  if (!acceptedTestTarget && !acceptedDevelopmentTarget) {
    throw new Error(
      "Refusing catalog replacement outside the approved disposable test or isolated development database",
    );
  }
}

function fixtureHash(fixture) {
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

function validateOpeningCatalog(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.schemaVersion !== 1 ||
    value.fixtureHash !== APPROVED_FIXTURE_HASH ||
    !Array.isArray(value.locations) ||
    value.locations.length !== 6 ||
    !Array.isArray(value.products) ||
    value.products.length !== 1432 ||
    !Array.isArray(value.openingBalances) ||
    value.openingBalances.length !== 8592
  ) {
    throw new Error("Canonical opening catalog fixture is invalid");
  }
  const expectedLocations = [
    ["BL", "BL Branch", "BRANCH"],
    ["LU", "LU Branch", "BRANCH"],
    ["QC", "QC Branch", "BRANCH"],
    ["SP", "SP Branch", "BRANCH"],
    ["SR", "Stock Room", "WAREHOUSE"],
    ["VC", "VC Branch", "BRANCH"],
  ];
  if (
    value.locations.some(
      (location, index) =>
        location.code !== expectedLocations[index][0] ||
        location.name !== expectedLocations[index][1] ||
        location.type !== expectedLocations[index][2],
    )
  ) {
    throw new Error("Canonical opening catalog locations are not approved");
  }

  const productCodes = new Set();
  for (const product of value.products) {
    const validActive =
      product.status === "ACTIVE" &&
      product.sellable === true &&
      typeof product.salePrice === "string" &&
      /^\d+\.\d{2}$/.test(product.salePrice);
    const validInactive =
      product.status === "INACTIVE" &&
      product.sellable === false &&
      product.salePrice === null;
    if (
      typeof product.itemCode !== "string" ||
      !product.itemCode ||
      typeof product.name !== "string" ||
      !product.name ||
      (!validActive && !validInactive) ||
      productCodes.has(product.itemCode)
    ) {
      throw new Error("Canonical opening catalog product is invalid");
    }
    productCodes.add(product.itemCode);
  }

  const balanceKeys = new Set();
  for (const balance of value.openingBalances) {
    const key = `${balance.itemCode}\u0000${balance.locationCode}`;
    if (
      !productCodes.has(balance.itemCode) ||
      !LOCATION_CODES.includes(balance.locationCode) ||
      !Number.isInteger(balance.onHand) ||
      balance.onHand < 0 ||
      balanceKeys.has(key)
    ) {
      throw new Error("Canonical opening catalog balance is invalid");
    }
    balanceKeys.add(key);
  }
  if (
    value.products.some((product) =>
      LOCATION_CODES.some(
        (locationCode) => !balanceKeys.has(`${product.itemCode}\u0000${locationCode}`),
      ),
    ) ||
    fixtureHash(value) !== value.fixtureHash
  ) {
    throw new Error("Canonical opening catalog fixture hash or coverage is invalid");
  }
  return value;
}

async function loadOpeningCatalog() {
  const contents = await readFile(
    new URL("./fixtures/opening-catalog.json", import.meta.url),
    "utf8",
  );
  return validateOpeningCatalog(JSON.parse(contents));
}

function adminInput() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim();
  if (!email || !password || !name) {
    throw new Error(
      "SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and SEED_ADMIN_NAME are required",
    );
  }
  if (email.endsWith(".invalid") || password.startsWith("replace-with")) {
    throw new Error("Replace the example Admin credentials before seeding");
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters");
  }
  return { email, password, name };
}

async function replaceOpeningCatalog(tx, fixture) {
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
      update: { name, type: location.type, isActive: true },
    });
  }

  await tx.inventoryBalance.deleteMany();
  await tx.product.deleteMany();
  await tx.product.createMany({
    data: fixture.products.map((product) => ({
      itemCode: product.itemCode,
      name: product.name,
      price: product.salePrice,
      status: product.status,
    })),
  });
  const [locations, products] = await Promise.all([
    tx.location.findMany({ select: { id: true, code: true } }),
    tx.product.findMany({ select: { id: true, itemCode: true } }),
  ]);
  const locationByCode = new Map(locations.map((location) => [location.code, location.id]));
  const productByCode = new Map(products.map((product) => [product.itemCode, product.id]));
  await tx.inventoryBalance.createMany({
    data: fixture.openingBalances.map((balance) => ({
      locationId: locationByCode.get(balance.locationCode),
      productId: productByCode.get(balance.itemCode),
      onHand: balance.onHand,
    })),
  });
}

async function provisionOwnerAdmin(tx, input, passwordHash) {
  const existingAdmin = await tx.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  if (existingAdmin && existingAdmin.email.toLowerCase() !== input.email) {
    throw new Error("Refusing seed because a different owner Admin already exists");
  }

  const user = await tx.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      role: "ADMIN",
      roleDefinitionId: "role-admin",
      status: "ACTIVE",
      locationId: null,
      banned: false,
      banReason: null,
      banExpires: null,
    },
    create: {
      email: input.email,
      emailVerified: true,
      name: input.name,
      role: "ADMIN",
      roleDefinitionId: "role-admin",
      status: "ACTIVE",
      locationId: null,
      banned: false,
    },
  });
  await tx.account.upsert({
    where: {
      providerId_accountId: {
        providerId: "credential",
        accountId: user.id,
      },
    },
    update: { password: passwordHash, userId: user.id },
    create: {
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    },
  });
}

async function main() {
  assertCatalogResetEnvironment();
  const fixture = await loadOpeningCatalog();
  const catalogOnly = process.argv.includes("--catalog-only");
  const admin = catalogOnly ? null : adminInput();
  const passwordHash = admin ? await hashPassword(admin.password) : null;

  await prisma.$transaction(
    async (tx) => {
      if (admin) {
        const existingAdmin = await tx.user.findFirst({
          where: { role: "ADMIN" },
          select: { email: true },
        });
        if (existingAdmin && existingAdmin.email.toLowerCase() !== admin.email) {
          throw new Error("Refusing seed because a different owner Admin already exists");
        }
      }

      await replaceOpeningCatalog(tx, fixture);
      await upsertBuiltInRoles(tx);
      if (admin && passwordHash) {
        await provisionOwnerAdmin(tx, admin, passwordHash);
      }
    },
    { timeout: 30_000 },
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    await prisma.$disconnect();
    process.exit(1);
  });
