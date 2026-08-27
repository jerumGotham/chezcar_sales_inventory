import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { accountingReviewSchema, CustomerSalesError, reviewSale } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid review input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:verify");
    if (actor.role !== "ACCOUNTING_STAFF") return Response.json({ error: { code: "FORBIDDEN", message: "Only Accounting Staff can submit receipt reviews" } }, { status: 403 });
    const { saleId } = await context.params;
    return Response.json({ data: await reviewSale(actor, saleId, accountingReviewSchema.parse(await request.json())) });
  } catch (error) {
    return errorResponse(error);
  }
}
