import { NextResponse } from "next/server";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { pushPublicKey } from "@/lib/server/services/push-notifications";

export async function GET(request: Request) {
  try {
    await requireCapability(request.headers, "notifications:push");
    const publicKey = pushPublicKey();
    return NextResponse.json({ data: { enabled: Boolean(publicKey), publicKey } });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
