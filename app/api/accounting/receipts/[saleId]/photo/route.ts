import {
  AuthorizationError,
  authorizationErrorResponse,
  requireCapability,
  type AuthContext,
} from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { CustomerSalesError } from "@/lib/server/services/customer-sales";
import { canAccessLocation } from "@/lib/server/policy/access";
import {
  readReceiptEvidence,
  removeReceiptEvidence,
  saveReceiptEvidence,
} from "@/lib/server/services/receipt-evidence";
import { notifyReceiptEvidenceUploaded } from "@/lib/server/services/receipt-evidence-notifications";

type Context = { params: Promise<{ saleId: string }> };

async function assertEvidenceScope(actor: AuthContext, saleId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { locationId: true },
  });
  if (!sale) throw new CustomerSalesError("NOT_FOUND", "Sale not found", 404);
  if (!canAccessLocation(actor, sale.locationId)) {
    throw new AuthorizationError("Insufficient permissions");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:upload");
    const { saleId } = await context.params;
    await assertEvidenceScope(actor, saleId);
    const review = await prisma.saleAccountingReview.findUnique({
      where: { saleId },
      select: { id: true, status: true, resolvedAt: true, receiptPhotoKey: true },
    });
    if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    if (review.status === "VERIFIED" || review.resolvedAt) {
      throw new CustomerSalesError("INVALID_STATE", "Receipt evidence cannot be changed after review", 409);
    }
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new CustomerSalesError("INVALID_INPUT", "Receipt photo is required", 400);
    const evidence = await saveReceiptEvidence(file);
    const updated = await prisma.saleAccountingReview.updateMany({
      where: {
        id: review.id,
        status: { not: "VERIFIED" },
        resolvedAt: null,
      },
      data: { receiptPhotoKey: evidence.key, receiptPhotoType: evidence.contentType },
    });
    if (updated.count !== 1) {
      await removeReceiptEvidence(evidence.key);
      throw new CustomerSalesError("INVALID_STATE", "Receipt evidence cannot be changed after review", 409);
    }
    if (review.receiptPhotoKey && review.receiptPhotoKey !== evidence.key) {
      await removeReceiptEvidence(review.receiptPhotoKey).catch(() => undefined);
    }
    await notifyReceiptEvidenceUploaded(saleId);
    return Response.json({ data: evidence });
  } catch (error) {
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof Error && error.message.startsWith("Receipt evidence")) return Response.json({ error: { code: "INVALID_INPUT", message: error.message } }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:view");
    const { saleId } = await context.params;
    await assertEvidenceScope(actor, saleId);
    const review = await prisma.saleAccountingReview.findUnique({ where: { saleId }, select: { receiptPhotoKey: true } });
    if (!review?.receiptPhotoKey) return new Response("Not found", { status: 404 });
    const evidence = await readReceiptEvidence(review.receiptPhotoKey);
    return new Response(evidence.body, { headers: { "Content-Type": evidence.contentType, "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Response("Not found", { status: 404 });
    return authorizationErrorResponse(error);
  }
}
