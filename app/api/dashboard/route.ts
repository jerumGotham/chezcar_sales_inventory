import { NextResponse } from "next/server";
import { dashboardStats, lowStock, notifications, orders } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({
    stats: dashboardStats,
    lowStock,
    notifications,
    orders,
  });
}
