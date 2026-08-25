import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  generateCanonicalFixture,
  runCanonicalFixtureGenerator,
  type GenerateCanonicalFixtureInput,
  type ResolutionArtifact,
  type ReviewReportArtifact,
  type SourceMappingArtifact,
} from "./generate-seed.mjs";

const WORKBOOK_HASH = "a".repeat(64);

function cell(row: number, column: number, value: string | number | null) {
  return {
    source: {
      sheet: "Reviewed Inventory",
      address: `${String.fromCharCode(64 + column)}${row}`,
      row,
      column,
    },
    type: typeof value === "number" ? "n" : value === null ? "z" : "s",
    rawValue: value,
    normalizedValue: value,
    formula: null,
    cachedValue: null,
    formattedValue: value === null ? null : String(value),
  };
}

function sourceRow(input: {
  row: number;
  code: string | null;
  name: string;
  price: number | null;
  quantities: [number | null, number, number, number, number, number];
}) {
  const code = cell(input.row, 1, input.code);
  const name = cell(input.row, 2, input.name);
  const quantityLabels = [
    "BL AUGUST 2026@H",
    "QC AUGUST 2026@I",
    "BL BEFORE@J",
    "LU AUGUST 2026@K",
    "VC AUGUST 2026@L",
    "SP AUGUST 2026@M",
  ];
  const quantities = Object.fromEntries(
    input.quantities.map((value, index) => [
      quantityLabels[index],
      cell(input.row, index + 8, value),
    ]),
  );
  const price = cell(input.row, 15, input.price);
  const evidence = {
    workbookSha256: WORKBOOK_HASH,
    sheet: "Reviewed Inventory",
    sheetIndex: 1,
    row: input.row,
    cells: [code, name, ...Object.values(quantities), price],
    fields: {
      rowType: null,
      itemCode: code,
      itemName: name,
      quantities,
      prices: { "DISCOUNTED PRICE@O": price },
    },
  };

  return {
    sourceId: `S1-R${input.row}`,
    sheet: "Reviewed Inventory",
    row: input.row,
    kind: "product" as const,
    proposedItemCode: input.code ?? `TMP-S1-R${input.row}`,
    candidate: null,
    evidence,
  };
}

function reviewedArtifacts(): GenerateCanonicalFixtureInput {
  const missingPriceFinding = {
    id: "F-MISSING_PRICE-S1-R6-DISCOUNTED PRICE@O",
    code: "MISSING_PRICE" as const,
    blocking: true as const,
    status: "unresolved" as const,
    message: "Price requires review",
    workbookSha256: WORKBOOK_HASH,
    sourceIds: ["S1-R6"],
    evidence: [],
    details: { priceSource: "DISCOUNTED PRICE@O" },
    resolutionKey: "F-MISSING_PRICE-S1-R6-DISCOUNTED PRICE@O",
  };
  const profile: ReviewReportArtifact = {
    schemaVersion: 1,
    workbook: {
      path: "excel/reviewed.xlsx",
      byteLength: 123,
      sha256: WORKBOOK_HASH,
      hasMacros: false,
      hasExternalLinks: false,
    },
    selectedSources: [],
    totals: { findings: 1, unresolvedFindings: 1 },
    canonicalLocations: [
      { code: "SR", type: "WAREHOUSE" },
      { code: "QC", type: "BRANCH" },
      { code: "BL", type: "BRANCH" },
      { code: "LU", type: "BRANCH" },
      { code: "VC", type: "BRANCH" },
      { code: "SP", type: "BRANCH" },
    ],
    findings: [missingPriceFinding],
    canonicalCandidates: [],
  };
  const resolutions: ResolutionArtifact = {
    schemaVersion: 1,
    workbookSha256: WORKBOOK_HASH,
    resolutions: {
      [missingPriceFinding.id]: {
        findingId: missingPriceFinding.id,
        workbookSha256: WORKBOOK_HASH,
        status: "resolved",
        reviewer: "Owner",
        reviewedAt: "2026-08-25T00:00:00.000Z",
        decision: "retain-inactive-without-price",
        reason: "Retain stock without inventing a sale price.",
        canonicalValue: {
          disposition: "retain",
          sourceId: "S1-R6",
          active: false,
          sellable: false,
          salePrice: null,
        },
      },
    },
  };
  const sourceMapping: SourceMappingArtifact = {
    schemaVersion: 1,
    workbook: profile.workbook,
    selectedSources: [],
    canonicalLocations: profile.canonicalLocations,
    rows: [
      sourceRow({
        row: 5,
        code: null,
        name: "Temporary code product",
        price: 12500,
        quantities: [2, 3, 99, 4, 5, 6],
      }),
      sourceRow({
        row: 6,
        code: "NO-PRICE",
        name: "Inactive stock",
        price: null,
        quantities: [0, 7, 88, 8, 9, 10],
      }),
    ],
  };

  return { profile, resolutions, sourceMapping };
}

