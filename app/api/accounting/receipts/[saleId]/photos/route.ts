import { handleReceiptPhotoUpload } from "@/lib/server/receipt-photo-responses";

type Context = { params: Promise<{ saleId: string }> };

/** More photos of a sale's receipt, after its first. */
export async function POST(request: Request, context: Context) {
  const { saleId } = await context.params;
  return handleReceiptPhotoUpload(request, "sales:evidence:upload", { kind: "sale", id: saleId });
}
