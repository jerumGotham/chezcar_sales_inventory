import { describe, expect, it } from "vitest";

import { availableStock } from "./inventory-quantity";

describe("availableStock", () => {
  it("excludes reserved and quarantined quantities", () => {
    expect(availableStock({ onHand: 10, reserved: 2, quarantined: 3 })).toBe(5);
  });
});
