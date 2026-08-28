"use server";

import { headers } from "next/headers";

import { requireCapability } from "@/lib/server/authorization";
import { createStockReceipt } from "@/lib/server/services/stock-receipts";

import { parseReceiptFormData } from "./form-data";

export type ReceiptFormState = { ok: boolean; message: string } | null;

export async function postStockReceiptAction(
  _prev: ReceiptFormState,
  formData: FormData,
): Promise<ReceiptFormState> {
  const actor = await requireCapability(await headers(), "inventory-receiving:create");

  const parsed = parseReceiptFormData(formData);
  if (!parsed.ok) return parsed;

  try {
    await createStockReceipt(actor, {
      ...parsed.input,
    });
    return { ok: true, message: `Receipt ${parsed.input.reference} posted to Stock Room.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to post supplier receipt",
    };
  }
}
