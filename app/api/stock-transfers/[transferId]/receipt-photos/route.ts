import { handleReceiptPhotoUpload } from "@/lib/server/receipt-photo-responses";

type Context = { params: Promise<{ transferId: string }> };

/** Photos of the delivery receipt that went out with a dispatched transfer. */
export async function POST(request: Request, context: Context) {
  const { transferId } = await context.params;
  return handleReceiptPhotoUpload(request, "stock-transfers:dispatch", { kind: "transfer", id: transferId });
}
