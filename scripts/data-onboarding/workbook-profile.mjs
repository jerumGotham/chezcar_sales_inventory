// @ts-check

import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

import {
  CANONICAL_LOCATIONS,
  buildReviewFindings,
  profileCellEvidenceSchema,
  resolutionRecordSchema,
  reviewFindingSchema,
} from "./canonicalize.mjs";

const OWNER_WORKBOOK_PATH = "excel/REALTIME INVENTORY- NEW 3.xlsx";
const DEFAULT_OWNER_SHEET = "REALTIME INVENTORY AUGUST 2026";

/** @typedef {string | number | boolean | null} ProfileValue */

/**
 * Convert SheetJS values into deterministic JSON values without interpreting
 * formulas. Dates are evidence values, not executable spreadsheet expressions.
 *
 * @param {unknown} value
 * @returns {ProfileValue}
 */
function serializeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}

/**
 * @param {number | undefined} hidden
 * @returns {"visible" | "hidden" | "veryHidden"}
 */
function visibilityName(hidden) {
  if (hidden === 1) return "hidden";
  if (hidden === 2) return "veryHidden";
  return "visible";
}

/**
 * Parse only a direct same-workbook reference. This does not evaluate a
 * formula; it merely follows an explicit source coordinate so a stale cache can
 * be reported as evidence.
 *
 * @param {string} formula
 * @param {string} selectedSheet
 * @returns {{ sheet: string; address: string } | null}
 */
function parseDirectReference(formula, selectedSheet) {
  const match = formula.match(
    /^(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9 _.-]+))!)?\$?([A-Z]+)\$?(\d+)$/i,
  );
  if (!match) return null;

  return {
    sheet: (match[1]?.replaceAll("''", "'") ?? match[2] ?? selectedSheet).trim(),
    address: `${match[3].toUpperCase()}${match[4]}`,
  };
}

/**
 * @param {string} inputPath
 * @param {{ sheet: string }} options
 */
export async function profileWorkbook(inputPath, options) {
  if (!inputPath.trim()) {
    throw new Error("Workbook path is required");
  }
  if (!options.sheet?.trim()) {
    throw new Error("Selected sheet is required");
  }

  let bytes;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(`Workbook file does not exist: ${inputPath}`);
    }
    throw error;
  }

  if (bytes.byteLength === 0) {
    throw new Error(`Workbook file is empty: ${inputPath}`);
  }

  const workbook = XLSX.read(bytes, {
    type: "buffer",
    sheets: options.sheet,
    cellFormula: true,
    cellText: true,
    bookFiles: true,
    bookVBA: true,
    sheetStubs: true,
    xlfn: true,
    WTF: true,
  });

  const selectedSheetName = workbook.SheetNames.find(
    (name) => name.toLocaleLowerCase() === options.sheet.toLocaleLowerCase(),
  );
  if (!selectedSheetName || !workbook.Sheets[selectedSheetName]) {
    throw new Error(`Sheet "${options.sheet}" was not found`);
  }

  const sheetMetadata = workbook.Workbook?.Sheets ?? [];
  const sheets = workbook.SheetNames.map((name, index) => ({
    name,
    visibility: visibilityName(sheetMetadata[index]?.Hidden),
  }));
  const selectedSheet = workbook.Sheets[selectedSheetName];
  const rangeText = selectedSheet["!ref"] ?? "A1:A1";
  const range = XLSX.utils.decode_range(rangeText);

  const cells = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = selectedSheet[address];
      if (!cell || cell.t === "z") continue;

      const formula = typeof cell.f === "string" ? cell.f : null;
      const rawValue = serializeValue(cell.v);
      cells.push({
        source: {
          sheet: selectedSheetName,
          address,
          row: row + 1,
          column: column + 1,
        },
        type: cell.t,
        rawValue,
        formula,
        cachedValue: formula ? rawValue : null,
        formattedValue: typeof cell.w === "string" ? cell.w : null,
      });
    }
  }

  const findings = [];
  for (const cell of cells) {
    if (!cell.formula) continue;

    if (/https?:\/\/|\\\\|\[[^\]]+\]/i.test(cell.formula)) {
      findings.push({
        code: "EXTERNAL_FORMULA_REFERENCE",
        severity: "blocking",
        source: cell.source,
        formula: cell.formula,
        message: "Formula contains an external reference and was not executed",
      });
    }

    const reference = parseDirectReference(cell.formula, selectedSheetName);
    if (!reference || reference.sheet !== selectedSheetName) continue;

    const referencedCell = selectedSheet[reference.address];
    const referencedValue = serializeValue(referencedCell?.v);
    if (!Object.is(cell.cachedValue, referencedValue)) {
      findings.push({
        code: "FORMULA_CACHE_DISAGREEMENT",
        severity: "blocking",
        source: cell.source,
        formula: cell.formula,
        cachedValue: cell.cachedValue,
        referencedSource: {
          sheet: reference.sheet,
          address: reference.address,
        },
        referencedValue,
        message: "Formula cache differs from its directly referenced source cell",
      });
    }
  }

  const fileKeys = Array.isArray(workbook.keys) ? workbook.keys : [];
  const hasMacros = Boolean(workbook.vbaraw) || fileKeys.some((key) =>
    /vbaProject\.bin$/i.test(key),
  );
  const hasExternalLinks = fileKeys.some((key) =>
    /(^|\/)externalLinks\//i.test(key),
  );
  if (hasMacros) {
    findings.push({
      code: "WORKBOOK_MACROS_PRESENT",
      severity: "blocking",
      source: null,
      message: "Workbook contains macro data; macros were not executed",
    });
  }
  if (hasExternalLinks) {
    findings.push({
      code: "WORKBOOK_EXTERNAL_LINKS_PRESENT",
      severity: "blocking",
      source: null,
      message: "Workbook package contains external links; links were not followed",
    });
  }

  return {
    workbook: {
      path: inputPath,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      hasMacros,
      hasExternalLinks,
    },
    sheets,
    selectedSheet: {
      name: selectedSheetName,
      visibility:
        sheets.find((sheet) => sheet.name === selectedSheetName)?.visibility ??
        "visible",
      range: rangeText,
      dimensions: {
        rows: range.e.r - range.s.r + 1,
        columns: range.e.c - range.s.c + 1,
      },
      cells,
    },
    findings,
  };
}

