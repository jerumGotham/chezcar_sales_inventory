import { describe, expect, it } from "vitest";

import { shouldAttemptOfflineSync } from "./offline-sales-client";

describe("offline sync policy", () => {
  it("starts only for an online Branch Staff device with pending sales", () => {
    expect(shouldAttemptOfflineSync({ enabled: true, online: true, pendingCount: 1, inFlight: false })).toBe(true);
    expect(shouldAttemptOfflineSync({ enabled: true, online: true, pendingCount: 0, inFlight: false })).toBe(false);
    expect(shouldAttemptOfflineSync({ enabled: true, online: false, pendingCount: 1, inFlight: false })).toBe(false);
    expect(shouldAttemptOfflineSync({ enabled: false, online: true, pendingCount: 1, inFlight: false })).toBe(false);
    expect(shouldAttemptOfflineSync({ enabled: true, online: true, pendingCount: 1, inFlight: true })).toBe(false);
  });
});
