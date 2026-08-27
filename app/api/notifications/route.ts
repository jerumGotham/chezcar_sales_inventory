import { NextResponse } from "next/server";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { listNotifications, listNotificationsAfter, markAllNotificationsRead } from "../../../lib/server/services/notifications";

function parseAfterCursor(request: Request) {
  const after = new URL(request.url).searchParams.get("after");
  if (!after) return null;
  if (!/^\d{1,20}$/.test(after)) return BigInt(0);
  return BigInt(after);
}

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "dashboard:view");
    const after = parseAfterCursor(request);
    return NextResponse.json({
      data: after === null ? await listNotifications(actor) : await listNotificationsAfter(actor, after),
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "dashboard:view");
    return NextResponse.json({ data: await markAllNotificationsRead(actor) });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
