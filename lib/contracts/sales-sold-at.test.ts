import { describe, expect, it } from "vitest";

import { MAX_BACKDATED_SALE_DAYS, soldAtBounds, soldAtSchema } from "./sales";

describe("soldAtSchema", () => {
  it("accepts a calendar day", () => {
    expect(soldAtSchema.parse("2026-09-21")).toBe("2026-09-21");
  });

  it("leaves a sale encoded on the spot undated", () => {
    expect(soldAtSchema.parse(undefined)).toBeUndefined();
  });

  it.each(["21-09-2026", "2026-9-21", "2026/09/21", "yesterday", ""])(
    "rejects %s",
    (value) => {
      expect(soldAtSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects a day that does not exist", () => {
    expect(soldAtSchema.safeParse("2026-02-31").success).toBe(false);
  });
});

describe("soldAtBounds", () => {
  const now = new Date("2026-09-23T10:00:00.000Z");

  it("never reaches past the present", () => {
    expect(soldAtBounds(now).latest.getTime()).toBe(now.getTime());
  });

  it("opens exactly the backdating window", () => {
    const { earliest } = soldAtBounds(now);
    const days = Math.round((now.getTime() - earliest.getTime()) / (24 * 60 * 60 * 1000));
    expect(days).toBe(MAX_BACKDATED_SALE_DAYS);
  });
});
