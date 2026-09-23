/**
 * Imports the REALTIME INVENTORY workbook into Product, ProductVehicleCompatibility
 * and the product image store.
 *
 * The spreadsheet is a working document, not an export: the header does not sit
 * on the first row, one column has no header at all, prices carry thousands
 * separators, and a single YEAR MODEL cell can hold several ranges separated by
 * runs of spaces. Everything below is built around that rather than against it.
 *
 * An .xlsx source also carries the product photos, anchored to column G. A .csv
 * never does, so images are simply absent when a CSV is given.
 *
 * Dry run (writes nothing, touches no files):
 *   node --env-file=.env prisma/import-products.mjs --dry-run
 *
 * Import:
 *   node --env-file=.env prisma/import-products.mjs
 *
 * Options:
 *   --file=<path>     read a different workbook or CSV
 *   --sheet=<name>    choose the sheet; defaults to the last one with an ITEM CODE header
 *   --skip-images     import products only
 *   --limit=<n>       only process the first n data rows, for a quick look
 */

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

/**
 * This workbook is the September 2026 snapshot, so "2021+" means "2021 through
 * the end of that snapshot". Reading the machine clock instead would silently
 * change the data every year the importer is rerun.
 */
const IMPORT_CURRENT_YEAR = 2026;

const DEFAULT_SOURCE = "C:/Users/Jerum/Downloads/REALTIME INVENTORY- NEW 3 (1).xlsx";

/** Matches the range the application already validates vehicle years against. */
const MIN_YEAR = 1886;
const MAX_YEAR = 2200;

/** Column positions, confirmed against the header row of this workbook. */
const COL = Object.freeze({
  itemCode: 0,      // A  ITEM CODE
  name: 1,          // B  ITEM NAME
  description: 2,   // C  no header; holds the long description
  brand: 3,         // D  BRAND
  carModel: 4,      // E  CAR MODEL
  yearModel: 5,     // F  YEAR MODEL
  price: 14,        // O  DISCOUNTED PRICE
});

const HEADER_MARKER = "ITEM CODE";

/** The full header signature of the catalogue sheet, not just one column. */
const REQUIRED_HEADERS = Object.freeze(["ITEM CODE", "ITEM NAME", "CAR MODEL", "YEAR MODEL", "DISCOUNTED PRICE"]);

