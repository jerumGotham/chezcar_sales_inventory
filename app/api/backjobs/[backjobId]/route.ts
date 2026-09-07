import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { BackjobError, getBackjob } from "@/lib/server/services/backjobs";

type Context = { params: Promise<{ backjobId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { backjobId } = await context.params;
    return Response.json({ data: await getBackjob(await requireCapability(request.headers, "backjobs:view"), backjobId) });
  } catch (error) {
    if (error instanceof BackjobError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Backjob detail failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to load Backjob" } }, { status: 500 }); }
  }
}
