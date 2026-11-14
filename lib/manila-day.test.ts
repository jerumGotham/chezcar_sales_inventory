import { describe, expect, it } from "vitest";

import { manilaDayBoundary, manilaDayRange } from "./manila-day";

describe("manilaDayBoundary", () => {
  it("starts a Manila day at the previous afternoon in UTC", () => {
    // Manila is UTC+8 with no daylight saving, so midnight there is 16:00
    // the day before in UTC. A boundary computed in the server's own zone
    // would land eight hours out and move rows between periods.
    expect(manilaDayBoundary("2026-11-14").toISOString()).toBe("2026-11-13T16:00:00.000Z");
  });

  it("ends a day at the start of the next one", () => {
    expect(manilaDayBoundary("2026-11-14", true).toISOString()).toBe("2026-11-14T16:00:00.000Z");
  });

  it("rolls over a month and a year end", () => {
    expect(manilaDayBoundary("2026-11-30", true).toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(manilaDayBoundary("2026-12-31", true).toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });
});

describe("manilaDayRange", () => {
  it("asks for everything when neither end is given", () => {
    // An untouched filter must not quietly become an empty result.
    expect(manilaDayRange(undefined, undefined)).toBeUndefined();
    expect(manilaDayRange("", "")).toBeUndefined();
  });

  it("bounds one side only when one end is given", () => {
    expect(manilaDayRange("2026-11-14", undefined)).toEqual({
      gte: new Date("2026-11-13T16:00:00.000Z"),
    });
    expect(manilaDayRange(undefined, "2026-11-14")).toEqual({
      lt: new Date("2026-11-14T16:00:00.000Z"),
    });
  });

  it("keeps a single day whole", () => {
    // The same day at both ends is a 24-hour window, not an empty one, which
    // is what `lt` the next midnight buys over `lte` this one.
    const range = manilaDayRange("2026-11-14", "2026-11-14");

    expect(range).toEqual({
      gte: new Date("2026-11-13T16:00:00.000Z"),
      lt: new Date("2026-11-14T16:00:00.000Z"),
    });
    const span = range!.lt!.getTime() - range!.gte!.getTime();
    expect(span).toBe(24 * 60 * 60 * 1_000);
  });

  it("includes the last instant of the closing day", () => {
    const range = manilaDayRange("2026-11-01", "2026-11-30")!;
    // 23:59 Manila on the 30th, the moment an `lte` midnight bound drops.
    const lastMinute = new Date("2026-11-30T15:59:00.000Z");

    expect(lastMinute >= range.gte!).toBe(true);
    expect(lastMinute < range.lt!).toBe(true);
  });
});
