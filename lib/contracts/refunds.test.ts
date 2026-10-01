import { describe, expect, it } from "vitest";

import {
  CANCELLATION_SETTLEMENT_OPTIONS,
  cancelOrderSettlementSchema,
  quarantineReleaseSchema,
  REFUND_DISPOSITION_OPTIONS,
  refundDispositionLabel,
  saleRefundSchema,
} from "./refunds";

describe("cancelOrderSettlementSchema", () => {
  it("still accepts a plain cancellation, which is what every earlier caller sent", () => {
    const parsed = cancelOrderSettlementSchema.parse({});
    expect(parsed.settlement).toBeUndefined();
  });

  it("accepts forfeiting without any refund detail", () => {
    expect(cancelOrderSettlementSchema.safeParse({ settlement: "FORFEITED" }).success).toBe(true);
  });

  it("requires an amount, a slip number and a reason before money goes back", () => {
    const result = cancelOrderSettlementSchema.safeParse({ settlement: "REFUNDED" });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("refundAmount");
    expect(paths).toContain("acknowledgementNumber");
    expect(paths).toContain("note");
  });

  it("rejects a refund of nothing", () => {
    const result = cancelOrderSettlementSchema.safeParse({
      settlement: "REFUNDED",
      refundAmount: 0,
      acknowledgementNumber: "ACK-1",
      note: "Customer backed out",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a complete refund", () => {
    const result = cancelOrderSettlementSchema.safeParse({
      settlement: "REFUNDED",
      refundAmount: 6000,
      acknowledgementNumber: "ACK-1",
      note: "Customer backed out",
    });
    expect(result.success).toBe(true);
  });

  it("refuses a fraction of a centavo", () => {
    const result = cancelOrderSettlementSchema.safeParse({
      settlement: "REFUNDED",
      refundAmount: 100.005,
      acknowledgementNumber: "ACK-1",
      note: "Reason",
    });
    expect(result.success).toBe(false);
  });

  it("offers both settlements in the dropdown", () => {
    expect(CANCELLATION_SETTLEMENT_OPTIONS.map((option) => option.value)).toEqual([
      "FORFEITED",
      "REFUNDED",
    ]);
  });
});

describe("saleRefundSchema", () => {
  const base = { acknowledgementNumber: "ACK-9", reason: "Customer returned it" };

  it("accepts a full refund with nothing itemised", () => {
    const result = saleRefundSchema.safeParse({ ...base, scope: "FULL" });
    expect(result.success).toBe(true);
  });

  it("defaults a full refund's returned stock to sellable", () => {
    const parsed = saleRefundSchema.parse({ ...base, scope: "FULL" });
    expect(parsed.disposition).toBe("RESELLABLE");
  });

  it("requires at least one line on a partial refund", () => {
    const result = saleRefundSchema.safeParse({ ...base, scope: "PARTIAL", lines: [] });
    expect(result.success).toBe(false);
  });

  it("rejects the same product twice, which would return it twice over", () => {
    const result = saleRefundSchema.safeParse({
      ...base,
      scope: "PARTIAL",
      lines: [
        { productId: "p1", quantity: 1, disposition: "RESELLABLE" },
        { productId: "p1", quantity: 1, disposition: "QUARANTINED" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a partial refund with a disposition per line", () => {
    const result = saleRefundSchema.safeParse({
      ...base,
      scope: "PARTIAL",
      lines: [
        { productId: "p1", quantity: 2, disposition: "RESELLABLE" },
        { productId: "p2", quantity: 1, disposition: "QUARANTINED" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("refuses a returned quantity that is zero or fractional", () => {
    for (const quantity of [0, -1, 1.5]) {
      const result = saleRefundSchema.safeParse({
        ...base,
        scope: "PARTIAL",
        lines: [{ productId: "p1", quantity, disposition: "RESELLABLE" }],
      });
      expect(result.success, `quantity ${quantity} should be rejected`).toBe(false);
    }
  });

  it("requires a slip number and a reason, so money never leaves unrecorded", () => {
    const missingSlip = saleRefundSchema.safeParse({ scope: "FULL", reason: "x", acknowledgementNumber: "" });
    const missingReason = saleRefundSchema.safeParse({ scope: "FULL", reason: "", acknowledgementNumber: "ACK" });
    expect(missingSlip.success).toBe(false);
    expect(missingReason.success).toBe(false);
  });
});

describe("quarantineReleaseSchema", () => {
  it("accepts a whole number of units with a reason", () => {
    expect(quarantineReleaseSchema.safeParse({ quantity: 2, reason: "Checked, good" }).success).toBe(true);
  });

  it("refuses releasing nothing, or releasing without saying why", () => {
    expect(quarantineReleaseSchema.safeParse({ quantity: 0, reason: "Checked" }).success).toBe(false);
    expect(quarantineReleaseSchema.safeParse({ quantity: 1, reason: "" }).success).toBe(false);
  });
});

describe("refundDispositionLabel", () => {
  it("says plainly where the stock goes", () => {
    expect(refundDispositionLabel("RESELLABLE")).toBe("Back to sellable stock");
    expect(refundDispositionLabel("QUARANTINED")).toBe("Quarantine for checking");
  });

  it("offers both choices in the dropdown", () => {
    expect(REFUND_DISPOSITION_OPTIONS.map((option) => option.value)).toEqual([
      "RESELLABLE",
      "QUARANTINED",
    ]);
  });
});
