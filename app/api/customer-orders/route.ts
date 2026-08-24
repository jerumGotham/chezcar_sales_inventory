import { NextResponse } from "next/server";
import { orders } from "@/lib/mock-data";
import {
  AUTHENTICATED_ROLES,
  authorizationErrorResponse,
  requireUser,
} from "@/lib/server/authorization";

export async function GET(request: Request) {
  try {
    await requireUser(request.headers, AUTHENTICATED_ROLES);
    return NextResponse.json({ data: orders });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
