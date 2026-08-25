// @ts-check

import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { resolutionRecordSchema } from "./canonicalize.mjs";

const EXPECTED_LOCATIONS = Object.freeze([
  { code: "BL", name: "BL Branch", type: "BRANCH", sourceIds: [] },
  { code: "LU", name: "LU Branch", type: "BRANCH", sourceIds: [] },
  { code: "QC", name: "QC Branch", type: "BRANCH", sourceIds: [] },
  { code: "SP", name: "SP Branch", type: "BRANCH", sourceIds: [] },
  { code: "SR", name: "Stock Room", type: "WAREHOUSE", sourceIds: [] },
  { code: "VC", name: "VC Branch", type: "BRANCH", sourceIds: [] },
]);

const QUANTITY_SOURCE_TO_LOCATION = Object.freeze({
  "BL AUGUST 2026@H": "BL",
  "QC AUGUST 2026@I": "QC",
  "LU AUGUST 2026@K": "LU",
  "VC AUGUST 2026@L": "VC",
  "SP AUGUST 2026@M": "SP",
});

const EXCLUDED_QUANTITY_SOURCE = "BL BEFORE@J";
const FORBIDDEN_ARTIFACT_KEYS = /^(?:password|passwordHash|token|secret|credential)$/i;

/** @param {unknown} value */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value */
function assertNoCredentialFields(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoCredentialFields);
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_ARTIFACT_KEYS.test(key)) {
      throw new Error(`Credential field is forbidden in canonical artifacts: ${key}`);
    }
    assertNoCredentialFields(child);
  }
}

/** @param {unknown} value */
function stableText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** @param {string} value */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** @param {unknown} value */
function normalizedText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().replace(/\s+/g, " ");
}

/**
 * Normalize a base-10 money value using string operations only. The workbook
 * parser has already produced the reviewed value; generation never performs
 * binary floating-point arithmetic or invents a replacement amount.
 *
 * @param {unknown} value
 */
function normalizeDecimal(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Sale price must be a reviewed decimal value or null");
  }
  const input = String(value).trim().replaceAll(",", "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) throw new Error(`Invalid nonnegative decimal value: ${input}`);

  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = match[2] ?? "";
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`Sale price has more than two decimal places: ${input}`);
  }
  return `${whole}.${fraction.slice(0, 2).padEnd(2, "0")}`;
}

