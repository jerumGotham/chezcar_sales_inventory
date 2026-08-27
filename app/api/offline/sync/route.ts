import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { OfflineSalesError, syncOfflineSale } from "@/lib/server/services/offline-sales";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid offline sync input" } }, { status: 400 });
  if (error instanceof OfflineSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "sales:post");
    return Response.json({ data: await syncOfflineSale(actor, await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}