/** @param {ProfileValue} value */
function normalizeValue(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
}

/**
 * @param {import("./workbook-profile.mjs").WorkbookProfileCell | undefined} cell
 * @param {string} sheet
 * @param {number} row
 * @param {number} column
 */
function canonicalCell(cell, sheet, row, column) {
  const address = XLSX.utils.encode_cell({ r: row - 1, c: column - 1 });
  return profileCellEvidenceSchema.parse({
    source: cell?.source ?? { sheet, address, row, column },
    type: cell?.type ?? "z",
    rawValue: cell?.rawValue ?? null,
    normalizedValue: normalizeValue(cell?.rawValue ?? null),
    formula: cell?.formula ?? null,
    cachedValue: cell?.cachedValue ?? null,
    formattedValue: cell?.formattedValue ?? null,
  });
}

/** @param {string | number | boolean | null} value */
function headerName(value) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/\s+/g, " ")
    : "";
}

/**
 * @param {import("./workbook-profile.mjs").WorkbookProfile} profile
 * @param {number} sheetIndex
 */
function mapProfileRows(profile, sheetIndex) {
  const { cells } = profile.selectedSheet;
  const byRow = new Map();
  for (const cell of cells) {
    byRow.set(cell.source.row, [...(byRow.get(cell.source.row) ?? []), cell]);
  }

  const headerRow = [...byRow.entries()].find(([, rowCells]) => {
    const headers = new Set(rowCells.map((cell) => headerName(cell.rawValue)));
    return headers.has("ITEM CODE") && headers.has("ITEM NAME");
  });
  if (!headerRow) {
    throw new Error(`Sheet "${profile.selectedSheet.name}" has no ITEM CODE / ITEM NAME header row`);
  }

  const [headerRowNumber, headerCells] = headerRow;
  const headers = new Map(
    headerCells.map((cell) => [cell.source.column, headerName(cell.rawValue)]),
  );
  const itemCodeColumn = [...headers].find(([, value]) => value === "ITEM CODE")?.[0];
  const itemNameColumn = [...headers].find(([, value]) => value === "ITEM NAME")?.[0];
  const rowTypeColumn = [...headers].find(([, value]) => value === "ROW TYPE")?.[0];
  const quantityColumns = [...headers]
    .filter(([, value]) =>
      ["QUANTITY", "SR", "QC", "BL", "LU", "VC", "SP"].includes(value),
    )
    .map(([column, value]) => ({ column, header: value }));
  const priceColumns = [...headers]
    .filter(([, value]) => value === "PRICE" || value.includes("PRICE"))
    .filter(([, value]) => !value.startsWith("RUNNING"))
    .map(([column, value]) => ({ column, header: value }));

  if (!itemCodeColumn || !itemNameColumn || quantityColumns.length === 0 || priceColumns.length === 0) {
    throw new Error(
      `Sheet "${profile.selectedSheet.name}" is missing required item, quantity, or price columns`,
    );
  }

  const firstDataRow = headerRowNumber + 1;
  const firstDataCells = byRow.get(firstDataRow) ?? [];
  const sourceColumns = quantityColumns.map(({ column, header }) => {
    const firstCell = firstDataCells.find((cell) => cell.source.column === column);
    const formulaSheet = firstCell?.formula?.match(/^'((?:[^']|'')+)'!/)?.[1];
    return {
      field: "quantity",
      column,
      address: XLSX.utils.encode_col(column - 1),
      header,
      sourceLabel: formulaSheet?.replaceAll("''", "'") ?? header,
    };
  });
  const priceSourceColumns = priceColumns.map(({ column, header }) => ({
    field: "price",
    column,
    address: XLSX.utils.encode_col(column - 1),
    header,
    sourceLabel: header,
  }));

  const rows = [];
  for (
    let rowNumber = firstDataRow;
    rowNumber <= profile.selectedSheet.dimensions.rows;
    rowNumber += 1
  ) {
    const rowCells = byRow.get(rowNumber) ?? [];
    const byColumn = new Map(rowCells.map((cell) => [cell.source.column, cell]));
    const quantities = Object.fromEntries(
      sourceColumns.map(({ column, sourceLabel }) => [
        `${sourceLabel}@${XLSX.utils.encode_col(column - 1)}`,
        canonicalCell(
          byColumn.get(column),
          profile.selectedSheet.name,
          rowNumber,
          column,
        ),
      ]),
    );
    const prices = Object.fromEntries(
      priceSourceColumns.map(({ column, sourceLabel }) => [
        `${sourceLabel}@${XLSX.utils.encode_col(column - 1)}`,
        canonicalCell(
          byColumn.get(column),
          profile.selectedSheet.name,
          rowNumber,
          column,
        ),
      ]),
    );
    rows.push({
      workbookSha256: profile.workbook.sha256,
      sheet: profile.selectedSheet.name,
      sheetIndex,
      row: rowNumber,
      cells: rowCells.map((cell) =>
        canonicalCell(
          cell,
          profile.selectedSheet.name,
          rowNumber,
          cell.source.column,
        ),
      ),
      fields: {
        rowType: rowTypeColumn
          ? canonicalCell(
              byColumn.get(rowTypeColumn),
              profile.selectedSheet.name,
              rowNumber,
              rowTypeColumn,
            )
          : null,
        itemCode: canonicalCell(
          byColumn.get(itemCodeColumn),
          profile.selectedSheet.name,
          rowNumber,
          itemCodeColumn,
        ),
        itemName: canonicalCell(
          byColumn.get(itemNameColumn),
          profile.selectedSheet.name,
          rowNumber,
          itemNameColumn,
        ),
        quantities,
        prices,
      },
    });
  }

  return {
    source: {
      sheet: profile.selectedSheet.name,
      sheetIndex,
      headerRow: headerRowNumber,
      range: profile.selectedSheet.range,
      dimensions: profile.selectedSheet.dimensions,
      columns: {
        itemCode: itemCodeColumn,
        itemName: itemNameColumn,
        rowType: rowTypeColumn ?? null,
        quantities: sourceColumns,
        prices: priceSourceColumns,
      },
    },
    rows,
  };
}