/** Mirrors lib/server/services/product-images.ts so imported files pass its rules. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Normalisation helpers. No database access below this line until writeAll().
// ---------------------------------------------------------------------------

/** Trims, collapses inner whitespace runs, and turns blanks into null. */
function normalizeString(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/**
 * Parses a money cell into a Prisma Decimal.
 *
 * Money never touches a float here: the cleaned text goes straight into
 * Decimal, which is what the column stores. A blank or unreadable cell returns
 * null with a reason rather than zero, because zero is a real price and would
 * be indistinguishable from "we never knew".
 */
function parsePrice(value) {
  const text = String(value ?? "").replace(/[\s\u20B1]/g, "").replace(/,/g, "");
  if (text === "") return { price: null, reason: "blank" };
  if (!/^\d+(\.\d+)?$/.test(text)) return { price: null, reason: "not a number" };

  const decimal = new Prisma.Decimal(text).toDecimalPlaces(2);
  // Decimal(12, 2) leaves ten digits ahead of the point.
  if (decimal.greaterThan(new Prisma.Decimal("9999999999.99"))) {
    return { price: null, reason: "too large for Decimal(12,2)" };
  }
  return { price: decimal, reason: null };
}

function inYearRange(year) {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Turns one YEAR MODEL cell into zero or more year entries.
 *
 * A cell may hold several ranges run together by whitespace, so the cell is cut
 * into tokens and every token must match a known shape completely. Matching
 * loosely would quietly rescue typos: a search for four digits inside
 * "20019-2011" finds "2011" and would import a wrong year as though it were
 * clean. Anything a token cannot fully explain is reported instead.
 */
function parseYearModels(value) {
  const entries = [];
  const invalid = [];

  // Pull spaces out of "2022 - 2026" so a range survives tokenising.
  const text = String(value ?? "").replace(/\s+/g, " ").trim().replace(/\s*-\s*/g, "-");
  if (text === "") return { entries, invalid };

  for (const token of text.split(" ")) {
    if (token === "") continue;
    const upper = token.toUpperCase();

    if (upper === "UNIVERSAL" || upper === "N/A" || upper === "NA") {
      entries.push({
        yearsLabel: upper === "NA" ? "N/A" : upper,
        startYear: null,
        endYear: null,
      });
      continue;
    }

    const range = token.match(/^(\d{4})-(\d{4})$/);
    if (range) {
      let start = Number(range[1]);
      let end = Number(range[2]);
      if (!inYearRange(start) || !inYearRange(end)) {
        invalid.push(token);
        continue;
      }
      // A backwards range is an obvious slip, and its intent is unambiguous.
      if (start > end) {
        const swap = start;
        start = end;
        end = swap;
      }
      entries.push({ yearsLabel: `${start}-${end}`, startYear: start, endYear: end });
      continue;
    }

    const openEnded = token.match(/^(\d{4})\+$/);
    if (openEnded) {
      const start = Number(openEnded[1]);
      if (!inYearRange(start)) {
        invalid.push(token);
        continue;
      }
      entries.push({
        yearsLabel: `${start}+`,
        startYear: start,
        endYear: Math.max(start, IMPORT_CURRENT_YEAR),
      });
      continue;
    }

    const single = token.match(/^(\d{4})$/);
    if (single) {
      const year = Number(single[1]);
      if (!inYearRange(year)) {
        invalid.push(token);
        continue;
      }
      entries.push({ yearsLabel: String(year), startYear: year, endYear: year });
      continue;
    }

    invalid.push(token);
  }

  return { entries, invalid };
}

/** Identity of a compatibility row, used to drop exact repeats. */
function compatibilityKey(entry) {
  return [entry.model.toUpperCase(), entry.yearsLabel ?? ""].join("\u0000");
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Reads the type from the bytes rather than the name inside the zip, because a
 * file called .jpg is not proof of anything and the application rejects an
 * image whose content does not match its declared type.
 */
function sniffImage(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((value, index) => bytes[index] === value)) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

function storageRoot() {
  return path.resolve(
    process.env.PRODUCT_IMAGE_STORAGE_PATH ?? path.join(process.cwd(), "data", "product-images"),
  );
}

function xmlOf(files, entry) {
  const file = files[entry];
  if (!file) return null;
  const bytes = file.content ?? file._data;
  return bytes ? Buffer.from(bytes).toString("utf8") : null;
}

/**
 * Maps every picture on a sheet to the spreadsheet row it sits on.
 *
 * Excel keeps pictures outside the cell grid: the sheet points at a drawing,
 * the drawing anchors each picture to a row and column, and a separate
 * relationship file says which image file that anchor shows. All three hops are
 * needed to answer "which product owns this photo".
 */
function extractSheetImages(workbook, sheetName) {
  const files = workbook.files ?? {};
  const byRow = new Map();

  const workbookXml = xmlOf(files, "xl/workbook.xml");
  const workbookRels = xmlOf(files, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRels) return byRow;

  const sheetEntry = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)]
    .find((match) => match[1] === sheetName);
  if (!sheetEntry) return byRow;

  const targets = new Map(
    [...workbookRels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const sheetTarget = targets.get(sheetEntry[2]);
  if (!sheetTarget) return byRow;

  const sheetFile = sheetTarget.replace(/^\/?(xl\/)?/, "");
  const sheetRels = xmlOf(files, `xl/worksheets/_rels/${path.basename(sheetFile)}.rels`);
  if (!sheetRels) return byRow;

  const drawingTarget = [...sheetRels.matchAll(/Target="([^"]*drawings\/[^"]+)"/g)][0];
  if (!drawingTarget) return byRow;

  const drawingPath = drawingTarget[1].replace("../", "xl/");
  const drawingXml = xmlOf(files, drawingPath);
  const drawingRels = xmlOf(
    files,
    `${path.posix.dirname(drawingPath)}/_rels/${path.basename(drawingPath)}.rels`,
  );
  if (!drawingXml || !drawingRels) return byRow;

  const media = new Map(
    [...drawingRels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
      .map((m) => [m[1], m[2].replace("../", "xl/")]),
  );

  for (const block of drawingXml.split(/<xdr:(?:one|two)CellAnchor/).slice(1)) {
    const row = block.match(/<xdr:row>(\d+)<\/xdr:row>/);
    const embed = block.match(/r:embed="([^"]+)"/);
    if (!row || !embed) continue;

    const entry = media.get(embed[1]);
    const file = entry && files[entry];
    if (!file) continue;

    const bytes = Buffer.from(file.content ?? file._data);
    // A row shows one photo; if several are stacked, the first one wins.
    if (!byRow.has(Number(row[1]))) byRow.set(Number(row[1]), { entry, bytes });
  }

  return byRow;
}

// ---------------------------------------------------------------------------
// Source reading
// ---------------------------------------------------------------------------

function findHeaderIndex(rows) {
  return rows.findIndex((row) =>
    row.some((cell) => String(cell ?? "").trim().toUpperCase() === HEADER_MARKER),
  );
}

/**
 * Several months live in one workbook and every one of them has an ITEM CODE
 * header, so picking the first match would quietly import June. The last such
 * sheet is the newest, and the chosen name is printed so a wrong guess is
 * visible before anything is written.
 */
function readSource(file, sheetName, wantImages) {
  const isCsv = file.toLowerCase().endsWith(".csv");
  const workbook = XLSX.read(readFileSync(file), {
    type: "buffer",
    raw: true,
    bookFiles: !isCsv && wantImages,
  });

  let chosen = sheetName;
  if (!chosen) {
    // Nearly thirty sheets carry an ITEM CODE column, including per-branch
    // tallies with an entirely different shape. Only a sheet holding the whole
    // signature is the catalogue, and months are indistinguishable by shape, so
    // the choice between them is the caller's to make rather than a guess.
    const candidates = workbook.SheetNames.filter((name) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1, blankrows: true, defval: "",
      });
      const index = findHeaderIndex(rows.slice(0, 20));
      if (index === -1) return false;
      const header = rows[index].map((cell) => String(cell ?? "").trim().toUpperCase());
      return REQUIRED_HEADERS.every((needed) => header.includes(needed));
    });
    if (candidates.length === 0) {
      throw new Error(
        `No sheet in ${file} carries all of: ${REQUIRED_HEADERS.join(", ")}`,
      );
    }
    if (candidates.length > 1) {
      const list = candidates.map((name) => `  --sheet="${name}"`).join("\n");
      throw new Error(
        `${candidates.length} sheets match the catalogue layout. Choose one:\n${list}`,
      );
    }
    chosen = candidates[0];
  }

  const sheet = workbook.Sheets[chosen];
  if (!sheet) throw new Error(`Sheet "${chosen}" not found in ${file}`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: "" });
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex === -1) {
    throw new Error(`Sheet "${chosen}" has no header row containing "${HEADER_MARKER}"`);
  }

  const images = !isCsv && wantImages ? extractSheetImages(workbook, chosen) : new Map();
  return { sheetName: chosen, headerIndex, header: rows[headerIndex], rows, images, isCsv };
}

