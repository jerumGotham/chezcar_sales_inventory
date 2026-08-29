import { ZodError } from "zod";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { createCustomerOrder, customerOrderMutationSchema, CustomerSalesError, listCustomerOrders } from "../../../lib/server/services/customer-sales";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid customer order input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:view");
    return Response.json({ data: await listCustomerOrders(actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:create");
    const input = customerOrderMutationSchema.parse(await request.json());
    return Response.json({ data: await createCustomerOrder(actor, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
