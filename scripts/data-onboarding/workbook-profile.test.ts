import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { profileWorkbook } from "./workbook-profile.mjs";

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
