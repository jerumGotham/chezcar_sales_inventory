import { describe, expect, it } from "vitest";

import { calculateWarrantyQuarantine } from "./warranty-quarantine";

describe("warranty quarantine ownership", () => {
  it("retains replacement ownership but clears physically released repair ownership", () => {
    expect(calculateWarrantyQuarantine({ receivedQuantity: 3, returnedQuantity: 1, resolution: "REPLACEMENT", status: "COMPLETED" }, 1, 1)).toEqual({ unassignedQuantity: 1, unresolvedQuantity: 2 });
    expect(calculateWarrantyQuarantine({ receivedQuantity: 2, returnedQuantity: 0, resolution: "REPAIR", status: "RELEASED" }, 0, 0)).toEqual({ unassignedQuantity: 0, unresolvedQuantity: 0 });
  });
});
