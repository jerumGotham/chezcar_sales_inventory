import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { accountingResolutionSchema, correctEncodedSale, CustomerSalesError } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  // The first issue, not a blanket "invalid": the reader has to know which
  // field is wrong to fix it.
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid correction input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

/**
 * Accounting putting the encoding right itself, against the paper in hand.
 *
 * Separate from /correct, which is the branch answering for its own keying,
 * and from /resolve, which settles a dispute after the branch has replied.
 * Here there is nothing to ask: the receipt is right and the sale was keyed
 * wrong, so sending it back to the branch would only delay the fix. The sale
 * is corrected in place, keeping the number printed on the paper, and comes
 * out verified -- which is why the service demands the grant to rewrite a sale
 * and the grant to verify one, not just the first.
 */
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:void-replace");
    const input = accountingResolutionSchema.parse(await request.json());
    const { saleId } = await context.params;
    return Response.json({ data: await correctEncodedSale(actor, saleId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
