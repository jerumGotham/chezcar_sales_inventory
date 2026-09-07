import "server-only";

export type ReceiptOcrDraft = {
  rawText: string;
  confidence: number;
  detectedReceiptNumber: string | null;
  detectedTotalAmount: number | null;
  receiptNumberMatches: boolean;
  totalAmountMatches: boolean;
  lines: Array<{
    itemCode: string;
    name: string;
    quantity: number;
    unitPrice: number;
    itemDetected: boolean;
    quantityDetected: boolean;
    priceDetected: boolean;
  }>;
};

// Keep old persisted drafts readable until their receipt evidence is replaced.
export function parseReceiptOcrDraft(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as ReceiptOcrDraft;
  } catch {
    return null;
  }
}
