import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CustomerSalesError, voidVerifiedSale, voidVerifiedSaleSchema } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

/** Undoes a verified direct sale: stock back to the branch, payment voided. */
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:void-verified");
    const input = voidVerifiedSaleSchema.parse(await request.json());
    const { saleId } = await context.params;
    return Response.json({ data: await voidVerifiedSale(actor, saleId, input) });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid input" } }, { status: 400 });
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return authorizationErrorResponse(error);
  }
}
