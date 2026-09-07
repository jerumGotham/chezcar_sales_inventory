import { authorizationErrorResponse, requireAnyCapability, requireCapability } from "@/lib/server/authorization";
import {
  customerOrderSalespersonSchema,
  CustomerSalesError,
  getCustomerOrderById,
  updateCustomerOrderSalesperson,
} from "@/lib/server/services/customer-sales";

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

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireAnyCapability(request.headers, ["customer-orders:create", "customer-orders:release"]);
    const { orderId } = await context.params;
    const input = customerOrderSalespersonSchema.parse(await request.json());
    return Response.json({ data: await updateCustomerOrderSalesperson(actor, orderId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
