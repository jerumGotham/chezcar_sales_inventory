import { ZodError } from "zod";

import type { CapabilityId } from "@/lib/contracts/roles";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { cancelCustomerOrder, cancelOrderSchema, CustomerSalesError, orderPaymentSchema, recordCustomerOrderPayment, releaseCustomerOrder, releaseOrderSchema, reserveCustomerOrder } from "../../../../../lib/server/services/customer-sales";

type Context = { params: Promise<{ orderId: string; action: string }> };

const ACTION_CAPABILITIES = {
  release: "customer-orders:release",
  cancel: "customer-orders:cancel",
  payment: "customer-orders:record-payment",
  reserve: "customer-orders:reserve",
} as const satisfies Record<string, CapabilityId>;

function isOrderAction(action: string): action is keyof typeof ACTION_CAPABILITIES {
  return action in ACTION_CAPABILITIES;
}

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid order action input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const { orderId, action } = await context.params;
    if (!isOrderAction(action)) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Unknown order action" } }, { status: 404 });
    }
    const actor = await requireCapability(request.headers, ACTION_CAPABILITIES[action]);
    if (action === "release") return Response.json({ data: await releaseCustomerOrder(actor, orderId, releaseOrderSchema.parse(await request.json())) });
    if (action === "cancel") return Response.json({ data: await cancelCustomerOrder(actor, orderId, cancelOrderSchema.parse(await request.json())) });
    if (action === "payment") return Response.json({ data: await recordCustomerOrderPayment(actor, orderId, orderPaymentSchema.parse(await request.json())) });
    return Response.json({ data: await reserveCustomerOrder(actor, orderId) });
  } catch (error) {
    return errorResponse(error);
  }
}
