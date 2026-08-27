import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isReceiptEvidenceKey } from "./receipt-evidence";

describe("receipt evidence keys", () => {
  it("accepts only generated image keys", () => {
    expect(isReceiptEvidenceKey("550e8400-e29b-41d4-a716-446655440000.jpg")).toBe(true);
    expect(isReceiptEvidenceKey("../../secret.txt")).toBe(false);
    expect(isReceiptEvidenceKey("550e8400-e29b-41d4-a716-446655440000.pdf")).toBe(false);
  });
});
