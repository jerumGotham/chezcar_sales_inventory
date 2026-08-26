import { NextResponse } from "next/server";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { listNotifications } from "../../../lib/server/services/notifications";
import { getDashboardSummary } from "../../../lib/server/services/customer-sales";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "dashboard:view");
    const persistedNotifications = await listNotifications(actor);
    const summary = await getDashboardSummary(actor);
    return NextResponse.json({
      summary,
      notifications: persistedNotifications.slice(0, 10),
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
