import { describe, expect, it } from "vitest";

import {
  createPersonnelSchema,
  personnelStatusRequestSchema,
  updatePersonnelSchema,
} from "./personnel";

describe("personnel contracts", () => {
  it.each(["SALESPERSON", "INSTALLER", "BOTH"] as const)("accepts %s personnel", (type) => {
    expect(createPersonnelSchema.parse({ fullName: " Ana Reyes ", locationId: "branch-1", type })).toEqual({
      fullName: "Ana Reyes",
      locationId: "branch-1",
      type,
    });
  });

  it("rejects incomplete records and empty updates", () => {
    expect(() => createPersonnelSchema.parse({ fullName: "", locationId: "branch-1", type: "SALESPERSON" })).toThrow();
    expect(() => createPersonnelSchema.parse({ fullName: "Ana", locationId: "", type: "SALESPERSON" })).toThrow();
    expect(() => createPersonnelSchema.parse({ fullName: "Ana", locationId: "branch-1", type: "MANAGER" })).toThrow();
    expect(() => updatePersonnelSchema.parse({})).toThrow();
  });

  it("accepts only active and inactive lifecycle states", () => {
    expect(personnelStatusRequestSchema.parse({ status: "ACTIVE" })).toEqual({ status: "ACTIVE" });
    expect(() => personnelStatusRequestSchema.parse({ status: "DELETED" })).toThrow();
  });
});
