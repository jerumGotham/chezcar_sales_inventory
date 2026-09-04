// @ts-check

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

const DEFAULT_INPUT = "file-sample/Inventory.xlsx";
const DEFAULT_OUTPUT = "prisma/fixtures/opening-catalog.json";
const SHEET = "REALTIME INVENTORY JUNE 2026";
const EXPECTED_RANGE = "A1:P1442";
const LOCATION_COLUMNS = Object.freeze([
  ["SR", 7, "WAREHOUSE", "Stock Room"],
  ["QC", 8, "BRANCH", "QC Branch"],
  ["BL", 9, "BRANCH", "BL Branch"],
  ["LU", 10, "BRANCH", "LU Branch"],
  ["VC", 11, "BRANCH", "VC Branch"],
  ["SP", 12, "BRANCH", "SP Branch"],
]);

function normalizedText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function money(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value.toFixed(2);
}

function stableText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function vehicleCompatibility(modelValue, yearValue) {
  const model = normalizedText(modelValue);
  if (!model) return [];
  const year = normalizedText(yearValue);
  const match = year.match(/^(\d{4})(?:\s*-\s*(\d{4}))?$/);
  const startYear = match ? Number(match[1]) : null;
  const endYear = match ? Number(match[2] ?? match[1]) : null;
  const hasValidRange = startYear !== null && endYear !== null && startYear <= endYear;
  return [{
    make: null,
    model,
    startYear: hasValidRange ? startYear : null,
    endYear: hasValidRange ? endYear : null,
  }];
}

function argumentsFrom(argv) {
  const values = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") values.check = true;
    else if (argument === "--input") values.input = argv[++index];
    else if (argument === "--output") values.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return values;
}

export async function generateJune2026Fixture(inputPath) {
  const bytes = await readFile(inputPath);
  const workbookHash = createHash("sha256").update(bytes).digest("hex");
  const workbook = XLSX.read(bytes, {
    type: "buffer",
    sheets: SHEET,
    cellFormula: false,
    cellDates: false,
  });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) throw new Error(`Sheet "${SHEET}" was not found`);
  if (sheet["!ref"] !== EXPECTED_RANGE) {
    throw new Error(`Expected ${SHEET} range ${EXPECTED_RANGE}, received ${sheet["!ref"] ?? "none"}`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const header = rows[2] ?? [];
  if (normalizedText(header[0]) !== "ITEM CODE" || normalizedText(header[1]) !== "ITEM NAME") {
    throw new Error("June 2026 item headers are invalid");
  }

  const products = [];
  const openingBalances = [];
  const excludedRows = [];
  const zeroedNegativeBalances = [];
  const inactivePriceRows = [];
  const itemCodes = new Set();

  for (let index = 3; index < 1442; index += 1) {
    const row = rows[index] ?? [];
    const sourceRow = index + 1;
    const itemCode = normalizedText(row[0]);
    const name = normalizedText(row[1]);
    if (!itemCode && !name) continue;
    if (!itemCode || !name) {
      excludedRows.push({ row: sourceRow, itemCode: itemCode || null, name: name || null, reason: !itemCode ? "MISSING_ITEM_CODE" : "MISSING_ITEM_NAME" });
      continue;
    }
    if (itemCodes.has(itemCode)) throw new Error(`Duplicate item code ${itemCode} at row ${sourceRow}`);
    itemCodes.add(itemCode);

    const salePrice = money(row[14]);
    if (salePrice === null) inactivePriceRows.push(sourceRow);
    products.push({
      itemCode,
      name,
      description: normalizedText(row[2]) || null,
      brand: normalizedText(row[3]) || null,
      vehicleCompatibilities: vehicleCompatibility(row[4], row[5]),
      salePrice,
      status: salePrice === null ? "INACTIVE" : "ACTIVE",
      sellable: salePrice !== null,
      sourceIds: [`${SHEET}@${sourceRow}`],
    });
    for (const [locationCode, column] of LOCATION_COLUMNS) {
      const sourceQuantity = row[column];
      const validQuantity = typeof sourceQuantity === "number" && Number.isSafeInteger(sourceQuantity);
      if (!validQuantity && sourceQuantity !== null && sourceQuantity !== "") {
        throw new Error(`Invalid ${locationCode} quantity at row ${sourceRow}`);
      }
      const onHand = validQuantity ? Math.max(0, sourceQuantity) : 0;
      if (validQuantity && sourceQuantity < 0) {
        zeroedNegativeBalances.push({ row: sourceRow, itemCode, locationCode, sourceQuantity, seededQuantity: 0 });
      }
      openingBalances.push({ itemCode, locationCode, onHand, sourceId: `${SHEET}@${sourceRow}:${locationCode}` });
    }
  }

  products.sort((left, right) => left.itemCode.localeCompare(right.itemCode, "en", { numeric: true }));
  openingBalances.sort((left, right) => left.itemCode.localeCompare(right.itemCode, "en", { numeric: true }) || left.locationCode.localeCompare(right.locationCode));
  const fixtureBase = {
    schemaVersion: 2,
    generatedFrom: {
      workbookHash,
      sheet: SHEET,
      range: EXPECTED_RANGE,
      policy: "Negative quantities become zero; invalid-price products are inactive; rows missing item code or name are excluded.",
    },
    importSummary: {
      worksheetRows: 1442,
      products: products.length,
      openingBalances: openingBalances.length,
      excludedRows,
      zeroedNegativeBalances,
      inactivePriceRows,
    },
    locations: LOCATION_COLUMNS.map(([code, , type, name]) => ({ code, name, type, sourceIds: [`${SHEET}@3`] })).sort((left, right) => left.code.localeCompare(right.code)),
    products,
    openingBalances,
  };
  return { ...fixtureBase, fixtureHash: hash(stableText(fixtureBase)) };
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  const output = stableText(await generateJune2026Fixture(resolve(options.input)));
  if (options.check) {
    const current = await readFile(resolve(options.output), "utf8");
    if (current !== output) throw new Error("Committed June 2026 fixture is stale");
    console.log("June 2026 fixture is current");
    return;
  }
  await writeFile(resolve(options.output), output);
  console.log(`Generated ${options.output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
