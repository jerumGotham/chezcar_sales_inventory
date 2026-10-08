import { handleReceiptPhotoUpload } from "@/lib/server/receipt-photo-responses";

type Context = { params: Promise<{ paymentId: string }> };

/** More photos of a payment receipt, after its first. */
export async function POST(request: Request, context: Context) {
  const { paymentId } = await context.params;
  return handleReceiptPhotoUpload(request, "sales:evidence:upload", { kind: "payment", id: paymentId });
}
