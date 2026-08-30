import { describe, expect, it } from "vitest";

import { IDLE_LOGOUT_MS, idleTimeRemaining } from "./idle-session";

describe("idleTimeRemaining", () => {
  it("expires after ten minutes without activity", () => {
    const startedAt = 1_000;

    expect(idleTimeRemaining(startedAt, startedAt + IDLE_LOGOUT_MS - 1)).toBe(1);
    expect(idleTimeRemaining(startedAt, startedAt + IDLE_LOGOUT_MS)).toBe(0);
  });

  it("never returns a negative delay", () => {
    expect(idleTimeRemaining(0, IDLE_LOGOUT_MS * 2)).toBe(0);
  });
});
