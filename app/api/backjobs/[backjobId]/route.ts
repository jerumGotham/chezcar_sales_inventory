import { ZodError } from "zod";

import { backjobVersionSchema } from "@/lib/contracts/backjobs";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { BackjobError, deleteDraftBackjob, getBackjob } from "@/lib/server/services/backjobs";

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

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "backjobs:delete");
    const { backjobId } = await context.params;
    const input = backjobVersionSchema.parse(await request.json());
    return Response.json({ data: await deleteDraftBackjob(actor, backjobId, input.version) });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "INVALID_INPUT", message: "A positive integer Backjob version is required" } }, { status: 400 });
    if (error instanceof BackjobError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Backjob deletion failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to delete Backjob" } }, { status: 500 }); }
  }
}
