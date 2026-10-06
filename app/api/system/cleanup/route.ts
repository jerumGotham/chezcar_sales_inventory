import { z } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CLEANUP_TASKS, runCleanup, scanCleanup } from "@/lib/server/services/system-cleanup";

export const dynamic = "force-dynamic";

const cleanupSchema = z.object({ tasks: z.array(z.enum(CLEANUP_TASKS)).min(1, "Choose something to clean up") });

/** What could be cleared right now, with how much each would free. Reads only. */
export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "system:monitor");
    return Response.json({ data: await scanCleanup(actor) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}

/** Clears the chosen tasks, each re-read on the server at the moment it runs. */
export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "system:cleanup");
    const input = cleanupSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return Response.json({ error: { code: "INVALID_INPUT", message: input.error.issues[0]?.message ?? "Invalid input" } }, { status: 400 });
    }
    return Response.json({ data: await runCleanup(actor, input.data.tasks) });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
