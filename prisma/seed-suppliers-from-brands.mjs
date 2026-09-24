import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Product brands were free text typed during the catalogue import, and each one
 * is really the supplier the product is bought from. This promotes those values
 * into Supplier rows and links every product to its own.
 *
 * Safe to run more than once: suppliers are matched by name, ignoring case and
 * surrounding space, so a second run inserts nothing and only fills in links
 * that are still missing.
 */

/** A brand that carries no information. Cleared rather than made a supplier. */
function isMeaningless(brand) {
  const normalized = brand?.trim() ?? "";
  if (!normalized) return true;
  // A lone dot or dash is what an encoder types to mean "none".
  return /^[.\-_/\\]+$/.test(normalized);
}

function normalizeKey(value) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export async function seedSuppliersFromBrands(prisma) {
  const summary = {
    brandsCleared: 0,
    suppliersCreated: 0,
    suppliersMatched: 0,
    codesFilled: 0,
    productsLinked: 0,
    productsWithoutSupplier: 0,
  };

  // 1. Clear the placeholder brands first, so they never become suppliers.
  const products = await prisma.product.findMany({
    select: { id: true, brand: true, supplierId: true },
  });

  const meaningless = products.filter((product) => product.brand !== null && isMeaningless(product.brand));
  if (meaningless.length > 0) {
    await prisma.product.updateMany({
      where: { id: { in: meaningless.map((product) => product.id) } },
      data: { brand: null, supplierId: null },
    });
    summary.brandsCleared = meaningless.length;
  }

  // 2. One supplier per distinct brand, reusing anything already there.
  const existing = await prisma.supplier.findMany({ select: { id: true, name: true, code: true } });
  const byKey = new Map(existing.map((supplier) => [normalizeKey(supplier.name), supplier.id]));

  const wanted = new Map();
  for (const product of products) {
    if (product.brand === null || isMeaningless(product.brand)) continue;
    const name = product.brand.trim().replace(/\s+/g, " ");
    wanted.set(normalizeKey(name), name);
  }

  const byId = new Map(existing.map((supplier) => [supplier.id, supplier]));
  for (const [key, name] of wanted) {
    const existingId = byKey.get(key);
    if (existingId) {
      summary.suppliersMatched += 1;
      // A supplier created before the code was carried over still has none, so
      // fill it in rather than leaving the earlier rows half done.
      if (byId.get(existingId)?.code !== name) {
        await prisma.supplier.update({ where: { id: existingId }, data: { code: name } });
        summary.codesFilled += 1;
      }
      continue;
    }
    const created = await prisma.supplier.create({
      // The brand text is both the name and the code: there is no separate
      // code in the sheet, and an invented one would match nothing.
      data: { name, code: name, status: "ACTIVE", notes: "Created from the product catalogue brand list." },
      select: { id: true },
    });
    byKey.set(key, created.id);
    summary.suppliersCreated += 1;
  }

  // 3. Point every product at its supplier.
  for (const product of products) {
    if (product.brand === null || isMeaningless(product.brand)) {
      summary.productsWithoutSupplier += 1;
      continue;
    }
    const supplierId = byKey.get(normalizeKey(product.brand));
    if (!supplierId || product.supplierId === supplierId) continue;
    await prisma.product.update({ where: { id: product.id }, data: { supplierId } });
    summary.productsLinked += 1;
  }

  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const summary = await seedSuppliersFromBrands(prisma);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Supplier seed failed");
    process.exit(1);
  });
}
