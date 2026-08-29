import { NextResponse } from "next/server";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { markNotificationRead, NotificationError } from "../../../../../lib/server/services/notifications";

type Context = { params: Promise<{ notificationId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "notifications:mark-read");
    const { notificationId } = await context.params;
    return NextResponse.json({ data: await markNotificationRead(actor, notificationId) });
  } catch (error) {
    if (error instanceof NotificationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    return authorizationErrorResponse(error);
  }
}
