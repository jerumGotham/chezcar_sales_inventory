import { authorizationErrorResponse, requireAnyCapability } from "@/lib/server/authorization";
import { paymentResolutionSchema, paymentsErrorResponse, resolvePaymentMismatch } from "@/lib/server/services/payments";

type Context = { params: Promise<{ paymentId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    // Confirming and voiding are separate grants; the service re-checks the one
    // that matches the action the reviewer chose.
    const actor = await requireAnyCapability(request.headers, ["sales:resolve", "sales:void-replace"]);
    const { paymentId } = await context.params;
    return Response.json({ data: await resolvePaymentMismatch(actor, paymentId, paymentResolutionSchema.parse(await request.json())) });
  } catch (error) {
    return paymentsErrorResponse(error, "POST /api/accounting/payments/[paymentId]/resolve") ?? authorizationErrorResponse(error);
  }
}
