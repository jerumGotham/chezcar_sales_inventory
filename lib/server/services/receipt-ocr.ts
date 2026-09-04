import "server-only";

import { createRequire } from "node:module";

import { createWorker, OEM } from "tesseract.js";

const require = createRequire(import.meta.url);
const englishData = require("@tesseract.js-data/eng") as {
  code: string;
  gzip: boolean;
  langPath: string;
};

type ReceiptSale = {
  manualReceiptNumber: string;
  totalAmount: { toNumber(): number };
  lines: Array<{
    productItemCode: string;
    productName: string;
    quantity: number;
    unitPrice: { toNumber(): number };
  }>;
};

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

function normalized(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

function moneyCandidates(text: string) {
  return [...text.matchAll(/(?:PHP|P|₱)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})/gi)]
    .map((match) => Number(match[1].replaceAll(",", "")))
    .filter(Number.isFinite);
}

function detectedLabeledMoney(text: string, label: RegExp) {
  const line = text.split(/\r?\n/).find((value) => label.test(value));
  return line ? moneyCandidates(line).at(-1) ?? null : null;
}

export async function extractReceiptOcrDraft(
  image: Uint8Array,
  sale: ReceiptSale,
): Promise<ReceiptOcrDraft> {
  const worker = await createWorker(englishData.code, OEM.LSTM_ONLY, {
    gzip: englishData.gzip,
    langPath: englishData.langPath,
  });
  try {
    const result = await worker.recognize(Buffer.from(image));
    return buildReceiptOcrDraft(result.data.text, result.data.confidence, sale);
  } finally {
    await worker.terminate();
  }
}

export function buildReceiptOcrDraft(
  text: string,
  confidence: number,
  sale: ReceiptSale,
): ReceiptOcrDraft {
    const rawText = text.trim();
    const searchable = normalized(rawText);
    const receiptMatch = rawText.match(/(?:RECEIPT(?:\s+NO)?|OR\s+NO|NO)\s*[#.:\-]*\s*([A-Z0-9-]{2,})/i);
    const detectedReceiptNumber = receiptMatch?.[1] ?? null;
    const detectedTotalAmount = detectedLabeledMoney(rawText, /\b(?:GRAND\s+)?TOTAL\b/i);
    const expectedTotal = sale.totalAmount.toNumber();

    return {
      rawText,
      confidence: Math.round(confidence * 10) / 10,
      detectedReceiptNumber,
      detectedTotalAmount,
      receiptNumberMatches:
        searchable.includes(normalized(sale.manualReceiptNumber)) ||
        normalized(detectedReceiptNumber ?? "") === normalized(sale.manualReceiptNumber),
      totalAmountMatches:
        detectedTotalAmount !== null &&
        Math.round(detectedTotalAmount * 100) === Math.round(expectedTotal * 100),
      lines: sale.lines.map((line) => {
        const quantityPattern = new RegExp(`(?:^|[^0-9])${line.quantity}(?:[^0-9]|$)`);
        const unitPrice = line.unitPrice.toNumber();
        return {
          itemCode: line.productItemCode,
          name: line.productName,
          quantity: line.quantity,
          unitPrice,
          itemDetected:
            searchable.includes(normalized(line.productItemCode)) ||
            searchable.includes(normalized(line.productName)),
          quantityDetected: quantityPattern.test(rawText),
          priceDetected: moneyCandidates(rawText).some(
            (value) => Math.round(value * 100) === Math.round(unitPrice * 100),
          ),
        };
      }),
    };
}

export function parseReceiptOcrDraft(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as ReceiptOcrDraft;
  } catch {
    return null;
  }
}
