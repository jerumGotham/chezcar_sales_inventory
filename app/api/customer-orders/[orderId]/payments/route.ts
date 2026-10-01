import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { listOrderPaymentHistory, RefundError } from "@/lib/server/services/refunds";

type Context = { params: Promise<{ orderId: string }> };

/** Every receipt collected on an order, for the cancellation dialog. */
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:view");
    const { orderId } = await context.params;
    return Response.json({ data: await listOrderPaymentHistory(actor, orderId) });
  } catch (error) {
    if (error instanceof RefundError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return authorizationErrorResponse(error);
  }
}
