import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { CustomerSalesError } from "@/lib/server/services/customer-sales";
import { readReceiptEvidence, saveReceiptEvidence } from "@/lib/server/services/receipt-evidence";

type Context = { params: Promise<{ saleId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    // Accounting reviewers and Admin resolvers both attach receipt evidence.
    await requireCapability(request.headers, "sales:verify:view");
    const { saleId } = await context.params;
    const review = await prisma.saleAccountingReview.findUnique({ where: { saleId }, select: { id: true } });
    if (!review) throw new CustomerSalesError("NOT_FOUND", "Accounting review not found", 404);
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new CustomerSalesError("INVALID_INPUT", "Receipt photo is required", 400);
    const evidence = await saveReceiptEvidence(file);
    await prisma.saleAccountingReview.update({ where: { id: review.id }, data: { receiptPhotoKey: evidence.key, receiptPhotoType: evidence.contentType } });
    return Response.json({ data: evidence });
  } catch (error) {
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof Error && error.message.startsWith("Receipt evidence")) return Response.json({ error: { code: "INVALID_INPUT", message: error.message } }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}

export async function GET(request: Request, context: Context) {
  try {
    await requireCapability(request.headers, "sales:verify:view");
    const { saleId } = await context.params;
    const review = await prisma.saleAccountingReview.findUnique({ where: { saleId }, select: { receiptPhotoKey: true } });
    if (!review?.receiptPhotoKey) return new Response("Not found", { status: 404 });
    const evidence = await readReceiptEvidence(review.receiptPhotoKey);
    return new Response(evidence.body, { headers: { "Content-Type": evidence.contentType, "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Response("Not found", { status: 404 });
    return authorizationErrorResponse(error);
  }
}