describe("generateCanonicalFixture", () => {
  it("generates six exact locations, source stock, temporary codes, and null inactive prices", () => {
    const generated = generateCanonicalFixture(reviewedArtifacts());

    expect(generated.fixture.locations).toEqual([
      { code: "BL", name: "BL Branch", type: "BRANCH", sourceIds: [] },
      { code: "LU", name: "LU Branch", type: "BRANCH", sourceIds: [] },
      { code: "QC", name: "QC Branch", type: "BRANCH", sourceIds: [] },
      { code: "SP", name: "SP Branch", type: "BRANCH", sourceIds: [] },
      { code: "SR", name: "Stock Room", type: "WAREHOUSE", sourceIds: [] },
      { code: "VC", name: "VC Branch", type: "BRANCH", sourceIds: [] },
    ]);
    expect(generated.fixture.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemCode: "TMP-S1-R5",
          salePrice: "12500.00",
          status: "ACTIVE",
          sellable: true,
        }),
        expect.objectContaining({
          itemCode: "NO-PRICE",
          salePrice: null,
          status: "INACTIVE",
          sellable: false,
        }),
      ]),
    );
    expect(
      generated.fixture.openingBalances.filter(
        ({ itemCode }) => itemCode === "NO-PRICE",
      ),
    ).toEqual([
      { itemCode: "NO-PRICE", locationCode: "BL", onHand: 0, sourceIds: ["S1-R6:H6"] },
      { itemCode: "NO-PRICE", locationCode: "LU", onHand: 8, sourceIds: ["S1-R6:K6"] },
      { itemCode: "NO-PRICE", locationCode: "QC", onHand: 7, sourceIds: ["S1-R6:I6"] },
      { itemCode: "NO-PRICE", locationCode: "SP", onHand: 10, sourceIds: ["S1-R6:M6"] },
      { itemCode: "NO-PRICE", locationCode: "SR", onHand: 0, sourceIds: [] },
      { itemCode: "NO-PRICE", locationCode: "VC", onHand: 9, sourceIds: ["S1-R6:L6"] },
    ]);
    expect(generated.fixtureText).not.toContain('"salePrice": 0');
    expect(generated.fixtureText).not.toContain("BL BEFORE");
  });

  it("produces byte-identical fixture and mapping output on repeated generation", () => {
    const first = generateCanonicalFixture(reviewedArtifacts());
    const second = generateCanonicalFixture(reviewedArtifacts());

    expect(second.fixtureText).toBe(first.fixtureText);
    expect(second.mappingText).toBe(first.mappingText);
    expect(second.fixture.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.mapping.generation.mappingHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses incomplete, stale, unknown, duplicate, and ambiguous decisions", () => {
    const base = reviewedArtifacts();
    const stale = structuredClone(base);
    stale.resolutions.workbookSha256 = "b".repeat(64);
    const missing = structuredClone(base);
    missing.resolutions.resolutions = {} as typeof missing.resolutions.resolutions;
    const unknown = structuredClone(base);
    const resolution = Object.values(unknown.resolutions.resolutions)[0];
    unknown.resolutions.resolutions["F-UNKNOWN"] = {
      ...resolution,
      findingId: "F-UNKNOWN",
    };
    const ambiguous = structuredClone(base);
    const ambiguousResolution = Object.values(
      ambiguous.resolutions.resolutions,
    )[0];
    (ambiguousResolution.canonicalValue as { salePrice: number | null }).salePrice = 0;

    expect(() => generateCanonicalFixture(stale)).toThrow(/stale|hash/i);
    expect(() => generateCanonicalFixture(missing)).toThrow(/missing|coverage/i);
    expect(() => generateCanonicalFixture(unknown)).toThrow(/unknown|coverage/i);
    expect(() => generateCanonicalFixture(ambiguous)).toThrow(/inactive|sale price/i);
  });
});

