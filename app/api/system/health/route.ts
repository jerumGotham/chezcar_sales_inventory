import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { getSystemHealth } from "@/lib/server/services/system-console";
import { describeError, recordSystemLog } from "@/lib/server/services/system-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "system:monitor");
    return Response.json({ data: await getSystemHealth(actor) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = authorizationErrorResponse(error);
    if (response) return response;
    const { message, detail } = describeError(error);
    await recordSystemLog({ level: "ERROR", source: "GET /api/system/health", message, detail });
    return Response.json({ error: { code: "SERVER_ERROR", message: "Unable to read system health" } }, { status: 500 });
  }
}
