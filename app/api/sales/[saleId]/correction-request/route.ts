import { ZodError } from "zod";

import {
  branchSaleCorrectionRequestSchema,
  saleCorrectionResolutionSchema,
} from "@/lib/contracts/sales";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import {
  CustomerSalesError,
  reportSaleCorrection,
  resolveSaleCorrection,
} from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid correction request" } },
      { status: 400 },
    );
  }
  if (error instanceof CustomerSalesError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return authorizationErrorResponse(error);
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:correction:request");
    const input = branchSaleCorrectionRequestSchema.parse(await request.json());
    const { saleId } = await context.params;
    return Response.json({ data: await reportSaleCorrection(actor, saleId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:void-replace");
    const input = saleCorrectionResolutionSchema.parse(await request.json());
    const { saleId } = await context.params;
    return Response.json({ data: await resolveSaleCorrection(actor, saleId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
