// @ts-check

import { z } from "zod";

const profileValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const sourceSchema = z
  .object({
    sheet: z.string().min(1),
    address: z.string().min(1),
    row: z.number().int().positive(),
    column: z.number().int().positive(),
  })
  .strict();

export const profileCellEvidenceSchema = z
  .object({
    source: sourceSchema,
    type: z.string().min(1),
    rawValue: profileValueSchema,
    normalizedValue: profileValueSchema,
    formula: z.string().nullable(),
    cachedValue: profileValueSchema,
    formattedValue: z.string().nullable(),
  })
  .strict();

export const profileEvidenceSchema = z
  .object({
    workbookSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sheet: z.string().min(1),
    sheetIndex: z.number().int().positive(),
    row: z.number().int().positive(),
    cells: z.array(profileCellEvidenceSchema),
    fields: z
      .object({
        rowType: profileCellEvidenceSchema.nullable(),
        itemCode: profileCellEvidenceSchema.nullable(),
        itemName: profileCellEvidenceSchema.nullable(),
        quantities: z.record(z.string().min(1), profileCellEvidenceSchema),
        prices: z.record(z.string().min(1), profileCellEvidenceSchema),
      })
      .strict(),
  })
  .strict();

export const reviewFindingSchema = z
  .object({
    id: z.string().min(1),
    code: z.enum([
      "UNRESOLVED_SR_SOURCE",
      "UNRESOLVED_BL_BEFORE_SOURCE",
      "DUPLICATE_CODE",
      "SUSPECTED_DUPLICATE",
      "INVALID_QUANTITY_NEGATIVE",
      "INVALID_QUANTITY_BLANK",
      "INVALID_QUANTITY_NONNUMERIC",
      "MISSING_PRICE",
      "NONNUMERIC_PRICE",
      "CONFLICTING_PRICE",
      "MISSING_ITEM_NAME",
      "TEMPORARY_CODE_COLLISION",
      "PROFILE_BLOCKER",
    ]),
    blocking: z.literal(true),
    status: z.literal("unresolved"),
    message: z.string().min(1),
    workbookSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceIds: z.array(z.string().min(1)),
    evidence: z.array(profileCellEvidenceSchema),
    details: z.record(z.string(), z.unknown()).default({}),
    resolutionKey: z.string().min(1),
  })
  .strict();

export const resolutionRecordSchema = z
  .object({
    findingId: z.string().min(1),
    workbookSha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["unresolved", "resolved"]),
    reviewer: z.string().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    decision: z.string().nullable(),
    reason: z.string().nullable(),
    canonicalValue: z.unknown().nullable(),
  })
  .strict();

export const canonicalCandidateSchema = z
  .object({
    sourceId: z.string().min(1),
    workbookSha256: z.string().regex(/^[a-f0-9]{64}$/),
    itemCode: z.string().min(1),
    itemName: z.string().min(1),
    quantities: z.record(z.string().min(1), z.number().nonnegative()),
    prices: z.record(z.string().min(1), z.number().nonnegative()),
    evidence: profileEvidenceSchema,
  })
  .strict();

export const CANONICAL_LOCATIONS = Object.freeze([
  { code: "SR", type: "WAREHOUSE" },
  { code: "QC", type: "BRANCH" },
  { code: "BL", type: "BRANCH" },
  { code: "LU", type: "BRANCH" },
  { code: "VC", type: "BRANCH" },
  { code: "SP", type: "BRANCH" },
]);

/** @param {unknown} value */
function normalizedText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().replace(/\s+/g, " ");
}

/** @param {import("./canonicalize.mjs").ProfileEvidence} evidence */
function sourceId(evidence) {
  return `S${evidence.sheetIndex}-R${evidence.row}`;
}

/**
 * Classify before applying D-07 so headings and spacers can never become
 * products merely because their item-code cell is blank.
 *
 * @param {import("./canonicalize.mjs").ProfileEvidence} input
 */