/** @param {unknown} value @param {string} context */
function nonnegativeInteger(value, context) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context} must be a reviewed nonnegative integer`);
  }
  return value;
}

/** @param {unknown} value @param {string} context */
function requiredRecord(value, context) {
  if (!isRecord(value)) throw new Error(`${context} must be an object`);
  return value;
}

/**
 * @param {import("./generate-seed.mjs").ReviewReportArtifact} profile
 * @param {import("./generate-seed.mjs").ResolutionArtifact} artifact
 */
function validateResolutions(profile, artifact) {
  const workbookHash = profile.workbook?.sha256;
  if (!/^[a-f0-9]{64}$/.test(workbookHash ?? "")) {
    throw new Error("Profile workbook hash is missing or malformed");
  }
  if (artifact.workbookSha256 !== workbookHash) {
    throw new Error("Resolution workbook hash is stale");
  }
  if (!Array.isArray(profile.findings)) throw new Error("Profile findings are missing");

  const findingsById = new Map(profile.findings.map((finding) => [finding.id, finding]));
  const recordsById = new Map();
  for (const [key, input] of Object.entries(artifact.resolutions ?? {})) {
    const record = resolutionRecordSchema.parse(input);
    if (key !== record.findingId) {
      throw new Error(`Resolution key does not match finding ID: ${key}`);
    }
    if (recordsById.has(record.findingId)) {
      throw new Error(`Duplicate resolution finding ID: ${record.findingId}`);
    }
    if (!findingsById.has(record.findingId)) {
      throw new Error(`Unknown resolution finding ID: ${record.findingId}`);
    }
    const finding = findingsById.get(record.findingId);
    if (record.workbookSha256 !== workbookHash) {
      throw new Error(`Resolution workbook hash is stale: ${record.findingId}`);
    }
    if (
      record.status !== "resolved" ||
      !record.reviewer ||
      !record.reviewedAt ||
      !record.decision ||
      !record.reason
    ) {
      throw new Error(`Resolution is incomplete: ${record.findingId}`);
    }
    const canonical = requiredRecord(
      record.canonicalValue,
      `Canonical resolution ${record.findingId}`,
    );
    const disposition = canonical.disposition;
    const isSrNoSource =
      record.decision === "no-source-confirm-zero" &&
      canonical.locationCode === "SR" &&
      canonical.source === null &&
      canonical.openingQuantity === 0;
    if (
      !isSrNoSource &&
      (typeof disposition !== "string" ||
      ![
        "exclude",
        "exclude-row",
        "exclude-source",
        "keep-separate",
        "retain",
        "separate-identities",
      ].includes(disposition))
    ) {
      throw new Error(`Resolution has an unknown disposition: ${record.findingId}`);
    }
    if (canonical.active === false || canonical.sellable === false) {
      if (
        canonical.active !== false ||
        canonical.sellable !== false ||
        canonical.salePrice !== null
      ) {
        throw new Error(
          `Inactive/non-sellable resolution must have a null sale price: ${record.findingId}`,
        );
      }
    }
    const excludedRow = ["exclude", "exclude-row"].includes(String(disposition));
    if (
      finding.code === "UNRESOLVED_BL_BEFORE_SOURCE" &&
      !(
        disposition === "exclude-source" &&
        canonical.sourceLabel === "BL BEFORE" &&
        canonical.sourceColumn === "J"
      )
    ) {
      throw new Error("BL BEFORE must be explicitly excluded as reviewed evidence");
    }
    if (
      finding.code === "UNRESOLVED_SR_SOURCE" &&
      !isSrNoSource
    ) {
      throw new Error("SR must have no workbook source and an opening quantity of zero");
    }
    if (
      finding.code === "SUSPECTED_DUPLICATE" &&
      disposition !== "keep-separate"
    ) {
      throw new Error(`Suspected duplicates must remain separate: ${record.findingId}`);
    }
    if (finding.code === "MISSING_ITEM_NAME" && !excludedRow) {
      throw new Error(`Missing-name row must be excluded: ${record.findingId}`);
    }
    if (["MISSING_PRICE", "NONNUMERIC_PRICE"].includes(finding.code)) {
      const retainedInactive =
        disposition === "retain" &&
        canonical.active === false &&
        canonical.sellable === false &&
        canonical.salePrice === null;
      if (!excludedRow && !retainedInactive) {
        throw new Error(
          `Missing/nonnumeric price must be excluded or retained inactive without a price: ${record.findingId}`,
        );
      }
    }
    if (finding.code.startsWith("INVALID_QUANTITY_")) {
      const location = finding.details?.location;
      const excludedSource =
        disposition === "exclude-source" &&
        location === EXCLUDED_QUANTITY_SOURCE &&
        canonical.sourceLabel === "BL BEFORE";
      const confirmed =
        ["retain", "exclude-row"].includes(String(disposition)) &&
        canonical.confirmedQuantity !== undefined;
      if (!excludedSource && !confirmed) {
        throw new Error(`Invalid quantity lacks an explicit outcome: ${record.findingId}`);
      }
    }
    if (
      finding.code === "CONFLICTING_PRICE" &&
      disposition !== "separate-identities"
    ) {
      throw new Error(`Conflicting prices require separate reviewed identities: ${record.findingId}`);
    }
    recordsById.set(record.findingId, { record, canonical });
  }

  const missing = [...findingsById.keys()].filter((id) => !recordsById.has(id));
  if (missing.length > 0 || recordsById.size !== findingsById.size) {
    throw new Error(
      `Resolution coverage mismatch: ${missing.length} missing, ${recordsById.size - findingsById.size + missing.length} unknown`,
    );
  }

  return { workbookHash, findingsById, recordsById };
}

/** @param {unknown[]} values @param {string} field @param {string} sourceId */
function oneApprovedValue(values, field, sourceId) {
  if (values.length === 0) return undefined;
  const serialized = new Set(values.map((value) => JSON.stringify(value)));
  if (serialized.size !== 1) {
    throw new Error(`Ambiguous ${field} decisions for ${sourceId}`);
  }
  return values[0];
}

/**
 * @param {import("./generate-seed.mjs").SourceMappingArtifact} mapping
 */
function sourceEvidence(mapping) {
  return {
    schemaVersion: 1,
    workbook: mapping.workbook,
    selectedSources: mapping.selectedSources,
    canonicalLocations: mapping.canonicalLocations,
    rows: mapping.rows,
  };
}

/**
 * @param {import("./generate-seed.mjs").GenerateCanonicalFixtureInput} input
 * @returns {import("./generate-seed.mjs").GeneratedCanonicalFixture}
 */
export function generateCanonicalFixture(input) {
  assertNoCredentialFields(input);
  const { profile, resolutions, sourceMapping } = input;
  const { workbookHash, findingsById, recordsById } = validateResolutions(
    profile,
    resolutions,
  );
  if (sourceMapping.workbook?.sha256 !== workbookHash) {
    throw new Error("Source mapping workbook hash does not match the reviewed profile");
  }
  if (!Array.isArray(sourceMapping.rows)) throw new Error("Source mapping rows are missing");

  const locationShape = [...(profile.canonicalLocations ?? [])]
    .map(({ code, type }) => ({ code, type }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const expectedLocationShape = EXPECTED_LOCATIONS
    .map(({ code, type }) => ({ code, type }))
    .sort((left, right) => left.code.localeCompare(right.code));
  if (JSON.stringify(locationShape) !== JSON.stringify(expectedLocationShape)) {
    throw new Error("Canonical locations must be exactly SR, QC, BL, LU, VC, and SP");
  }
  const mappingLocationShape = [...(sourceMapping.canonicalLocations ?? [])]
    .map(({ code, type }) => ({ code, type }))
    .sort((left, right) => left.code.localeCompare(right.code));
  if (JSON.stringify(mappingLocationShape) !== JSON.stringify(expectedLocationShape)) {
    throw new Error("Source mapping canonical locations do not match the reviewed profile");
  }

  const decisionsBySource = new Map();
  for (const [findingId, approved] of recordsById) {
    const finding = findingsById.get(findingId);
    for (const sourceId of finding.sourceIds ?? []) {
      decisionsBySource.set(sourceId, [
        ...(decisionsBySource.get(sourceId) ?? []),
        { finding, ...approved },
      ]);
    }
  }

  const products = [];
  const openingBalances = [];
  for (const row of sourceMapping.rows) {
    if (row.kind !== "product") continue;
    const sourceId = row.sourceId;
    const rowDecisions = decisionsBySource.get(sourceId) ?? [];
    const excluded = rowDecisions.some(({ canonical }) =>
      ["exclude", "exclude-row"].includes(String(canonical.disposition)),
    );
    if (excluded) continue;

    const fields = requiredRecord(row.evidence?.fields, `Evidence fields for ${sourceId}`);
    const itemCodeCell = fields.itemCode;
    const itemNameCell = fields.itemName;
    const quantityCells = requiredRecord(fields.quantities, `Quantities for ${sourceId}`);
    const priceCells = requiredRecord(fields.prices, `Prices for ${sourceId}`);
    const overrides = (field) =>
      rowDecisions
        .map(({ canonical }) => canonical[field])
        .filter((value) => value !== undefined);
    const sourceItemCode = normalizedText(
      isRecord(itemCodeCell) ? itemCodeCell.normalizedValue : null,
    );
    const temporaryCode = `TMP-S${row.evidence.sheetIndex}-R${row.row}`;
    if (!sourceItemCode && row.proposedItemCode !== temporaryCode) {
      throw new Error(`Temporary item code must be ${temporaryCode} for ${sourceId}`);
    }
    const itemCode = normalizedText(
      oneApprovedValue(overrides("itemCode"), "itemCode", sourceId) ??
        (sourceItemCode || temporaryCode),
    );
    const itemName = normalizedText(
      oneApprovedValue(overrides("itemName"), "itemName", sourceId) ??
        (isRecord(itemNameCell) ? itemNameCell.normalizedValue : null),
    );
    if (!itemCode || !itemName) {
      throw new Error(`Retained product ${sourceId} requires an item code and item name`);
    }

    const activeOverride = oneApprovedValue(overrides("active"), "active", sourceId);
    const sellableOverride = oneApprovedValue(
      overrides("sellable"),
      "sellable",
      sourceId,
    );
    const salePriceOverrides = overrides("salePrice");
    const priceCell = Object.values(priceCells)[0];
    const reviewedPrice =
      salePriceOverrides.length > 0
        ? oneApprovedValue(salePriceOverrides, "salePrice", sourceId)
        : isRecord(priceCell)
          ? priceCell.normalizedValue
          : null;
    const inactive = activeOverride === false || sellableOverride === false;
    if (inactive && reviewedPrice !== null) {
      throw new Error(`Inactive product ${sourceId} must not have a sale price`);
    }
    if (!inactive && reviewedPrice === null) {
      throw new Error(`Sellable product ${sourceId} requires an approved sale price`);
    }

    products.push({
      itemCode,
      name: itemName,
      salePrice: reviewedPrice === null ? null : normalizeDecimal(reviewedPrice),
      status: inactive ? "INACTIVE" : "ACTIVE",
      sellable: !inactive,
      sourceIds: [sourceId],
    });

    const quantityOverrides = new Map();
    for (const { finding, canonical } of rowDecisions) {
      if (canonical.confirmedQuantity === undefined) continue;
      const location = finding.details?.location;
      if (typeof location !== "string") {
        throw new Error(`Confirmed quantity lacks source location: ${finding.id}`);
      }
      if (quantityOverrides.has(location)) {
        throw new Error(`Duplicate quantity decision for ${sourceId} ${location}`);
      }
      quantityOverrides.set(
        location,
        nonnegativeInteger(canonical.confirmedQuantity, finding.id),
      );
    }

    for (const [sourceLabel, locationCode] of Object.entries(
      QUANTITY_SOURCE_TO_LOCATION,
    )) {
      const quantityCell = requiredRecord(
        quantityCells[sourceLabel],
        `Quantity evidence ${sourceId} ${sourceLabel}`,
      );
      const quantity = quantityOverrides.has(sourceLabel)
        ? quantityOverrides.get(sourceLabel)
        : nonnegativeInteger(
            quantityCell.normalizedValue,
            `${sourceId} ${sourceLabel}`,
          );
      openingBalances.push({
        itemCode,
        locationCode,
        onHand: quantity,
        sourceIds: [`${sourceId}:${quantityCell.source.address}`],
      });
    }
    if (!(EXCLUDED_QUANTITY_SOURCE in quantityCells)) {
      throw new Error(`BL BEFORE evidence is missing for ${sourceId}`);
    }
    openingBalances.push({
      itemCode,
      locationCode: "SR",
      onHand: 0,
      sourceIds: [],
    });
  }

  products.sort((left, right) => left.itemCode.localeCompare(right.itemCode));
  openingBalances.sort(
    (left, right) =>
      left.itemCode.localeCompare(right.itemCode) ||
      left.locationCode.localeCompare(right.locationCode),
  );
  const duplicateCodes = products.filter(
    ({ itemCode }, index) => index > 0 && products[index - 1].itemCode === itemCode,
  );
  if (duplicateCodes.length > 0) {
    throw new Error(`Canonical item-code collision: ${duplicateCodes[0].itemCode}`);
  }

  const resolutionHash = sha256(stableText(resolutions));
  const sourceSnapshot = sourceEvidence(sourceMapping);
  const sourceMappingHash = sha256(stableText(sourceSnapshot));
  const fixtureBase = {
    schemaVersion: 1,
    generatedFrom: { workbookHash, resolutionHash, sourceMappingHash },
    locations: EXPECTED_LOCATIONS,
    products,
    openingBalances,
  };
  const fixture = {
    ...fixtureBase,
    fixtureHash: sha256(stableText(fixtureBase)),
  };
  const canonicalRecords = {
    locations: fixture.locations.map(({ code, sourceIds }) => ({ code, sourceIds })),
    products: products.map(({ itemCode, sourceIds }) => ({ itemCode, sourceIds })),
    openingBalances: openingBalances.map(
      ({ itemCode, locationCode, sourceIds }) => ({
        itemCode,
        locationCode,
        sourceIds,
      }),
    ),
  };
  const mappingBase = {
    ...sourceSnapshot,
    generation: {
      workbookHash,
      resolutionHash,
      sourceMappingHash,
      fixtureHash: fixture.fixtureHash,
    },
    canonicalRecords,
  };
  const mapping = {
    ...mappingBase,
    generation: {
      ...mappingBase.generation,
      mappingHash: sha256(stableText(mappingBase)),
    },
  };

  return {
    fixture,
    mapping,
    fixtureText: stableText(fixture),
    mappingText: stableText(mapping),
  };
}

/** @param {string} destination @param {string} content */
async function atomicWrite(destination, content) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  await rename(temporary, destination);
}

/**
 * @param {import("./generate-seed.mjs").GeneratorPaths} options
 */
export async function runCanonicalFixtureGenerator(options) {
  const [profileText, resolutionsText, sourceMappingText] = await Promise.all([
    readFile(options.profilePath, "utf8"),
    readFile(options.resolutionsPath, "utf8"),
    readFile(options.mappingOutPath, "utf8"),
  ]);
  const generated = generateCanonicalFixture({
    profile: JSON.parse(profileText),
    resolutions: JSON.parse(resolutionsText),
    sourceMapping: JSON.parse(sourceMappingText),
  });

  if (options.check) {
    const fixtureText = await readFile(options.fixtureOutPath, "utf8");
    if (fixtureText !== generated.fixtureText || sourceMappingText !== generated.mappingText) {
      throw new Error("Committed canonical fixture or source mapping is stale");
    }
    return generated;
  }

  await Promise.all([
    atomicWrite(options.fixtureOutPath, generated.fixtureText),
    atomicWrite(options.mappingOutPath, generated.mappingText),
  ]);
  return generated;
}

/** @param {string[]} argv */
function parseCli(argv) {
  const values = new Map();
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--check") {
      check = true;
      continue;
    }
    if (!["--profile", "--resolutions", "--fixture-out", "--mapping-out"].includes(flag)) {
      throw new Error(`Unknown generator flag: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate generator flag: ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  for (const flag of ["--profile", "--resolutions", "--fixture-out", "--mapping-out"]) {
    if (!values.has(flag)) throw new Error(`Required generator flag is missing: ${flag}`);
  }
  return {
    profilePath: values.get("--profile"),
    resolutionsPath: values.get("--resolutions"),
    fixtureOutPath: values.get("--fixture-out"),
    mappingOutPath: values.get("--mapping-out"),
    check,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCanonicalFixtureGenerator(parseCli(process.argv.slice(2)))
    .then(({ fixture }) => {
      console.log(
        `Canonical fixture ${fixture.fixtureHash} (${fixture.products.length} products, ${fixture.openingBalances.length} balances)`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
