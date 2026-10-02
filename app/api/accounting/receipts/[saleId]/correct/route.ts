import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { accountingResolutionSchema, CustomerSalesError, resolveSale } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid correction input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

/**
 * The branch putting right the sale it admitted encoding wrongly.
 *
 * Separate from /resolve because the two are different acts by different
 * people: that one is Accounting or an Admin settling a dispute, this one is
 * the branch correcting itself. The service performs the same void and replace
 * either way, and leaves the corrected receipt unverified for Accounting.
 */
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:mismatch:respond");
    const input = accountingResolutionSchema.parse(await request.json());
    const { saleId } = await context.params;
    return Response.json({
      data: await resolveSale(actor, saleId, input, { branchCorrection: true }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
