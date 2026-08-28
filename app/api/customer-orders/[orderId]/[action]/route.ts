import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { cancelCustomerOrder, cancelOrderSchema, CustomerSalesError, orderPaymentSchema, recordCustomerOrderPayment, releaseCustomerOrder, releaseOrderSchema, reserveCustomerOrder } from "../../../../../lib/server/services/customer-sales";

type Context = { params: Promise<{ orderId: string; action: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid order action input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:view");
    const { orderId, action } = await context.params;
    if (action === "release") return Response.json({ data: await releaseCustomerOrder(actor, orderId, releaseOrderSchema.parse(await request.json())) });
    if (action === "cancel") return Response.json({ data: await cancelCustomerOrder(actor, orderId, cancelOrderSchema.parse(await request.json())) });
    if (action === "payment") return Response.json({ data: await recordCustomerOrderPayment(actor, orderId, orderPaymentSchema.parse(await request.json())) });
    if (action === "reserve") return Response.json({ data: await reserveCustomerOrder(actor, orderId) });
    return Response.json({ error: { code: "NOT_FOUND", message: "Unknown order action" } }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