// ---------------------------------------------------------------------------
// Building the import set
// ---------------------------------------------------------------------------

function buildImport(source, limit) {
  const { rows, headerIndex, images } = source;
  const products = new Map();
  const stats = {
    rowsRead: 0,
    skippedNoItemCode: 0,
    skippedNoName: 0,
    priceMissing: 0,
    duplicateItemCodes: 0,
    compatibilitiesBuilt: 0,
    compatibilityDuplicatesRemoved: 0,
    invalidYearCells: 0,
    rowsWithoutModel: 0,
    imagesAttached: 0,
    imagesRejected: 0,
    imagesOrphaned: 0,
  };
  const problems = [];

  const dataRows = limit
    ? rows.slice(headerIndex + 1, headerIndex + 1 + limit)
    : rows.slice(headerIndex + 1);

  const usedImageRows = new Set();

  dataRows.forEach((row, offset) => {
    // The sheet_to_json index equals the drawing anchor row, both 0-based.
    const rowIndex = headerIndex + 1 + offset;
    const csvRow = rowIndex + 1;
    if (row.every((cell) => String(cell ?? "").trim() === "")) return;
    stats.rowsRead += 1;

    const itemCode = normalizeString(row[COL.itemCode]);
    const name = normalizeString(row[COL.name]);

    if (!itemCode) {
      stats.skippedNoItemCode += 1;
      problems.push({ csvRow, itemCode: "", name: name ?? "", problem: "missing itemCode", value: "" });
      return;
    }
    if (!name) {
      stats.skippedNoName += 1;
      problems.push({ csvRow, itemCode, name: "", problem: "missing name", value: "" });
      return;
    }

    const { price, reason } = parsePrice(row[COL.price]);
    if (price === null) {
      stats.priceMissing += 1;
      problems.push({
        csvRow, itemCode, name,
        problem: `price ${reason}; imported without a price`,
        value: String(row[COL.price] ?? ""),
      });
    }

    const model = normalizeString(row[COL.carModel]);
    const { entries, invalid } = parseYearModels(row[COL.yearModel]);
    if (invalid.length > 0) {
      stats.invalidYearCells += 1;
      problems.push({
        csvRow, itemCode, name,
        problem: `unreadable year value(s): ${invalid.join(", ")}`,
        value: String(row[COL.yearModel] ?? ""),
      });
    }
    if (!model) stats.rowsWithoutModel += 1;

    let product = products.get(itemCode);
    if (product) {
      stats.duplicateItemCodes += 1;
      problems.push({
        csvRow, itemCode, name,
        problem: `duplicate itemCode, first seen on row ${product.firstRow}; compatibilities merged`,
        value: "",
      });
      if (product.description === null) product.description = normalizeString(row[COL.description]);
      if (product.brand === null) product.brand = normalizeString(row[COL.brand]);
      if (product.price === null && price !== null) product.price = price;
    } else {
      product = {
        firstRow: csvRow,
        itemCode,
        name,
        description: normalizeString(row[COL.description]),
        brand: normalizeString(row[COL.brand]),
        price,
        image: null,
        compatibilities: [],
        seen: new Set(),
      };
      products.set(itemCode, product);
    }

    const picture = images.get(rowIndex);
    if (picture && !product.image) {
      usedImageRows.add(rowIndex);
      const kind = sniffImage(picture.bytes);
      if (!kind) {
        stats.imagesRejected += 1;
        problems.push({ csvRow, itemCode, name, problem: "image is not a JPEG, PNG or WebP", value: picture.entry });
      } else if (picture.bytes.length <= 0 || picture.bytes.length > MAX_IMAGE_BYTES) {
        stats.imagesRejected += 1;
        problems.push({
          csvRow, itemCode, name,
          problem: `image is ${(picture.bytes.length / 1048576).toFixed(2)} MB, over the 6 MB limit`,
          value: picture.entry,
        });
      } else {
        product.image = { ...kind, bytes: picture.bytes, entry: picture.entry };
        stats.imagesAttached += 1;
      }
    }

    if (!model) return;

    // A model with no readable year is still a real fitment statement.
    const yearEntries = entries.length > 0
      ? entries
      : [{ yearsLabel: null, startYear: null, endYear: null }];

    for (const entry of yearEntries) {
      const candidate = { model, make: null, ...entry };
      const key = compatibilityKey(candidate);
      if (product.seen.has(key)) {
        stats.compatibilityDuplicatesRemoved += 1;
        continue;
      }
      product.seen.add(key);
      product.compatibilities.push(candidate);
      stats.compatibilitiesBuilt += 1;
    }
  });

  // A photo on a row that carried no importable product is worth reporting.
  for (const rowIndex of images.keys()) {
    if (!usedImageRows.has(rowIndex)) stats.imagesOrphaned += 1;
  }

  return { products: [...products.values()], stats, problems };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * One transaction per product: the product is upserted by its item code, then
 * its compatibility rows are replaced wholesale. Replacing rather than merging
 * is what makes a rerun land on the same result, and the delete is scoped to
 * the product being imported, so rows belonging to products outside this import
 * are never touched.
 *
 * The image file is written before the transaction and removed again if the
 * transaction fails, so the store never keeps a file no product points at.
 */
async function writeAll(prisma, products, onProgress) {
  const result = { created: 0, updated: 0, compatibilities: 0, images: 0, failed: 0 };
  const root = storageRoot();
  let rootReady = false;

  for (const [index, product] of products.entries()) {
    let writtenKey = null;
    let replacedKey = null;

    try {
      let imageKey = null;
      let imageType = null;

      if (product.image) {
        if (!rootReady) {
          await mkdir(root, { recursive: true });
          rootReady = true;
        }
        imageKey = `${randomUUID()}.${product.image.extension}`;
        imageType = product.image.contentType;
        await writeFile(path.join(root, imageKey), product.image.bytes, { flag: "wx" });
        writtenKey = imageKey;
      }

      await prisma.$transaction(async (tx) => {
        const existing = await tx.product.findUnique({
          where: { itemCode: product.itemCode },
          select: { id: true, imageKey: true },
        });

        const data = {
          name: product.name,
          description: product.description,
          brand: product.brand,
          price: product.price,
          category: null,
          reorderLevel: 0,
          warrantyDurationMonths: null,
          status: "ACTIVE",
        };
        // Without a photo in this import, whatever the product already has stays.
        if (imageKey) {
          data.imageKey = imageKey;
          data.imageType = imageType;
          replacedKey = existing?.imageKey ?? null;
        }

        const saved = existing
          ? await tx.product.update({
              where: { itemCode: product.itemCode },
              data,
              select: { id: true },
            })
          : await tx.product.create({
              data: { itemCode: product.itemCode, ...data },
              select: { id: true },
            });

        if (existing) result.updated += 1;
        else result.created += 1;

        await tx.productVehicleCompatibility.deleteMany({ where: { productId: saved.id } });

        if (product.compatibilities.length > 0) {
          await tx.productVehicleCompatibility.createMany({
            data: product.compatibilities.map((entry) => ({
              productId: saved.id,
              make: entry.make,
              model: entry.model,
              yearsLabel: entry.yearsLabel,
              startYear: entry.startYear,
              endYear: entry.endYear,
            })),
          });
          result.compatibilities += product.compatibilities.length;
        }
      });

      if (writtenKey) result.images += 1;
      // The row now points at the new file, so the old one is safe to drop.
      if (replacedKey && replacedKey !== writtenKey) {
        await unlink(path.join(root, replacedKey)).catch(() => {});
      }
    } catch (error) {
      result.failed += 1;
      if (writtenKey) await unlink(path.join(root, writtenKey)).catch(() => {});
      const message = String(error && error.message ? error.message : error).split("\n")[0];
      console.error(`  ! ${product.itemCode} (row ${product.firstRow}): ${message}`);
    }

    if ((index + 1) % 200 === 0) onProgress(index + 1, products.length);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { dryRun: false, file: DEFAULT_SOURCE, sheet: "", limit: 0, images: true };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-images") options.images = false;
    else if (arg.startsWith("--file=")) options.file = arg.slice("--file=".length);
    else if (arg.startsWith("--sheet=")) options.sheet = arg.slice("--sheet=".length);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length)) || 0;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printProblems(problems) {
  if (problems.length === 0) return;
  console.log("\n---------- rows needing attention ----------");
  for (const problem of problems) {
    const value = problem.value ? `  value=${JSON.stringify(String(problem.value).slice(0, 60))}` : "";
    console.log(
      `  row ${String(problem.csvRow).padStart(5)}  ${String(problem.itemCode || "-").padEnd(8)}` +
        `  ${(problem.name || "-").slice(0, 28).padEnd(28)}  ${problem.problem}${value}`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Reading ${options.file}`);
  if (options.dryRun) console.log("DRY RUN: nothing will be written.\n");

  const source = readSource(options.file, options.sheet, options.images);
  console.log(`Sheet: "${source.sheetName}"`);
  const headerLine = source.header
    .map((cell, index) => `${index}:${String(cell ?? "").trim() || "(blank)"}`)
    .join(" | ");
  console.log(`Header on row ${source.headerIndex + 1}: ${headerLine}`);
  console.log(`Pictures found on this sheet: ${source.images.size}\n`);

  const { products, stats, problems } = buildImport(source, options.limit);

  let written = { created: 0, updated: 0, compatibilities: 0, images: 0, failed: 0 };
  const prisma = options.dryRun ? null : new PrismaClient();

  try {
    if (prisma) {
      console.log(`Writing ${products.length} product(s)...`);
      written = await writeAll(prisma, products, (done, total) => console.log(`  ${done}/${total}`));
    }

    printProblems(problems);

    const skipped = stats.skippedNoItemCode + stats.skippedNoName;
    console.log("\n========== PRODUCT IMPORT SUMMARY ==========\n");
    console.log(`Source rows read:                  ${stats.rowsRead}`);
    console.log(`Unique products found:             ${products.length}`);
    console.log(`Products created:                  ${options.dryRun ? "-" : written.created}`);
    console.log(`Products updated:                  ${options.dryRun ? "-" : written.updated}`);
    console.log(`Products skipped:                  ${skipped}`);
    console.log("");
    console.log(`Vehicle compatibilities:           ${stats.compatibilitiesBuilt}`);
    console.log(`Compatibility duplicates removed:  ${stats.compatibilityDuplicatesRemoved}`);
    console.log(`Rows with no car model:            ${stats.rowsWithoutModel}`);
    console.log("");
    console.log(`Images matched to a product:       ${stats.imagesAttached}`);
    console.log(`Images written:                    ${options.dryRun ? "-" : written.images}`);
    console.log(`Images rejected:                   ${stats.imagesRejected}`);
    console.log(`Images on a skipped row:           ${stats.imagesOrphaned}`);
    console.log("");
    console.log(`Duplicate item codes found:        ${stats.duplicateItemCodes}`);
    console.log(`Missing itemCode:                  ${stats.skippedNoItemCode}`);
    console.log(`Missing name:                      ${stats.skippedNoName}`);
    console.log(`Missing/invalid price:             ${stats.priceMissing}  (imported with no price)`);
    console.log(`Invalid year values:               ${stats.invalidYearCells}`);
    console.log(`Write errors:                      ${options.dryRun ? "-" : written.failed}`);
    console.log("\n============================================");
    if (options.dryRun) console.log("\nDry run complete. Nothing was written.");

    if (!options.dryRun && written.failed > 0) process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\nImport failed: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
});
