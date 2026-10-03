import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CustomerSalesError } from "@/lib/server/services/customer-sales";
import { notifyPaymentEvidencePending } from "@/lib/server/services/receipt-evidence-notifications";

type Context = { params: Promise<{ paymentId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    // Whoever confirms receipts is who notices the photo is missing.
    const actor = await requireCapability(request.headers, "sales:verify");
    const { paymentId } = await context.params;
    return Response.json({ data: await notifyPaymentEvidencePending(actor, paymentId) });
  } catch (error) {
    if (error instanceof CustomerSalesError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return authorizationErrorResponse(error);
  }
}
