import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { profileWorkbook } from "./workbook-profile.mjs";
import { createWorkbookFixtureBuffer } from "../../tests/fixtures/create-workbook-fixture";

const HOSTILE_FIXTURE_PATH = fileURLToPath(
  new URL("../../tests/fixtures/workbook-edge-cases.xlsx", import.meta.url),
);

describe("profileWorkbook", () => {
  let directory: string;
  let workbookPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "chezcar-workbook-profile-"));
    workbookPath = join(directory, "evidence.xlsx");

    const workbook = XLSX.utils.book_new();
    const evidence = XLSX.utils.aoa_to_sheet([
      ["ITEM CODE", "QUANTITY", "SOURCE"],
      ["SKU-001", 7, 7],
    ]);
    evidence.D2 = {
      t: "n",
      v: 999,
      f: "'Evidence'!C2",
    };
    evidence.E2 = {
      t: "s",
      v: "cached-only",
      f: 'WEBSERVICE("https://invalid.example/stock")',
    };
    evidence["!ref"] = "A1:E2";

    XLSX.utils.book_append_sheet(workbook, evidence, "Evidence");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["historical"]]),
      "Hidden history",
    );
    workbook.Workbook = {
      Sheets: [{ Hidden: 0 }, { Hidden: 1 }],
    };
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    await writeFile(workbookPath, bytes);
  });

  afterEach(async () => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(directory, { recursive: true, force: true }),
    );
  });

  it("preserves workbook, sheet, dimension, and cell source evidence", async () => {
    const bytesBefore = await readFile(workbookPath);
    const modifiedBefore = (await stat(workbookPath)).mtimeMs;

    const profile = await profileWorkbook(workbookPath, { sheet: "Evidence" });

    expect(profile.workbook).toEqual({
      path: workbookPath,
      byteLength: bytesBefore.byteLength,
      sha256: createHash("sha256").update(bytesBefore).digest("hex"),
      hasMacros: false,
      hasExternalLinks: false,
    });
    expect(profile.sheets).toEqual([
      { name: "Evidence", visibility: "visible" },
      { name: "Hidden history", visibility: "hidden" },
    ]);
    expect(profile.selectedSheet).toMatchObject({
      name: "Evidence",
      visibility: "visible",
      range: "A1:E2",
      dimensions: { rows: 2, columns: 5 },
    });
    expect(profile.selectedSheet.cells).toContainEqual({
      source: {
        sheet: "Evidence",
        address: "A2",
        row: 2,
        column: 1,
      },
      type: "s",
      rawValue: "SKU-001",
      formula: null,
      cachedValue: null,
      formattedValue: "SKU-001",
    });
    expect(await readFile(workbookPath)).toEqual(bytesBefore);
    expect((await stat(workbookPath)).mtimeMs).toBe(modifiedBefore);
    expect(await readdir(directory)).toEqual(["evidence.xlsx"]);
  });

  it("reports formulas as inert text and flags cache/reference disagreement", async () => {
    const profile = await profileWorkbook(workbookPath, { sheet: "Evidence" });
    const disagreement = profile.selectedSheet.cells.find(
      (cell) => cell.source.address === "D2",
    );
    const externalFormula = profile.selectedSheet.cells.find(
      (cell) => cell.source.address === "E2",
    );

    expect(disagreement).toMatchObject({
      rawValue: 999,
      formula: "'Evidence'!C2",
      cachedValue: 999,
    });
    expect(externalFormula).toMatchObject({
      rawValue: "cached-only",
      formula: 'WEBSERVICE("https://invalid.example/stock")',
      cachedValue: "cached-only",
    });
    expect(profile.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "FORMULA_CACHE_DISAGREEMENT",
          source: expect.objectContaining({ address: "D2" }),
          cachedValue: 999,
          referencedValue: 7,
        }),
        expect.objectContaining({
          code: "EXTERNAL_FORMULA_REFERENCE",
          source: expect.objectContaining({ address: "E2" }),
        }),
      ]),
    );
  });

  it("refuses missing and empty workbook inputs without writing output", async () => {
    const missingPath = join(directory, "missing.xlsx");
    const emptyPath = join(directory, "empty.xlsx");
    await writeFile(emptyPath, new Uint8Array());

    await expect(
      profileWorkbook(missingPath, { sheet: "Evidence" }),
    ).rejects.toThrow("Workbook file does not exist");
    await expect(
      profileWorkbook(emptyPath, { sheet: "Evidence" }),
    ).rejects.toThrow("Workbook file is empty");
    expect(await readdir(directory)).toEqual(["empty.xlsx", "evidence.xlsx"]);
  });

  it("rejects an unknown selected sheet", async () => {
    await expect(
      profileWorkbook(workbookPath, { sheet: "Not a sheet" }),
    ).rejects.toThrow('Sheet "Not a sheet" was not found');
  });
});

