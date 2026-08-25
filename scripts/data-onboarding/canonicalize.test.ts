import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildReviewFindings,
  classifySourceRow,
  resolutionRecordSchema,
  type ProfileEvidence,
} from "./canonicalize.mjs";

type ReviewArtifact = {
  workbook: { sha256: string };
  findings: Array<{ id: string; blocking: true }>;
};

type ResolutionArtifact = {
  workbookSha256: string;
  resolutions: Record<string, unknown>;
};

function validateResolutionCoverage(
  review: ReviewArtifact,
  artifact: ResolutionArtifact,
) {
  if (artifact.workbookSha256 !== review.workbook.sha256) {
    throw new Error("Resolution workbook hash is stale");
  }

  const expectedIds = new Set(review.findings.map(({ id }) => id));
  const records = Object.entries(artifact.resolutions).map(([key, value]) => {
    const record = resolutionRecordSchema.parse(value);

    if (key !== record.findingId) {
      throw new Error(`Resolution key does not match finding ID: ${key}`);
    }
    if (record.workbookSha256 !== review.workbook.sha256) {
      throw new Error(`Resolution workbook hash is stale: ${key}`);
    }
    if (
      record.status !== "resolved" ||
      !record.reviewer ||
      !record.reviewedAt ||
      !record.decision ||
      !record.reason
    ) {
      throw new Error(`Resolution is incomplete: ${key}`);
    }

    return record;
  });
  const recordIds = records.map(({ findingId }) => findingId);

  if (new Set(recordIds).size !== recordIds.length) {
    throw new Error("Duplicate resolution finding ID");
  }

  const missingIds = [...expectedIds].filter((id) => !recordIds.includes(id));
  const unknownIds = recordIds.filter((id) => !expectedIds.has(id));
  if (missingIds.length > 0 || unknownIds.length > 0) {
    throw new Error(
      `Resolution coverage mismatch: ${missingIds.length} missing, ${unknownIds.length} unknown`,
    );
  }

  return records;
}

type CellValue = string | number | boolean | null;

function cell(
  row: number,
  column: number,
  rawValue: CellValue,
  overrides: Partial<ProfileEvidence["cells"][number]> = {},
): ProfileEvidence["cells"][number] {
  const address = `${String.fromCharCode(64 + column)}${row}`;

  return {
    source: { sheet: "Hostile Inventory", address, row, column },
    type: typeof rawValue === "number" ? "n" : "s",
    rawValue,
    normalizedValue:
      typeof rawValue === "string" ? rawValue.trim() : rawValue,
    formula: null,
    cachedValue: null,
    formattedValue: rawValue === null ? null : String(rawValue),
    ...overrides,
  };
}

function row(
  rowNumber: number,
  values: {
    rowType?: CellValue;
    itemCode?: CellValue;
    itemName?: CellValue;
    quantity?: CellValue;
    price?: CellValue;
  },
): ProfileEvidence {
  const sourceCells = [
    cell(rowNumber, 1, values.rowType ?? null),
    cell(rowNumber, 2, values.itemCode ?? null),
    cell(rowNumber, 3, values.itemName ?? null),
    cell(rowNumber, 4, values.quantity ?? null),
    cell(rowNumber, 5, values.price ?? null),
  ];

  return {
    workbookSha256: "a".repeat(64),
    sheet: "Hostile Inventory",
    sheetIndex: 1,
    row: rowNumber,
    cells: sourceCells,
    fields: {
      rowType: sourceCells[0],
      itemCode: sourceCells[1],
      itemName: sourceCells[2],
      quantities: { QC: sourceCells[3] },
      prices: { DISCOUNTED_PRICE: sourceCells[4] },
    },
  };
}

