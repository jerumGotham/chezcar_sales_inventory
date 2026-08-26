import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CustomerSalesError, getSaleById } from "../../../../lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid sale input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:view");
    const { saleId } = await context.params;
    return Response.json({ data: await getSaleById(actor, saleId) });
  } catch (error) {
    return errorResponse(error);
  }
}
