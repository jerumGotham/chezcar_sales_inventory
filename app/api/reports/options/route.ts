import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { getReportOptions, queryFromSearchParams } from "@/lib/server/services/reports";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "reports:view");
    const query = queryFromSearchParams(new URL(request.url).searchParams);
    return Response.json({ data: await getReportOptions(actor, query) }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: { code: "INVALID_FILTERS", message: error.issues[0]?.message ?? "Invalid report filters" } }, { status: 400, headers: NO_STORE });
    }
    const response = authorizationErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
