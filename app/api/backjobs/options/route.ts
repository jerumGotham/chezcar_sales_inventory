import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { BackjobError, listBackjobOptions } from "@/lib/server/services/backjobs";

export async function GET(request: Request) {
  try {
    return Response.json({ data: await listBackjobOptions(await requireCapability(request.headers, "backjobs:create")) });
  } catch (error) {
    if (error instanceof BackjobError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Backjob options failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to load Backjob options" } }, { status: 500 }); }
  }
}
