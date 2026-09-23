import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import {
  changeSaleSalesperson,
  CustomerSalesError,
  saleSalespersonSchema,
} from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid salesperson" } },
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

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:salesperson:update");
    const input = saleSalespersonSchema.parse(await request.json());
    const { saleId } = await context.params;
    return Response.json({ data: await changeSaleSalesperson(actor, saleId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
