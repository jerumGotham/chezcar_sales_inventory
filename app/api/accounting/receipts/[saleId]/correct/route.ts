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
 * The branch putting right the sale it admitted encoding wrongly.
 *
 * Separate from /resolve because the two are different acts by different
 * people: that one is Accounting or an Admin settling a dispute, this one is
 * the branch correcting itself. The paper is right and only the keying was
 * wrong, so the sale is rewritten in place and keeps its receipt number --
 * asking the branch for a new one made it invent a number the receipt does not
 * carry. It goes back to Accounting unverified: a branch does not sign off its
 * own correction.
 */
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:mismatch:respond");
    const input = accountingResolutionSchema.parse(await request.json());
    const { saleId } = await context.params;
    return Response.json({
      data: await correctEncodedSale(actor, saleId, input, { byBranch: true }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
