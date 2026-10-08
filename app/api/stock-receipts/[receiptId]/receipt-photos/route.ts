import { handleReceiptPhotoUpload } from "@/lib/server/receipt-photo-responses";

type Context = { params: Promise<{ receiptId: string }> };

/** Photos of a supplier's delivery receipt, up to five. */
export async function POST(request: Request, context: Context) {
  const { receiptId } = await context.params;
  return handleReceiptPhotoUpload(request, "inventory-receiving:create", { kind: "stockReceipt", id: receiptId });
}