describe("hostile workbook fixture", () => {
  async function profileFixture(path = HOSTILE_FIXTURE_PATH) {
    return profileWorkbook(path, { sheet: "Hostile Inventory" });
  }

  function cell(
    profile: Awaited<ReturnType<typeof profileFixture>>,
    address: string,
  ) {
    return profile.selectedSheet.cells.find(
      (candidate) => candidate.source.address === address,
    );
  }

  it("preserves hidden, category, spacer, formula, and cache evidence", async () => {
    const profile = await profileFixture();

    expect(profile.sheets).toContainEqual({
      name: "Hidden history",
      visibility: "hidden",
    });
    expect(cell(profile, "A2")?.rawValue).toBe("CATEGORY");
    expect(cell(profile, "C2")?.rawValue).toBe("JIMNY ACCESSORIES");
    expect(profile.selectedSheet.cells.some(({ source }) => source.row === 3)).toBe(
      false,
    );
    expect(cell(profile, "G12")).toMatchObject({
      formula: "D12",
      cachedValue: 99,
    });
    expect(profile.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "FORMULA_CACHE_DISAGREEMENT",
          source: expect.objectContaining({ address: "G12" }),
          referencedValue: 4,
        }),
        expect.objectContaining({
          code: "EXTERNAL_FORMULA_REFERENCE",
          source: expect.objectContaining({ address: "G13" }),
        }),
      ]),
    );
  });

  it("preserves duplicate and missing item codes without cleanup", async () => {
    const profile = await profileFixture();

    expect(cell(profile, "B4")?.rawValue).toBe("DUP-001");
    expect(cell(profile, "B5")?.rawValue).toBe("DUP-001");
    expect(cell(profile, "B6")).toBeUndefined();
    expect(cell(profile, "C6")?.rawValue).toBe("Missing code item");
  });

  it("preserves negative, blank, and nonnumeric quantities", async () => {
    const profile = await profileFixture();

    expect(cell(profile, "D7")?.rawValue).toBe(-2);
    expect(cell(profile, "D8")).toBeUndefined();
    expect(cell(profile, "D9")?.rawValue).toBe("many");
  });

  it("preserves missing, conflicting, and nonnumeric prices", async () => {
    const profile = await profileFixture();

    expect(cell(profile, "E4")?.rawValue).toBe(100);
    expect(cell(profile, "E5")?.rawValue).toBe(120);
    expect(cell(profile, "E10")).toBeUndefined();
    expect(cell(profile, "E11")?.rawValue).toBe("-");
  });

  it("rebuilds to equivalent parsed evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chezcar-fixture-rebuild-"));
    const rebuiltPath = join(directory, "rebuilt.xlsx");

    try {
      await writeFile(rebuiltPath, createWorkbookFixtureBuffer());
      const [checkedIn, rebuilt] = await Promise.all([
        profileFixture(),
        profileFixture(rebuiltPath),
      ]);

      expect(rebuilt.sheets).toEqual(checkedIn.sheets);
      expect(rebuilt.selectedSheet).toEqual(checkedIn.selectedSheet);
      expect(rebuilt.findings).toEqual(checkedIn.findings);
    } finally {
      await import("node:fs/promises").then(({ rm }) =>
        rm(directory, { recursive: true, force: true }),
      );
    }
  });
});
