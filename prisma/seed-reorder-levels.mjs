import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Sets a reorder level of 2 on the catalogue, which is the point the Inventory
 * screen starts calling a product low. Perfume is left alone: it is bought and
 * sold in a different rhythm from the rest of the catalogue, so the same
 * threshold would only produce noise for it.
 *
 * Safe to run more than once: it writes only the products that do not already
 * hold the target, so a second run reports nothing changed.
 */

const TARGET_REORDER_LEVEL = 2;

/** Matched on the name, which is the only place perfume is identified. */
const EXCLUDED_NAME_PATTERN = "%perfume%";

export async function seedReorderLevels(prisma, { target = TARGET_REORDER_LEVEL } = {}) {
  const excluded = await prisma.product.findMany({
    where: { name: { contains: "perfume", mode: "insensitive" } },
    select: { id: true, itemCode: true, name: true, reorderLevel: true },
  });
  const excludedIds = excluded.map((product) => product.id);

  const { count } = await prisma.product.updateMany({
    where: {
      id: { notIn: excludedIds },
      reorderLevel: { not: target },
    },
    data: { reorderLevel: target },
  });

  const totalProducts = await prisma.product.count();

  return {
    target,
    productsUpdated: count,
    productsAlreadyAtTarget: totalProducts - excluded.length - count,
    excludedPattern: EXCLUDED_NAME_PATTERN,
    excluded: excluded.map((product) => ({
      itemCode: product.itemCode,
      name: product.name,
      reorderLevel: product.reorderLevel,
    })),
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
