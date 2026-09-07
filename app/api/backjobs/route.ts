import { ZodError } from "zod";

import { backjobListQuerySchema, createBackjobSchema } from "@/lib/contracts/backjobs";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { BackjobError, createBackjob, listBackjobs } from "@/lib/server/services/backjobs";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid Backjob input" } }, { status: 400 });
  if (error instanceof BackjobError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Backjob request failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to process Backjob request" } }, { status: 500 }); }
}

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "backjobs:view");
    const params = new URL(request.url).searchParams;
    const query = backjobListQuerySchema.parse({ page: params.get("page") ?? undefined, pageSize: params.get("pageSize") ?? undefined, search: params.get("search") ?? undefined, status: params.get("status") ?? undefined });
    return Response.json(await listBackjobs(actor, query));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "backjobs:create");
    return Response.json({ data: await createBackjob(actor, createBackjobSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