export function classifySourceRow(input) {
  const evidence = profileEvidenceSchema.parse(input);
  const { fields } = evidence;
  const rowType = normalizedText(fields.rowType?.normalizedValue).toUpperCase();
  const itemCode = normalizedText(fields.itemCode?.normalizedValue);
  const itemName = normalizedText(fields.itemName?.normalizedValue);
  const hasMeaningfulCell = evidence.cells.some(
    ({ normalizedValue }) => normalizedText(normalizedValue) !== "",
  );
  const hasQuantityOrPrice = [
    ...Object.values(fields.quantities),
    ...Object.values(fields.prices),
  ].some(({ normalizedValue }) => normalizedText(normalizedValue) !== "");

  if (!hasMeaningfulCell) {
    return { kind: "spacer", evidence, candidate: null };
  }

  if (!itemCode && !itemName) {
    return { kind: "spacer", evidence, candidate: null };
  }

  if (
    ["CATEGORY", "HEADING", "HEADER"].includes(rowType) ||
    (!itemCode && /ACCESSORIES$/i.test(itemName)) ||
    (!itemCode && Boolean(itemName) && !hasQuantityOrPrice)
  ) {
    return { kind: "heading", evidence, candidate: null };
  }

  const quantities = Object.fromEntries(
    Object.entries(fields.quantities)
      .filter(([, value]) => typeof value.normalizedValue === "number")
      .map(([key, value]) => [key, value.normalizedValue]),
  );
  const prices = Object.fromEntries(
    Object.entries(fields.prices)
      .filter(([, value]) => typeof value.normalizedValue === "number")
      .map(([key, value]) => [key, value.normalizedValue]),
  );
  const candidate = {
    sourceId: sourceId(evidence),
    workbookSha256: evidence.workbookSha256,
    itemCode: itemCode || `TMP-S${evidence.sheetIndex}-R${evidence.row}`,
    itemName,
    quantities,
    prices,
    evidence,
  };

  return { kind: "product", evidence, candidate };
}

/**
 * @param {string} code
 * @param {import("./canonicalize.mjs").ProfileEvidence[]} evidence
 * @param {string} suffix
 */
function findingId(code, evidence, suffix = "") {
  const locations = evidence.map(sourceId).sort().join("-") || "WORKBOOK";
  return `F-${code}-${locations}${suffix ? `-${suffix}` : ""}`;
}

/**
 * @param {object} input
 * @param {import("./canonicalize.mjs").ReviewFinding["code"]} input.code
 * @param {string} input.message
 * @param {import("./canonicalize.mjs").ProfileEvidence[]} input.rows
 * @param {import("./canonicalize.mjs").ProfileCellEvidence[]} [input.cells]
 * @param {Record<string, unknown>} [input.details]
 * @param {string} [input.suffix]
 */
function makeFinding({ code, message, rows, cells = [], details = {}, suffix = "" }) {
  const workbookSha256 = rows[0]?.workbookSha256 ?? "0".repeat(64);
  const id = findingId(code, rows, suffix);
  return reviewFindingSchema.parse({
    id,
    code,
    blocking: true,
    status: "unresolved",
    message,
    workbookSha256,
    sourceIds: rows.map(sourceId).sort(),
    evidence: cells,
    details,
    resolutionKey: id,
  });
}

/**
 * Produce owner-review blockers and expose canonical candidates only when no
 * blocker exists. Plan 01-03 deliberately emits unresolved location blockers,
 * therefore its evidence package cannot become an approved canonical seed.
 *
 * @param {import("./canonicalize.mjs").ProfileEvidence[]} inputs
 */
