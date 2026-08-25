// @ts-check

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

const OWNER_WORKBOOK_PATH = "excel/REALTIME INVENTORY- NEW 3.xlsx";

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

function printHelp() {
  console.log(`Usage: npm run data:profile -- --sheet <name> [--input <path>]

Read one selected worksheet and emit JSON source evidence to stdout.

Options:
  --input <path>  Workbook path (default: ${OWNER_WORKBOOK_PATH})
  --sheet <name>  Exact worksheet name to profile (required)
  --help          Show this help

The command is read-only. Formulas, external links, and macros are never executed.`);
}

/**
 * @param {string[]} args
 */
async function runCli(args) {
  if (args.includes("--help")) {
    printHelp();
    return;
  }

  let input = OWNER_WORKBOOK_PATH;
  let sheet = "";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--input" || argument === "--sheet") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === "--input") input = value;
      if (argument === "--sheet") sheet = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  const profile = await profileWorkbook(input, { sheet });
  console.log(JSON.stringify(profile, null, 2));
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
