import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { saleRefundSchema } from "@/lib/contracts/refunds";
import { getSaleRefundable, refundPostedSale, RefundError } from "@/lib/server/services/refunds";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid refund input" } },
      { status: 400 },
    );
  }
  if (error instanceof RefundError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return authorizationErrorResponse(error);
}

/** What this sale still has left to give back, for the refund dialog. */
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:refund");
    const { saleId } = await context.params;
    return Response.json({ data: await getSaleRefundable(actor, saleId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:refund");
    const { saleId } = await context.params;
    const input = saleRefundSchema.parse(await request.json());
    return Response.json({ data: await refundPostedSale(actor, saleId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
