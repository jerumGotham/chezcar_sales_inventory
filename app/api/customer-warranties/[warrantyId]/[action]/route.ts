import { ZodError } from "zod";

import { warrantyActionSchema } from "@/lib/contracts/customer-warranties";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import type { Capability } from "@/lib/server/policy/access";
import { actOnCustomerWarranty, CustomerWarrantyError } from "@/lib/server/services/customer-warranties";

type Context = { params: Promise<{ warrantyId: string; action: string }> };
const capabilities = {
  "receive-quarantine": "customer-warranties:receive-quarantine",
  "approve-repair": "customer-warranties:approve",
  "approve-replacement": "customer-warranties:approve",
  "waiting-stock": "customer-warranties:approve",
  "mark-ready": "customer-warranties:approve",
  release: "customer-warranties:release",
  complete: "customer-warranties:complete",
  reject: "customer-warranties:complete",
  cancel: "customer-warranties:complete",
} as const;

export async function POST(request: Request, context: Context) {
  try {
    const { warrantyId, action } = await context.params;
    if (!(action in capabilities)) throw new CustomerWarrantyError("NOT_FOUND", "Unknown warranty action", 404);
    const typedAction = action as keyof typeof capabilities;
    const actor = await requireCapability(request.headers, capabilities[typedAction] as Capability);
    return Response.json({ data: await actOnCustomerWarranty(actor, warrantyId, typedAction, warrantyActionSchema.parse(await request.json())) });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid action input" } }, { status: 400 });
    if (error instanceof CustomerWarrantyError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Warranty action failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to update warranty" } }, { status: 500 }); }
  }
}
