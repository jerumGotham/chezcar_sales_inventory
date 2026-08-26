import { NextResponse } from "next/server";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { listNotifications, markAllNotificationsRead } from "../../../lib/server/services/notifications";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "dashboard:view");
    return NextResponse.json({
      data: await listNotifications(actor),
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
