import { NextResponse } from "next/server";
import { customers } from "@/lib/mock-data";
import {
  AUTHENTICATED_ROLES,
  authorizationErrorResponse,
  requireUser,
} from "@/lib/server/authorization";

export async function GET(request: Request) {
  try {
    await requireUser(request.headers, AUTHENTICATED_ROLES);
    return NextResponse.json({ data: customers });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