export function buildReviewFindings(inputs) {
  const rows = z.array(profileEvidenceSchema).min(1).parse(inputs);
  const classifiedRows = rows.map(classifySourceRow);
  const products = classifiedRows.filter(
    /** @returns {row is import("./canonicalize.mjs").ClassifiedProductRow} */
    (row) => row.kind === "product",
  );
  /** @type {import("./canonicalize.mjs").ReviewFinding[]} */
  const findings = [];

  findings.push(
    makeFinding({
      code: "UNRESOLVED_SR_SOURCE",
      message: "Owner must identify which workbook source represents canonical SR",
      rows: [rows[0]],
      cells: Object.values(rows[0].fields.quantities),
      details: { canonicalLocationCode: "SR" },
    }),
    makeFinding({
      code: "UNRESOLVED_BL_BEFORE_SOURCE",
      message: "Owner must explain whether and how BL BEFORE maps to canonical BL",
      rows: [rows[0]],
      cells: Object.entries(rows[0].fields.quantities)
        .filter(([source]) => source.toUpperCase().includes("BL BEFORE"))
        .map(([, cell]) => cell),
      details: { canonicalLocationCode: "BL", sourceLabel: "BL BEFORE" },
    }),
  );

  const byCode = new Map();
  const byName = new Map();
  for (const product of products) {
    const codeKey = product.candidate.itemCode.toUpperCase();
    const nameKey = product.candidate.itemName.toUpperCase().replace(/\s+/g, " ");
    byCode.set(codeKey, [...(byCode.get(codeKey) ?? []), product]);
    if (nameKey) byName.set(nameKey, [...(byName.get(nameKey) ?? []), product]);

    if (!product.candidate.itemName) {
      findings.push(
        makeFinding({
          code: "MISSING_ITEM_NAME",
          message: "Product row has no item name",
          rows: [product.evidence],
          cells: product.evidence.fields.itemName
            ? [product.evidence.fields.itemName]
            : [],
        }),
      );
    }

    for (const [location, quantity] of Object.entries(
      product.evidence.fields.quantities,
    )) {
      const value = quantity.normalizedValue;
      const code =
        value === null || value === ""
          ? "INVALID_QUANTITY_BLANK"
          : typeof value !== "number" || !Number.isFinite(value)
            ? "INVALID_QUANTITY_NONNUMERIC"
            : value < 0
              ? "INVALID_QUANTITY_NEGATIVE"
              : null;
      if (code) {
        findings.push(
          makeFinding({
            code,
            message: `Quantity for ${location} requires owner review`,
            rows: [product.evidence],
            cells: [quantity],
            details: { location },
            suffix: location,
          }),
        );
      }
    }

    for (const [priceSource, price] of Object.entries(
      product.evidence.fields.prices,
    )) {
      const value = price.normalizedValue;
      const code =
        value === null || value === ""
          ? "MISSING_PRICE"
          : typeof value !== "number" || !Number.isFinite(value) || value < 0
            ? "NONNUMERIC_PRICE"
            : null;
      if (code) {
        findings.push(
          makeFinding({
            code,
            message: `Price from ${priceSource} requires owner review`,
            rows: [product.evidence],
            cells: [price],
            details: { priceSource },
            suffix: priceSource,
          }),
        );
      }
    }
  }

  for (const [code, collisions] of byCode) {
    if (collisions.length < 2) continue;
    for (const collision of collisions) {
      findings.push(
        makeFinding({
          code: "DUPLICATE_CODE",
          message: `Item code ${code} appears on multiple product rows`,
          rows: [collision.evidence],
          cells: collision.evidence.fields.itemCode
            ? [collision.evidence.fields.itemCode]
            : [],
          details: { itemCode: code, collisionSourceIds: collisions.map((row) => sourceId(row.evidence)) },
        }),
      );
    }

    const prices = new Set(
      collisions.flatMap(({ candidate }) => Object.values(candidate.prices)),
    );
    if (prices.size > 1) {
      findings.push(
        makeFinding({
          code: "CONFLICTING_PRICE",
          message: `Item code ${code} has conflicting prices`,
          rows: collisions.map(({ evidence }) => evidence),
          cells: collisions.flatMap(({ evidence }) => Object.values(evidence.fields.prices)),
          details: { itemCode: code, prices: [...prices] },
        }),
      );
    }
  }

  for (const [name, collisions] of byName) {
    const codes = new Set(collisions.map(({ candidate }) => candidate.itemCode));
    if (collisions.length < 2 || codes.size < 2) continue;
    findings.push(
      makeFinding({
        code: "SUSPECTED_DUPLICATE",
        message: `Normalized item name ${name} appears under different item codes`,
        rows: collisions.map(({ evidence }) => evidence),
        cells: collisions.flatMap(({ evidence }) =>
          evidence.fields.itemName ? [evidence.fields.itemName] : [],
        ),
        details: { normalizedItemName: name, itemCodes: [...codes].sort() },
      }),
    );
  }

  const temporaryCodes = new Map();
  for (const product of products) {
    const code = product.candidate.itemCode;
    temporaryCodes.set(code, [...(temporaryCodes.get(code) ?? []), product]);
  }
  for (const [code, collisions] of temporaryCodes) {
    if (!code.startsWith("TMP-") || collisions.length < 2) continue;
    findings.push(
      makeFinding({
        code: "TEMPORARY_CODE_COLLISION",
        message: `Generated temporary code ${code} collides`,
        rows: collisions.map(({ evidence }) => evidence),
        details: { itemCode: code },
      }),
    );
  }

  const parsedFindings = z.array(reviewFindingSchema).parse(findings);
  return {
    canonicalLocations: CANONICAL_LOCATIONS,
    classifiedRows,
    findings: parsedFindings,
    canonicalCandidates:
      parsedFindings.length === 0
        ? products.map(({ candidate }) => canonicalCandidateSchema.parse(candidate))
        : [],
  };
}
