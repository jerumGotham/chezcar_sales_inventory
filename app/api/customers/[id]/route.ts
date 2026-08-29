import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { customerMutationSchema, CustomerSalesError, deactivateCustomer, getCustomerHistory, updateCustomer } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid customer input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customers:update");
    const { id } = await context.params;
    return Response.json({ data: await updateCustomer(actor, id, customerMutationSchema.parse(await request.json())) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customers:view");
    const { id } = await context.params;
    return Response.json({ data: await getCustomerHistory(actor, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customers:deactivate");
    const { id } = await context.params;
    return Response.json({ data: await deactivateCustomer(actor, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
