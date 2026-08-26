"use server";

import { headers } from "next/headers";

import { requireCapability } from "@/lib/server/authorization";
import { createStockReceipt } from "@/lib/server/services/stock-receipts";

export type ReceiptFormState = { ok: boolean; message: string } | null;

export async function postStockReceiptAction(
  _prev: ReceiptFormState,
  formData: FormData,
): Promise<ReceiptFormState> {
  const actor = await requireCapability(await headers(), "inventory-receiving:create");

  const reference = String(formData.get("reference") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!reference) return { ok: false, message: "Enter a receipt reference." };
  if (!supplier) return { ok: false, message: "Enter a supplier name." };

  const lineCount = Math.max(1, Math.min(50, Number(formData.get("lineCount") ?? 1) || 1));
  const seen = new Set<string>();
  const lines: { productId: string; quantity: number }[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    const productId = String(formData.get(`productId-${index}`) ?? "").trim();
    const quantity = Number(formData.get(`quantity-${index}`) ?? 0);
    if (!productId || seen.has(productId)) continue;
    if (!Number.isInteger(quantity) || quantity < 1) continue;
    seen.add(productId);
    lines.push({ productId, quantity });
  }

  if (lines.length === 0) {
    return { ok: false, message: "Every line needs a product and a whole number quantity of at least 1." };
  }

  try {
    await createStockReceipt(actor, {
      reference,
      supplier,
      notes: notes || undefined,
      lines,
    });
    return { ok: true, message: `Receipt ${reference} posted to Stock Room.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to post supplier receipt",
    };
  }
}
