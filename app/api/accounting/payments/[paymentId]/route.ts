import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { deleteVoidedPayment, paymentsErrorResponse } from "@/lib/server/services/payments";

type Context = { params: Promise<{ paymentId: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "payments:delete-voided");
    const { paymentId } = await context.params;
    return Response.json({ data: await deleteVoidedPayment(actor, paymentId) });
  } catch (error) {
    return (
      paymentsErrorResponse(error, "DELETE /api/accounting/payments/[paymentId]") ??
      authorizationErrorResponse(error)
    );
  }
}
