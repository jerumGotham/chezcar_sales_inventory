import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import {
  branchMismatchResponseSchema,
  CustomerSalesError,
  respondToSaleMismatch,
} from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid branch mismatch response" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:mismatch:respond");
    const { saleId } = await context.params;
    const input = branchMismatchResponseSchema.parse(await request.json());
    return Response.json({ data: await respondToSaleMismatch(actor, saleId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
