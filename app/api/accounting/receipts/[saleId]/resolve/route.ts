import { ZodError } from "zod";

import {
  assertAnyCapability,
  assertCapability,
  authorizationErrorResponse,
  requireActiveUser,
} from "@/lib/server/authorization";
import { accountingResolutionSchema, CustomerSalesError, resolveSale } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid resolution input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireActiveUser(request.headers);
    assertAnyCapability(actor, ["sales:resolve", "sales:void-replace"]);
    const rawInput: unknown = await request.json();
    if (rawInput && typeof rawInput === "object" && "action" in rawInput) {
      const action = rawInput.action;
      if (action === "VOIDED_REPLACED" || action === "VOIDED" || action === "CONFIRMED_CORRECT") {
        assertCapability(actor, action === "CONFIRMED_CORRECT" ? "sales:resolve" : "sales:void-replace");
      }
    }
    const input = accountingResolutionSchema.parse(rawInput);
    const { saleId } = await context.params;
    return Response.json({ data: await resolveSale(actor, saleId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
