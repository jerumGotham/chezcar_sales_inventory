import { NextResponse } from "next/server";
import { dashboardStats, lowStock, notifications, orders } from "@/lib/mock-data";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";

export async function GET(request: Request) {
  try {
    await requireCapability(request.headers, "dashboard:view");
    return NextResponse.json({
      stats: dashboardStats,
      lowStock,
      notifications,
      orders,
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
