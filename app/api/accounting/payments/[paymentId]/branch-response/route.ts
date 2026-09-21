import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { paymentBranchResponseSchema, paymentsErrorResponse, respondToPaymentMismatch } from "@/lib/server/services/payments";

type Context = { params: Promise<{ paymentId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:mismatch:respond");
    const { paymentId } = await context.params;
    return Response.json({ data: await respondToPaymentMismatch(actor, paymentId, paymentBranchResponseSchema.parse(await request.json())) });
  } catch (error) {
    return paymentsErrorResponse(error, "POST /api/accounting/payments/[paymentId]/branch-response") ?? authorizationErrorResponse(error);
  }
}
