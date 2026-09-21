import { assertCapability, authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { paymentReviewSchema, paymentsErrorResponse, reviewPayment } from "@/lib/server/services/payments";

type Context = { params: Promise<{ paymentId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:verify");
    assertCapability(actor, "sales:evidence:view");
    const { paymentId } = await context.params;
    return Response.json({ data: await reviewPayment(actor, paymentId, paymentReviewSchema.parse(await request.json())) });
  } catch (error) {
    return paymentsErrorResponse(error, "POST /api/accounting/payments/[paymentId]/review") ?? authorizationErrorResponse(error);
  }
}
