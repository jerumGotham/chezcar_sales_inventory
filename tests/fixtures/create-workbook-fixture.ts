import * as XLSX from "xlsx";

export function createWorkbookFixtureBuffer(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const hostileInventory = XLSX.utils.aoa_to_sheet([
    [
      "ROW TYPE",
      "ITEM CODE",
      "ITEM NAME",
      "QUANTITY",
      "PRICE",
      "FORMULA SOURCE",
      "FORMULA CACHE",
    ],
    ["CATEGORY", null, "JIMNY ACCESSORIES"],
    [],
    ["ITEM", "DUP-001", "Duplicate item A", 5, 100],
    ["ITEM", "DUP-001", "Duplicate item B", 6, 120],
    ["ITEM", null, "Missing code item", 1, 30],
    ["ITEM", "NEG-QTY", "Negative quantity", -2, 40],
    ["ITEM", "BLANK-QTY", "Blank quantity", null, 50],
    ["ITEM", "TEXT-QTY", "Nonnumeric quantity", "many", 60],
    ["ITEM", "MISSING-PRICE", "Missing price", 2, null],
    ["ITEM", "TEXT-PRICE", "Nonnumeric price", 3, "-"],
    ["ITEM", "STALE-CACHE", "Stale formula cache", 4, 80, "D12"],
    ["ITEM", "EXTERNAL", "External formula", 1, 90, "remote source"],
  ]);

  hostileInventory.G12 = { t: "n", v: 99, f: "D12" };
  hostileInventory.G13 = {
    t: "s",
    v: "cached-only",
    f: 'WEBSERVICE("https://invalid.example/stock")',
  };
  hostileInventory["!ref"] = "A1:G13";

  XLSX.utils.book_append_sheet(workbook, hostileInventory, "Hostile Inventory");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["ITEM CODE", "HISTORICAL QUANTITY"],
      ["DUP-001", 999],
    ]),
    "Hidden history",
  );
  workbook.Workbook = {
    Sheets: [{ Hidden: 0 }, { Hidden: 1 }],
  };
  workbook.Props = {
    Author: "Chezcar test fixture",
    CreatedDate: new Date("2026-08-25T00:00:00.000Z"),
    ModifiedDate: new Date("2026-08-25T00:00:00.000Z"),
    Subject: "Deterministic hostile workbook evidence",
    Title: "Chezcar workbook edge cases",
  };

  const bytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
    compression: true,
  });

  return new Uint8Array(bytes);
}
