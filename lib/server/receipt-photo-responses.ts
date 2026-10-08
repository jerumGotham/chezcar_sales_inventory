import "server-only";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { addReceiptPhotos, ReceiptPhotoError, type ReceiptPhotoOwner } from "@/lib/server/services/receipt-photos";
import type { CapabilityId } from "@/lib/contracts/roles";

export function receiptPhotoErrorResponse(error: unknown) {
  if (error instanceof ReceiptPhotoError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Response("Not found", { status: 404 });
  return authorizationErrorResponse(error);
}

/** Shared by the three upload routes: multipart `photos`, one or more files. */
export async function handleReceiptPhotoUpload(request: Request, capability: CapabilityId, owner: ReceiptPhotoOwner) {
  try {
    const actor = await requireCapability(request.headers, capability);
    const form = await request.formData();
    const files = form.getAll("photos").filter((value): value is File => value instanceof File);
    return Response.json({ data: await addReceiptPhotos(actor, owner, files) });
  } catch (error) {
    return receiptPhotoErrorResponse(error);
  }
}
