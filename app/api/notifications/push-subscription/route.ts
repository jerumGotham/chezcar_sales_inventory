import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { deletePushSubscription, savePushSubscription } from "@/lib/server/services/push-notifications";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid push subscription" } }, { status: 400 });
  return authorizationErrorResponse(error);
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "dashboard:view");
    const subscription = await savePushSubscription(actor, await request.json(), request.headers.get("user-agent"));
    return Response.json({ data: { id: subscription.id, enabled: subscription.isActive } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "dashboard:view");
    await deletePushSubscription(actor, await request.json());
    return Response.json({ data: { enabled: false } });
  } catch (error) {
    return errorResponse(error);
  }
}
