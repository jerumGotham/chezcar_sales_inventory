import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { listNotifications } from "../../../lib/server/services/notifications";
import {
  CustomerSalesError,
  getDashboardSummary,
} from "../../../lib/server/services/customer-sales";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "dashboard:view");
    const filters = Object.fromEntries(new URL(request.url).searchParams.entries());
    const persistedNotifications = await listNotifications(actor);
    const summary = await getDashboardSummary(actor, filters);
    return NextResponse.json({
      summary,
      notifications: persistedNotifications.slice(0, 5),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: {
            code: "INVALID_FILTERS",
            message: "One or more dashboard filters are invalid",
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof CustomerSalesError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return authorizationErrorResponse(error);
  }
}
