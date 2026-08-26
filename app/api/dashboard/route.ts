import { NextResponse } from "next/server";
import { dashboardStats, lowStock, notifications, orders } from "@/lib/mock-data";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { listNotifications } from "@/lib/server/services/notifications";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "dashboard:view");
    const persistedNotifications = await listNotifications(actor);
    return NextResponse.json({
      stats: dashboardStats,
      lowStock,
      notifications: [...persistedNotifications.slice(0, 10), ...notifications],
      orders,
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