describe("classifySourceRow", () => {
  it.each([
    ["spacer", row(3, {})],
    [
      "heading",
      row(2, {
        rowType: "CATEGORY",
        itemName: "  JIMNY ACCESSORIES  ",
      }),
    ],
  ] as const)("classifies %s rows before temporary code generation", (kind, evidence) => {
    const classified = classifySourceRow(evidence);

    expect(classified.kind).toBe(kind);
    expect(classified.candidate).toBeNull();
  });

  it("creates a deterministic temporary code only for a classified product", () => {
    const classified = classifySourceRow(
      row(6, {
        rowType: "ITEM",
        itemName: "  Missing code item  ",
        quantity: 1,
        price: 30,
      }),
    );

    expect(classified.kind).toBe("product");
    expect(classified.candidate).toMatchObject({
      itemCode: "TMP-S1-R6",
      itemName: "Missing code item",
    });
    expect(classified.evidence.fields.itemName).toMatchObject({
      rawValue: "  Missing code item  ",
      normalizedValue: "Missing code item",
      source: {
        sheet: "Hostile Inventory",
        address: "C6",
        row: 6,
        column: 3,
      },
    });
  });

  it("treats formula-only rows as spacers and accessory labels as headings", () => {
    const formulaOnly = row(33, {});
    formulaOnly.cells[3].rawValue = 0;
    formulaOnly.cells[3].normalizedValue = 0;
    formulaOnly.cells[3].formula = "'BL AUGUST 2026'!E33";
    formulaOnly.cells[3].cachedValue = 0;
    formulaOnly.fields.quantities.QC = formulaOnly.cells[3];
    const heading = row(1431, {
      itemName: "JIMNY ACCESSORIES",
      quantity: 0,
    });

    expect(classifySourceRow(formulaOnly).kind).toBe("spacer");
    expect(classifySourceRow(heading).kind).toBe("heading");
  });
});

describe("buildReviewFindings", () => {
  it.each([
    ["negative", -2, "INVALID_QUANTITY_NEGATIVE"],
    ["blank", null, "INVALID_QUANTITY_BLANK"],
    ["nonnumeric", "many", "INVALID_QUANTITY_NONNUMERIC"],
  ])("blocks a %s quantity without coercion", (_label, quantity, code) => {
    const result = buildReviewFindings([
      row(7, {
        rowType: "ITEM",
        itemCode: "BAD-QTY",
        itemName: "Bad quantity",
        quantity,
        price: 40,
      }),
    ]);

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code, status: "unresolved", blocking: true }),
    );
    expect(result.canonicalCandidates).toEqual([]);
  });

  it.each([
    ["missing", null, "MISSING_PRICE"],
    ["nonnumeric", "-", "NONNUMERIC_PRICE"],
  ])("blocks a %s price", (_label, price, code) => {
    const result = buildReviewFindings([
      row(10, {
        rowType: "ITEM",
        itemCode: "BAD-PRICE",
        itemName: "Bad price",
        quantity: 2,
        price,
      }),
    ]);

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code, status: "unresolved", blocking: true }),
    );
    expect(result.canonicalCandidates).toEqual([]);
  });

  it("blocks every duplicate code collision and conflicting price without choosing a winner", () => {
    const result = buildReviewFindings([
      row(4, {
        rowType: "ITEM",
        itemCode: "DUP-001",
        itemName: "Duplicate item A",
        quantity: 5,
        price: 100,
      }),
      row(5, {
        rowType: "ITEM",
        itemCode: "DUP-001",
        itemName: "Duplicate item B",
        quantity: 6,
        price: 120,
      }),
    ]);

    expect(result.findings.filter(({ code }) => code === "DUPLICATE_CODE")).toHaveLength(2);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "CONFLICTING_PRICE", blocking: true }),
    );
    expect(result.canonicalCandidates).toEqual([]);
  });

  it("blocks suspected duplicate names under different codes", () => {
    const result = buildReviewFindings([
      row(14, {
        rowType: "ITEM",
        itemCode: "ONE",
        itemName: "Same Product",
        quantity: 1,
        price: 10,
      }),
      row(15, {
        rowType: "ITEM",
        itemCode: "TWO",
        itemName: " same   product ",
        quantity: 1,
        price: 10,
      }),
    ]);

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "SUSPECTED_DUPLICATE", blocking: true }),
    );
    expect(result.canonicalCandidates).toEqual([]);
  });

  it("retains formula, cache, raw, normalized, and coordinate evidence in findings", () => {
    const evidence = row(12, {
      rowType: "ITEM",
      itemCode: "TRACE",
      itemName: "Trace item",
      quantity: -1,
      price: 80,
    });
    const quantity = evidence.fields.quantities.QC;
    quantity.formula = "'QC AUGUST 2026'!D12";
    quantity.cachedValue = -1;

    const result = buildReviewFindings([evidence]);
    const finding = result.findings.find(
      ({ code }) => code === "INVALID_QUANTITY_NEGATIVE",
    );

    expect(finding?.evidence).toContainEqual(
      expect.objectContaining({
        source: {
          sheet: "Hostile Inventory",
          address: "D12",
          row: 12,
          column: 4,
        },
        rawValue: -1,
        normalizedValue: -1,
        formula: "'QC AUGUST 2026'!D12",
        cachedValue: -1,
      }),
    );
  });

  it("always blocks unresolved SR and BL BEFORE source decisions for the fixed canonical locations", () => {
    const result = buildReviewFindings([
      row(20, {
        rowType: "ITEM",
        itemCode: "VALID",
        itemName: "Valid item",
        quantity: 1,
        price: 10,
      }),
    ]);

    expect(result.canonicalLocations).toEqual([
      { code: "SR", type: "WAREHOUSE" },
      { code: "QC", type: "BRANCH" },
      { code: "BL", type: "BRANCH" },
      { code: "LU", type: "BRANCH" },
      { code: "VC", type: "BRANCH" },
      { code: "SP", type: "BRANCH" },
    ]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNRESOLVED_SR_SOURCE", blocking: true }),
        expect.objectContaining({
          code: "UNRESOLVED_BL_BEFORE_SOURCE",
          blocking: true,
        }),
      ]),
    );
    expect(result.canonicalCandidates).toEqual([]);
  });
});

