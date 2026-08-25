import { NextResponse } from "next/server";
import { orders } from "@/lib/mock-data";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";

export async function GET(request: Request) {
  try {
    await requireCapability(request.headers, "customer-orders:view");
    return NextResponse.json({ data: orders });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