describe("runCanonicalFixtureGenerator", () => {
  it("writes only after validation and check compares committed bytes", async () => {
    const artifacts = reviewedArtifacts();
    const roots = await Promise.all([
      mkdtemp(join(tmpdir(), "chezcar-canonical-a-")),
      mkdtemp(join(tmpdir(), "chezcar-canonical-b-")),
    ]);
    const paths = roots.map((root) => ({
      profilePath: join(root, "review-report.json"),
      resolutionsPath: join(root, "resolutions.json"),
      fixtureOutPath: join(root, "opening-catalog.json"),
      mappingOutPath: join(root, "source-mapping.json"),
    }));
    await Promise.all(
      paths.flatMap((pathSet) => [
        writeFile(
          pathSet.profilePath,
          `${JSON.stringify(artifacts.profile, null, 2)}\n`,
        ),
        writeFile(
          pathSet.resolutionsPath,
          `${JSON.stringify(artifacts.resolutions, null, 2)}\n`,
        ),
        writeFile(
          pathSet.mappingOutPath,
          `${JSON.stringify(artifacts.sourceMapping, null, 2)}\n`,
        ),
      ]),
    );

    await Promise.all(paths.map(runCanonicalFixtureGenerator));
    const [firstFixture, secondFixture, firstMapping, secondMapping] =
      await Promise.all([
        readFile(paths[0].fixtureOutPath, "utf8"),
        readFile(paths[1].fixtureOutPath, "utf8"),
        readFile(paths[0].mappingOutPath, "utf8"),
        readFile(paths[1].mappingOutPath, "utf8"),
      ]);
    await runCanonicalFixtureGenerator({ ...paths[0], check: true });

    expect(secondFixture).toBe(firstFixture);
    expect(secondMapping).toBe(firstMapping);
  });

  it("leaves both outputs untouched when reviewed input validation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "chezcar-canonical-refusal-"));
    const paths = {
      profilePath: join(root, "review-report.json"),
      resolutionsPath: join(root, "resolutions.json"),
      fixtureOutPath: join(root, "opening-catalog.json"),
      mappingOutPath: join(root, "source-mapping.json"),
    };
    const artifacts = reviewedArtifacts();
    artifacts.resolutions.workbookSha256 = "b".repeat(64);
    const fixtureMarker = "fixture must remain untouched\n";
    const mappingText = `${JSON.stringify(artifacts.sourceMapping, null, 2)}\n`;
    await Promise.all([
      writeFile(paths.profilePath, `${JSON.stringify(artifacts.profile, null, 2)}\n`),
      writeFile(
        paths.resolutionsPath,
        `${JSON.stringify(artifacts.resolutions, null, 2)}\n`,
      ),
      writeFile(paths.fixtureOutPath, fixtureMarker),
      writeFile(paths.mappingOutPath, mappingText),
    ]);

    await expect(runCanonicalFixtureGenerator(paths)).rejects.toThrow(/stale|hash/i);
    expect(await readFile(paths.fixtureOutPath, "utf8")).toBe(fixtureMarker);
    expect(await readFile(paths.mappingOutPath, "utf8")).toBe(mappingText);
  });
});
