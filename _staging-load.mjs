/**
 * Replaces the catalogue in a remote database with the workbook's September
 * sheet. Products only: photos are uploaded separately, through the app's own
 * API, because the files have to land in the server's storage volume and a
 * database connection cannot put them there.
 *
 * Run it with the staging connection string in the environment, and nothing
 * else — no --env-file, which would quietly point this at the local database:
 *
 *   export DATABASE_URL='postgresql://<user>:<password>@<host>:<port>/<database>'
 *   node _staging-load.mjs
 *
 * Add --yes to skip the ten second pause before it deletes anything.
 */

import { spawn } from "node:child_process";

import { PrismaClient } from "@prisma/client";

const WORKBOOK = "C:/Users/Jerum/Downloads/REALTIME INVENTORY- NEW 3 (3).xlsx";
const SHEET = "REALTIME INVENTORY SEPTEMBER 20";

function refuseLocal(url) {
  const host = new URL(url).hostname;
  // A local host here means the connection string was never switched over, and
  // the run would wipe the working catalogue instead of the remote one.
  if (/^(localhost|127\.|\[::1\]|0\.0\.0\.0|host\.docker\.internal)/i.test(host)) {
    throw new Error(`DATABASE_URL points at ${host}. This script is for the remote database only.`);
  }
  return host;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = refuseLocal(url);
  const target = `${host}${new URL(url).pathname}`;

  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.count();
    const compatibilities = await prisma.productVehicleCompatibility.count();
    const withImages = await prisma.product.count({ where: { imageKey: { not: null } } });

    console.log(`target                : ${target}`);
    console.log(`products now          : ${products}`);
    console.log(`compatibilities now   : ${compatibilities}`);
    console.log(`products with a photo : ${withImages}`);

    // Anything hanging off a product blocks the delete and, more importantly,
    // means this database holds real trading history rather than a catalogue
    // waiting to be replaced.
    const blockers = {
      inventoryBalance: await prisma.inventoryBalance.count(),
      inventoryMovement: await prisma.inventoryMovement.count(),
      saleLine: await prisma.saleLine.count(),
      customerOrderLine: await prisma.customerOrderLine.count(),
      stockTransferLine: await prisma.stockTransferLine.count(),
      stockReceiptLine: await prisma.stockReceiptLine.count(),
    };
    const held = Object.entries(blockers).filter(([, n]) => n > 0);
    if (held.length > 0) {
      throw new Error(
        `Refusing to delete: products are referenced by ${held.map(([k, n]) => `${k}=${n}`).join(", ")}`,
      );
    }

    if (!process.argv.includes("--yes")) {
      console.log(`\nDeleting every product on ${target} in 10 seconds. Ctrl+C to stop.`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }

    const removed = await prisma.product.deleteMany({});
    console.log(`\ndeleted ${removed.count} product(s); compatibilities followed by cascade`);
    console.log(`remaining: ${await prisma.product.count()} products, ${await prisma.productVehicleCompatibility.count()} compatibilities\n`);
  } finally {
    await prisma.$disconnect();
  }

  // The importer is a separate process so it reads the same DATABASE_URL and
  // reports its own summary, exactly as it does against the local database.
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["prisma/import-products.mjs", `--file=${WORKBOOK}`, `--sheet=${SHEET}`, "--skip-images"],
      { stdio: "inherit", env: process.env },
    );
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`importer exited with ${code}`))));
    child.on("error", reject);
  });

  console.log("\nProducts are in. Photos are not: upload them with _staging-images.mjs.");
}

main().catch((error) => {
  console.error(`\nFailed: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
});
