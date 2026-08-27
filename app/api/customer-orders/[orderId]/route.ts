import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CustomerSalesError, getCustomerOrderById } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ orderId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:view");
    const { orderId } = await context.params;
    return Response.json({ data: await getCustomerOrderById(actor, orderId) });
  } catch (error) {
    return errorResponse(error);
  }
}
