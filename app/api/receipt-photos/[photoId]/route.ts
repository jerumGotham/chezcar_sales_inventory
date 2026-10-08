import { requireActiveUser } from "@/lib/server/authorization";
import { receiptPhotoErrorResponse } from "@/lib/server/receipt-photo-responses";
import { deleteReceiptPhoto, readReceiptPhoto } from "@/lib/server/services/receipt-photos";

type Context = { params: Promise<{ photoId: string }> };

/** One extra receipt photo: served to whoever may see that receipt. */
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireActiveUser(request.headers);
    const { photoId } = await context.params;
    const evidence = await readReceiptPhoto(actor, photoId);
    return new Response(evidence.body, { headers: { "Content-Type": evidence.contentType, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return receiptPhotoErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireActiveUser(request.headers);
    const { photoId } = await context.params;
    return Response.json({ data: await deleteReceiptPhoto(actor, photoId) });
  } catch (error) {
    return receiptPhotoErrorResponse(error);
  }
}
