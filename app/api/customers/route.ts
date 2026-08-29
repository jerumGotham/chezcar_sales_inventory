import { ZodError } from "zod";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { createCustomer, customerListQuerySchema, customerMutationSchema, CustomerSalesError, listCustomers } from "../../../lib/server/services/customer-sales";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid customer input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customers:view");
    return Response.json({ data: await listCustomers(actor, customerListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customers:create");
    const input = customerMutationSchema.parse(await request.json());
    return Response.json({ data: await createCustomer(actor, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