/**
 * @param {import("./workbook-profile.mjs").WorkbookProfileFinding} finding
 * @param {import("./workbook-profile.mjs").WorkbookProfile} profile
 * @param {number} sheetIndex
 */
function profileFindingToReviewFinding(finding, profile, sheetIndex) {
  const address = finding.source?.address ?? "WORKBOOK";
  const sourceCell = finding.source
    ? profile.selectedSheet.cells.find(
        (cell) => cell.source.address === finding.source?.address,
      )
    : undefined;
  const id = `F-PROFILE_BLOCKER-S${sheetIndex}-${finding.code}-${address}`;
  return reviewFindingSchema.parse({
    id,
    code: "PROFILE_BLOCKER",
    blocking: true,
    status: "unresolved",
    message: finding.message,
    workbookSha256: profile.workbook.sha256,
    sourceIds: [`S${sheetIndex}-${address}`],
    evidence: sourceCell
      ? [
          canonicalCell(
            sourceCell,
            profile.selectedSheet.name,
            sourceCell.source.row,
            sourceCell.source.column,
          ),
        ]
      : [],
    details: { profileFindingCode: finding.code, ...finding },
    resolutionKey: id,
  });
}

/**
 * @param {string} workbookPath
 * @param {{ sheets?: string[] }} [options]
 */
