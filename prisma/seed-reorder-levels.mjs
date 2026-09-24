import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Sets the reorder level the Inventory screen uses to decide a product is low.
 * The catalogue gets 2. Perfume gets 20, because it moves far faster than the
 * rest of the catalogue and 2 would only warn once the shelf was already bare.
 *
 * Safe to run more than once: it writes only the products that do not already
 * hold their target, so a second run reports nothing changed.
 */

const CATALOGUE_REORDER_LEVEL = 2;
const PERFUME_REORDER_LEVEL = 20;

/** The name is the only place perfume is identified; it has no category. */
const PERFUME_NAME = "perfume";

export async function seedReorderLevels(
  prisma,
  { catalogue = CATALOGUE_REORDER_LEVEL, perfume = PERFUME_REORDER_LEVEL } = {},
) {
  const perfumeProducts = await prisma.product.findMany({
    where: { name: { contains: PERFUME_NAME, mode: "insensitive" } },
    select: { id: true, itemCode: true, name: true },
  });
  const perfumeIds = perfumeProducts.map((product) => product.id);

  const [catalogueResult, perfumeResult] = await Promise.all([
    prisma.product.updateMany({
      where: { id: { notIn: perfumeIds }, reorderLevel: { not: catalogue } },
      data: { reorderLevel: catalogue },
    }),
    perfumeIds.length === 0
      ? Promise.resolve({ count: 0 })
      : prisma.product.updateMany({
          where: { id: { in: perfumeIds }, reorderLevel: { not: perfume } },
          data: { reorderLevel: perfume },
        }),
  ]);

  const totalProducts = await prisma.product.count();

  return {
    catalogue: {
      target: catalogue,
      updated: catalogueResult.count,
      alreadyAtTarget: totalProducts - perfumeProducts.length - catalogueResult.count,
    },
    perfume: {
      target: perfume,
      matchedOn: PERFUME_NAME,
      updated: perfumeResult.count,
      products: perfumeProducts.map((product) => ({ itemCode: product.itemCode, name: product.name })),
    },
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const summary = await seedReorderLevels(prisma);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Reorder level seed failed");
    process.exit(1);
  });
}
