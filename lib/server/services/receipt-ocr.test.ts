import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildReceiptOcrDraft } from "./receipt-ocr";

describe("receipt OCR drafts", () => {
  it("compares recognized receipt text without changing review state", () => {
    const draft = buildReceiptOcrDraft(
      "OR NO. 12345\nITM-1 FLOOR MAT 2 x 500.00\nTOTAL 1,000.00",
      84.26,
      {
        manualReceiptNumber: "12345",
        totalAmount: { toNumber: () => 1000 },
        lines: [{
          productItemCode: "ITM-1",
          productName: "Floor Mat",
          quantity: 2,
          unitPrice: { toNumber: () => 500 },
        }],
      },
    );

    expect(draft).toMatchObject({
      confidence: 84.3,
      detectedReceiptNumber: "12345",
      detectedTotalAmount: 1000,
      receiptNumberMatches: true,
      totalAmountMatches: true,
      lines: [{ itemDetected: true, quantityDetected: true, priceDetected: true }],
    });
  });
});
