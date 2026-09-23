import { describe, expect, it } from "vitest";

import { parseScopeValue } from "./location-scope-control";

describe("parseScopeValue", () => {
  it("treats all and empty as no branch filter", () => {
    expect(parseScopeValue("all")).toEqual([]);
    expect(parseScopeValue("")).toEqual([]);
  });

  it("reads one branch", () => {
    expect(parseScopeValue("BL")).toEqual(["BL"]);
  });

  it("reads several, trimming and dropping repeats", () => {
    expect(parseScopeValue("BL, LU ,QC,LU")).toEqual(["BL", "LU", "QC"]);
  });

  it("ignores empty entries from a stray comma", () => {
    expect(parseScopeValue("BL,,LU,")).toEqual(["BL", "LU"]);
  });
});
