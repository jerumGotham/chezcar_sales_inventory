import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Clears the transactions a deployed database has accumulated, so a branch can
 * open on a freshly loaded catalogue without its trial sales and transfers
 * behind it.
 *
 * What it keeps is the point. Roles, users, personnel, suppliers, branches and
 * customers are master data somebody typed in, and losing them means typing
 * them again. Products and inventory balances are kept because they have their
 * own loaders: the workbook import writes the catalogue, and
 * seed-branch-stock.mjs writes the opening counts. Deleting either here would
 * only make those two steps mandatory.
 *
 * What it removes is everything that records something having happened: sales,
 * refunds, orders, transfers, receipts, stock movements, backjobs, warranties,
 * supplier claims, and the notifications they raised.
 *
 * The balances that survive are therefore no longer explained by any movement.
 * That is deliberate — they are opening figures, and the sheet is their
 * explanation.
 *
 *   export DATABASE_URL='postgresql://<user>:<password>@<host>:<port>/<database>'
 *   export ALLOW_TRANSACTION_RESET=true
 *   node prisma/reset-transactions.mjs --host=<hostname>
 *   node prisma/reset-transactions.mjs --host=<hostname> --apply
 */

/*
 * Child before parent. Taken from reset-operational-data.mjs, which reviewed
 * this order, minus the tables this script keeps and plus the refund ledger.
 */
const DELETE_ORDER = [
  "pushDeliveryAttempt", "pushSubscription", "notification",
  "offlineSaleSubmission", "offlineSyncOperation", "offlineDeviceActivation",
  "supplierClaimEvidence", "supplierClaimSettlement", "supplierClaimAction",
  "customerWarrantyAction", "customerWarrantyEvent",
  "backjobAttachment", "backjobScheduleHistory", "backjobEvent",
  "inventoryMovement",
  "supplierClaimLine", "supplierClaim", "customerWarranty",
  "backjobPart", "backjobItem", "backjob",
  "refundLine", "refund",
  "payment",
  "saleAccountingReview", "saleCorrectionRequest", "saleSalespersonEvent",
  "saleLine", "manualReceipt", "sale",
  "customerOrderLine", "customerOrderSalespersonEvent", "customerOrder",
  "stockTransferResolutionLine", "stockTransferResolution",
  "stockTransferInvestigation", "stockTransferDiscrepancyLine",
  "stockTransferDiscrepancy", "stockTransferLine", "stockTransfer",
  "stockReceiptLine", "stockReceipt",
];

/** Named so a reader can see at a glance what survives. */
const KEPT = [
  "product", "productBranchPrice", "productVehicleCompatibility",
  "inventoryBalance", "customer", "supplier", "personnel", "location",
  "user", "roleDefinition", "userLocation", "auditLog",
];

function flag(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

/**
 * The host has to be typed out and match the connection string.
 *
 * An environment variable alone is not enough protection here: DATABASE_URL is
 * exported once and stays exported, and the mistake this guards against is
 * running the command in a shell still pointed at the wrong database. Naming
 * the host makes that mistake visible before anything is deleted.
 */
export function assertTarget(databaseUrl, expectedHost, allow) {
  if (allow !== "true") {
    throw new Error("ALLOW_TRANSACTION_RESET=true is required");
  }
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  if (!expectedHost) {
    throw new Error('Pass --host=<hostname>, the host this is meant to clear');
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a URL");
  }
  if (parsed.hostname !== expectedHost) {
    throw new Error(
      `Refusing: DATABASE_URL points at ${parsed.hostname}, not the ${expectedHost} given with --host`,
    );
  }
  return { host: parsed.hostname, database: decodeURIComponent(parsed.pathname.slice(1)) };
}

export async function resetTransactions(prisma, { apply = false } = {}) {
  const countAll = async () => {
    const counts = {};
    for (const model of DELETE_ORDER) counts[model] = await prisma[model].count();
    return counts;
  };

  const before = await countAll();
  const total = Object.values(before).reduce((sum, n) => sum + n, 0);
  const holding = Object.fromEntries(Object.entries(before).filter(([, n]) => n > 0));

  const kept = {};
  for (const model of KEPT) kept[model] = await prisma[model].count();

  if (!apply) {
    return { applied: false, wouldDelete: total, holding, kept };
  }

  const deleted = {};
  await prisma.$transaction(async (tx) => {
    /*
     * Four audit tables reject their own deletion through a trigger. The
     * triggers read this setting and step aside for a reset rather than being
     * disabled, so they stay armed against every other connection while this
     * transaction runs.
     */
    await tx.$executeRaw`SELECT set_config('chezcar.operational_data_reset', 'true', true)`;
    for (const model of DELETE_ORDER) {
      deleted[model] = (await tx[model].deleteMany({})).count;
    }
  });

  const after = await countAll();
  const left = Object.entries(after).filter(([, n]) => n > 0);
  if (left.length > 0) {
    throw new Error(`Rows survived: ${left.map(([k, n]) => `${k}=${n}`).join(", ")}`);
  }

  return {
    applied: true,
    deleted: Object.fromEntries(Object.entries(deleted).filter(([, n]) => n > 0)),
    deletedTotal: Object.values(deleted).reduce((sum, n) => sum + n, 0),
    kept,
  };
}

async function main() {
  const target = assertTarget(
    process.env.DATABASE_URL,
    flag("host"),
    process.env.ALLOW_TRANSACTION_RESET,
  );
  const apply = process.argv.includes("--apply");

  const prisma = new PrismaClient();
  try {
    console.log(`Target: ${target.host}/${target.database}\n`);
    const result = await resetTransactions(prisma, { apply });
    console.log(JSON.stringify(result, null, 2));
    if (!apply) console.log("\nNothing was deleted. Re-run with --apply to clear these.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nFailed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