describe("approved owner resolution coverage", () => {
  const review = JSON.parse(
    readFileSync(
      new URL("./review-report.json", import.meta.url),
      "utf8",
    ),
  ) as ReviewArtifact;
  const resolutions = JSON.parse(
    readFileSync(new URL("./resolutions.json", import.meta.url), "utf8"),
  ) as ResolutionArtifact;

  it("has exactly one complete reviewed resolution for every blocking finding", () => {
    const records = validateResolutionCoverage(review, resolutions);

    expect(records).toHaveLength(review.findings.length);
    expect(records).toHaveLength(855);
    expect(new Set(records.map(({ findingId }) => findingId))).toHaveLength(855);
  });

  it.each([
    ["stale hash", (copy: ResolutionArtifact) => {
      copy.workbookSha256 = "a".repeat(64);
    }],
    ["missing ID", (copy: ResolutionArtifact) => {
      delete copy.resolutions[Object.keys(copy.resolutions)[0]];
    }],
    ["unknown ID", (copy: ResolutionArtifact) => {
      const first = structuredClone(Object.values(copy.resolutions)[0]) as {
        findingId: string;
      };
      first.findingId = "F-UNKNOWN-S1-R1";
      copy.resolutions[first.findingId] = first;
    }],
    ["duplicate finding ID", (copy: ResolutionArtifact) => {
      const [first, second] = Object.values(copy.resolutions) as Array<{
        findingId: string;
      }>;
      second.findingId = first.findingId;
    }],
    ["malformed resolution", (copy: ResolutionArtifact) => {
      const first = Object.values(copy.resolutions)[0] as { reviewer?: string };
      delete first.reviewer;
    }],
  ])("refuses %s resolution data", (_label, mutate) => {
    const copy = structuredClone(resolutions);
    mutate(copy);

    expect(() => validateResolutionCoverage(review, copy)).toThrow();
  });
});
