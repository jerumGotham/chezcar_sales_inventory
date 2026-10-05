import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { describeError, listSystemLogs, recordSystemLog } from "@/lib/server/services/system-log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "system:monitor");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await listSystemLogs(actor, query), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = authorizationErrorResponse(error);
    if (response) return response;
    const { message, detail } = describeError(error);
    await recordSystemLog({ level: "ERROR", source: "GET /api/system/logs", message, detail });
    return Response.json({ error: { code: "SERVER_ERROR", message: "Unable to read the logs" } }, { status: 500 });
  }
}