export async function buildReviewPackage(workbookPath, options = {}) {
  const requestedSheets = options.sheets?.length
    ? [...new Set(options.sheets)]
    : [DEFAULT_OWNER_SHEET];
  const profiles = [];
  const mapped = [];
  for (let index = 0; index < requestedSheets.length; index += 1) {
    const profile = await profileWorkbook(workbookPath, {
      sheet: requestedSheets[index],
    });
    profiles.push(profile);
    mapped.push(mapProfileRows(profile, index + 1));
  }

  const workbook = profiles[0].workbook;
  if (profiles.some((profile) => profile.workbook.sha256 !== workbook.sha256)) {
    throw new Error("Workbook changed while review evidence was being built");
  }
  const profileRows = mapped.flatMap(({ rows }) => rows);
  const review = buildReviewFindings(profileRows);
  const profileFindings = profiles.flatMap((profile, index) =>
    profile.findings.map((finding) =>
      profileFindingToReviewFinding(finding, profile, index + 1),
    ),
  );
  const findings = [...review.findings, ...profileFindings].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const classifiedCounts = review.classifiedRows.reduce(
    (counts, row) => ({ ...counts, [row.kind]: counts[row.kind] + 1 }),
    { product: 0, heading: 0, spacer: 0 },
  );
  const mappingRows = review.classifiedRows.map((row) => ({
    sourceId: `S${row.evidence.sheetIndex}-R${row.evidence.row}`,
    sheet: row.evidence.sheet,
    row: row.evidence.row,
    kind: row.kind,
    proposedItemCode: row.kind === "product" ? row.candidate.itemCode : null,
    candidate: null,
    evidence: row.evidence,
  }));
  const sourceMapping = {
    schemaVersion: 1,
    workbook,
    selectedSources: mapped.map(({ source }) => source),
    canonicalLocations: CANONICAL_LOCATIONS,
    rows: mappingRows,
  };
  const report = {
    schemaVersion: 1,
    workbook,
    selectedSources: mapped.map(({ source }) => source),
    totals: {
      sheets: profiles.length,
      rows: review.classifiedRows.length,
      ...classifiedCounts,
      findings: findings.length,
      unresolvedFindings: findings.length,
      canonicalCandidates: 0,
    },
    canonicalLocations: CANONICAL_LOCATIONS,
    findings,
    canonicalCandidates: [],
  };
  const resolutions = {
    schemaVersion: 1,
    workbookSha256: workbook.sha256,
    resolutions: Object.fromEntries(
      findings.map((finding) => [
        finding.resolutionKey,
        resolutionRecordSchema.parse({
          findingId: finding.id,
          workbookSha256: workbook.sha256,
          status: "unresolved",
          reviewer: null,
          reviewedAt: null,
          decision: null,
          reason: null,
          canonicalValue: null,
        }),
      ]),
    ),
  };

  return { sourceMapping, report, resolutions };
}

/**
 * @param {string} path
 * @param {unknown} value
 */
async function writeJsonAtomic(path, value) {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function printHelp() {
  console.log(`Usage: npm run data:profile -- --workbook <path> [--sheet <name> ...] --mapping-out <path> --report-out <path> --resolutions-out <path>

Read one selected worksheet and emit JSON source evidence to stdout.

Options:
  --workbook <path>        Workbook path (default: ${OWNER_WORKBOOK_PATH})
  --sheet <name>           Worksheet to profile (repeatable; default: ${DEFAULT_OWNER_SHEET})
  --mapping-out <path>     Source-to-canonical traceability JSON
  --report-out <path>      Blocking owner-review report JSON
  --resolutions-out <path> Blank keyed owner-resolution template JSON
  --help                   Show this help

The command is read-only. Formulas, external links, and macros are never executed.`);
}

/**
 * @param {string[]} args
 */
export async function runCli(args) {
  if (args.includes("--help")) {
    printHelp();
    return;
  }

  let workbook = OWNER_WORKBOOK_PATH;
  const sheets = [];
  let mappingOut = "";
  let reportOut = "";
  let resolutionsOut = "";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      [
        "--workbook",
        "--sheet",
        "--mapping-out",
        "--report-out",
        "--resolutions-out",
      ].includes(argument)
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === "--workbook") workbook = value;
      if (argument === "--sheet") sheets.push(value);
      if (argument === "--mapping-out") mappingOut = value;
      if (argument === "--report-out") reportOut = value;
      if (argument === "--resolutions-out") resolutionsOut = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!mappingOut || !reportOut || !resolutionsOut) {
    throw new Error(
      "--mapping-out, --report-out, and --resolutions-out are required",
    );
  }
  const reviewPackage = await buildReviewPackage(workbook, { sheets });
  await writeJsonAtomic(mappingOut, reviewPackage.sourceMapping);
  await writeJsonAtomic(reportOut, reviewPackage.report);
  await writeJsonAtomic(resolutionsOut, reviewPackage.resolutions);
  console.log(
    `Profiled ${reviewPackage.report.totals.rows} rows with ${reviewPackage.report.totals.unresolvedFindings} unresolved findings; no canonical fixture was generated.`,
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
