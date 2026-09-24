import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Seeds opening branch stock from the REALTIME INVENTORY sheet.
 *
 * The per-branch counts sit in columns I to M. Column H carries a second "BL"
 * header but is empty throughout, so the branch a column belongs to is taken
 * from its position, not its header text. As a guard against that mapping
 * drifting, every row is checked against the sheet's own TOTAL STOCK AVAILABLE
 * and the run refuses to write if any row disagrees.
 *
 * Quantities are set, never added, so running it twice leaves the same numbers.
 * A branch that has no figure for a product is left alone rather than zeroed:
 * this seeds what the sheet knows and does not claim the sheet is complete.
 *
 *   node --env-file=.env prisma/seed-branch-stock.mjs --file=<path.csv>
 *   node --env-file=.env prisma/seed-branch-stock.mjs --file=<path.csv> --dry-run
 */

/** Spreadsheet column I to M, by position. */
const BRANCH_COLUMNS = { 8: "QC", 9: "BL", 10: "LU", 11: "VC", 12: "SP" };
const TOTAL_COLUMN = 13;
const ITEM_CODE_COLUMN = 0;

/**
 * Parses the whole file rather than a line at a time. Several description cells
 * carry a newline inside their quotes, and splitting on newlines first tore
 * those rows in half and dropped the stock counted on them.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; } else { quoted = false; }
      } else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (character !== "\r") field += character;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function toQuantity(value) {
  const cleaned = (value ?? "").trim().replace(/,/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export async function readBranchStock(filePath) {
  const rows = parseCsv(await readFile(filePath, "utf8"));

  const headerIndex = rows.findIndex((row) => (row[ITEM_CODE_COLUMN] ?? "").trim().toUpperCase() === "ITEM CODE");
  if (headerIndex === -1) throw new Error("No ITEM CODE header found; is this the inventory sheet?");

  const entries = [];
  const disagreements = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const itemCode = (row[ITEM_CODE_COLUMN] ?? "").trim();
    if (!itemCode || row.length <= TOTAL_COLUMN) continue;

    const quantities = Object.entries(BRANCH_COLUMNS).map(([column, code]) => ({
      code,
      quantity: toQuantity(row[Number(column)]),
    }));
    const summed = quantities.reduce((total, entry) => total + entry.quantity, 0);
    // The TOTAL cell is a formula and some rows exported blank. A missing total
    // is nothing to check against, not a disagreement.
    const statedText = (row[TOTAL_COLUMN] ?? "").trim();
    if (statedText) {
      const stated = toQuantity(statedText);
      if (stated !== summed) disagreements.push({ itemCode, stated, summed });
    }

    for (const entry of quantities) {
      if (entry.quantity > 0) entries.push({ itemCode, code: entry.code, quantity: entry.quantity });
    }
  }

  return { entries, disagreements };
}

export async function seedBranchStock(prisma, filePath, { dryRun = false } = {}) {
  const { entries, disagreements } = await readBranchStock(filePath);
  if (disagreements.length > 0) {
    throw new Error(
      `${disagreements.length} row(s) do not match their own TOTAL STOCK AVAILABLE; ` +
        `the column mapping is wrong. First: item ${disagreements[0].itemCode} ` +
        `states ${disagreements[0].stated}, columns sum to ${disagreements[0].summed}`,
    );
  }

  const [products, locations] = await Promise.all([
    prisma.product.findMany({ select: { id: true, itemCode: true } }),
    prisma.location.findMany({ select: { id: true, code: true } }),
  ]);
  const productByCode = new Map(products.map((product) => [product.itemCode.trim(), product.id]));
  const locationByCode = new Map(locations.map((location) => [location.code, location.id]));

  const summary = {
    rowsWithStock: new Set(entries.map((entry) => entry.itemCode)).size,
    balances: entries.length,
    units: entries.reduce((total, entry) => total + entry.quantity, 0),
    written: 0,
    unchanged: 0,
    unknownProducts: [...new Set(entries.filter((entry) => !productByCode.has(entry.itemCode)).map((entry) => entry.itemCode))],
    unknownBranches: [...new Set(entries.filter((entry) => !locationByCode.has(entry.code)).map((entry) => entry.code))],
    dryRun,
  };

  if (dryRun) return summary;

  for (const entry of entries) {
    const productId = productByCode.get(entry.itemCode);
    const locationId = locationByCode.get(entry.code);
    if (!productId || !locationId) continue;

    const existing = await prisma.inventoryBalance.findUnique({
      where: { locationId_productId: { locationId, productId } },
      select: { id: true, onHand: true },
    });
    if (existing?.onHand === entry.quantity) {
      summary.unchanged += 1;
      continue;
    }
    await prisma.inventoryBalance.upsert({
      where: { locationId_productId: { locationId, productId } },
      create: { locationId, productId, onHand: entry.quantity },
      // Only the counted quantity is touched; reserved and quarantined belong to
      // work the app is tracking and are none of this seed's business.
      update: { onHand: entry.quantity, version: { increment: 1 } },
    });
    summary.written += 1;
  }

  return summary;
}

async function main() {
  const fileArgument = process.argv.slice(2).find((argument) => argument.startsWith("--file="));
  if (!fileArgument) throw new Error("Pass --file=<path to the inventory CSV>");
  const dryRun = process.argv.includes("--dry-run");

  const prisma = new PrismaClient();
  try {
    const summary = await seedBranchStock(prisma, fileArgument.slice("--file=".length), { dryRun });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Branch stock seed failed");
    process.exit(1);
  });
}
