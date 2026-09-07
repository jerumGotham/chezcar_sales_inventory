import { ZodError } from "zod";

import {
  backjobVersionSchema,
  completeBackjobSchema,
  coverageBackjobSchema,
  issueBackjobPartSchema,
  planBackjobPartsSchema,
  reasonBackjobSchema,
  reconcileBackjobPartSchema,
  returnBackjobPartSchema,
  scheduleBackjobSchema,
} from "@/lib/contracts/backjobs";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import type { CapabilityId } from "@/lib/contracts/roles";
import {
  BackjobError,
  cancelBackjob,
  completeBackjob,
  issueBackjobPart,
  planBackjobParts,
  reconcileBackjobPart,
  rejectBackjob,
  returnBackjobPart,
  scheduleBackjob,
  setBackjobCoverage,
  startBackjob,
} from "@/lib/server/services/backjobs";

type Context = { params: Promise<{ backjobId: string; action: string }> };
const ACTIONS = ["schedule", "start", "cancel", "reject", "coverage", "plan-parts", "issue-part", "reconcile-part", "return-part", "complete"] as const;
type Action = typeof ACTIONS[number];
const ACTION_CAPABILITIES: Record<Action, CapabilityId> = {
  schedule: "backjobs:schedule",
  start: "backjobs:update",
  cancel: "backjobs:update",
  reject: "backjobs:update",
  coverage: "backjobs:update",
  "plan-parts": "backjobs:update",
  "issue-part": "backjobs:parts:issue",
  "reconcile-part": "backjobs:update",
  "return-part": "backjobs:parts:return",
  complete: "backjobs:complete",
};

function isAction(value: string): value is Action { return ACTIONS.includes(value as Action); }
function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid Backjob action input" } }, { status: 400 });
  if (error instanceof BackjobError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Backjob action failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to update Backjob" } }, { status: 500 }); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { backjobId, action } = await context.params;
    if (!isAction(action)) throw new BackjobError("NOT_FOUND", "Unknown Backjob action", 404);
    const actor = await requireCapability(request.headers, ACTION_CAPABILITIES[action]);
    const body: unknown = await request.json();
    if (action === "schedule") return Response.json({ data: await scheduleBackjob(actor, backjobId, scheduleBackjobSchema.parse(body)) });
    if (action === "start") return Response.json({ data: await startBackjob(actor, backjobId, backjobVersionSchema.parse(body).version) });
    if (action === "cancel") { const input = reasonBackjobSchema.parse(body); return Response.json({ data: await cancelBackjob(actor, backjobId, input.version, input.reason) }); }
    if (action === "reject") { const input = reasonBackjobSchema.parse(body); return Response.json({ data: await rejectBackjob(actor, backjobId, input.version, input.reason) }); }
    if (action === "coverage") return Response.json({ data: await setBackjobCoverage(actor, backjobId, coverageBackjobSchema.parse(body)) });
    if (action === "plan-parts") return Response.json({ data: await planBackjobParts(actor, backjobId, planBackjobPartsSchema.parse(body)) });
    if (action === "issue-part") return Response.json({ data: await issueBackjobPart(actor, backjobId, issueBackjobPartSchema.parse(body)) });
    if (action === "reconcile-part") return Response.json({ data: await reconcileBackjobPart(actor, backjobId, reconcileBackjobPartSchema.parse(body)) });
    if (action === "return-part") return Response.json({ data: await returnBackjobPart(actor, backjobId, returnBackjobPartSchema.parse(body)) });
    return Response.json({ data: await completeBackjob(actor, backjobId, completeBackjobSchema.parse(body)) });
  } catch (error) { return errorResponse(error); }
}
