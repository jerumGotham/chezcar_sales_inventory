import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { createDirectSale, CustomerSalesError, directSaleSchema, listSales } from "../../../lib/server/services/customer-sales";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid sale input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:view");
    return Response.json({ data: await listSales(actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:view");
    return Response.json({ data: await createDirectSale(actor, directSaleSchema.parse(await request.json())) });
  } catch (error) {
    return errorResponse(error);
  }
}
