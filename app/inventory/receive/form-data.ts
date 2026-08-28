import { createStockReceiptSchema, type CreateStockReceiptInput } from "@/lib/contracts/stock-receipts";

type ReceiptFormParseResult =
  | { ok: true; input: CreateStockReceiptInput }
  | { ok: false; message: string };

export function parseReceiptFormData(formData: FormData): ReceiptFormParseResult {
  const lineCount = Number(formData.get("lineCount"));
  if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > 50) {
    return { ok: false, message: "Receipt must contain between 1 and 50 lines." };
  }

  for (const key of formData.keys()) {
    const match = /^(?:productId|quantity|unitCost)-(\d+)$/.exec(key);
    if (match && Number(match[1]) >= lineCount) {
      return { ok: false, message: "Receipt line count does not match the submitted lines." };
    }
  }

  const result = createStockReceiptSchema.safeParse({
    reference: String(formData.get("reference") ?? ""),
    supplier: String(formData.get("supplier") ?? ""),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    lines: Array.from({ length: lineCount }, (_, index) => ({
      productId: String(formData.get(`productId-${index}`) ?? ""),
      quantity: Number(formData.get(`quantity-${index}`)),
      unitCost: Number(formData.get(`unitCost-${index}`)),
    })),
  });

  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Invalid supplier receipt input." };
  }

  return { ok: true, input: result.data };
}
