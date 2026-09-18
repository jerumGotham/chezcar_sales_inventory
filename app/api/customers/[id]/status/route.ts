import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CustomerSalesError, customerStatusSchema, setCustomerStatus } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customers:deactivate");
    const { id } = await context.params;
    const { status } = customerStatusSchema.parse(await request.json());
    return Response.json({ data: await setCustomerStatus(actor, id, status) });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid customer status" } }, { status: 400 });
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return authorizationErrorResponse(error);
  }
}
