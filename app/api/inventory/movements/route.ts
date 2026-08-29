import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import {
  listInventoryMovements,
  parseInventoryMovementsQuery,
} from "@/lib/server/catalog";

export async function GET(request: Request) {
  try {
    const user = await requireCapability(request.headers, "inventory-movements:view");
    const query = parseInventoryMovementsQuery(new URL(request.url).searchParams);

    return Response.json(await listInventoryMovements(query, user));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: { code: "INVALID_QUERY", message: "Invalid movement filters" } },
        { status: 400 },
      );
    }

    try {
      return authorizationErrorResponse(error);
    } catch (unexpectedError) {
      console.error("Unable to list inventory movements", unexpectedError);
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Unable to load inventory movements" } },
        { status: 500 },
      );
    }
  }
}
