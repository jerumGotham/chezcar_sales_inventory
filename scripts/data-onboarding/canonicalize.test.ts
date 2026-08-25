import { describe, expect, it } from "vitest";

import {
  buildReviewFindings,
  classifySourceRow,
  type ProfileEvidence,
} from "./canonicalize.mjs";

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
