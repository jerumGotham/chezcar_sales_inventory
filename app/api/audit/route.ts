import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { getAuditTrail } from "@/lib/server/services/audit";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "audit:view");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json({ data: await getAuditTrail(actor, query) });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid audit filters" } }, { status: 400 });
    }
    return authorizationErrorResponse(error);
  }
}
