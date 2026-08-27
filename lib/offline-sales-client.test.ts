import { describe, expect, it } from "vitest";

import { shouldAttemptOfflineSync } from "./offline-sales-client";

describe("offline sync policy", () => {
  it("starts only for an online Branch Staff device with pending sales", () => {
    expect(shouldAttemptOfflineSync({ role: "BRANCH_STAFF", online: true, pendingCount: 1, inFlight: false })).toBe(true);
    expect(shouldAttemptOfflineSync({ role: "BRANCH_STAFF", online: true, pendingCount: 0, inFlight: false })).toBe(false);
    expect(shouldAttemptOfflineSync({ role: "BRANCH_STAFF", online: false, pendingCount: 1, inFlight: false })).toBe(false);
    expect(shouldAttemptOfflineSync({ role: "ADMIN", online: true, pendingCount: 1, inFlight: false })).toBe(false);
    expect(shouldAttemptOfflineSync({ role: "BRANCH_STAFF", online: true, pendingCount: 1, inFlight: true })).toBe(false);
  });
});
