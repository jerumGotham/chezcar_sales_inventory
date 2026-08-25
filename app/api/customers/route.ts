import { NextResponse } from "next/server";
import { customers } from "@/lib/mock-data";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";

export async function GET(request: Request) {
  try {
    await requireCapability(request.headers, "customers:view");
    return NextResponse.json({ data: customers });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
