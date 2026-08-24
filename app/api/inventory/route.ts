import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireUser,
} from "@/lib/server/authorization";
import { inventoryListQuerySchema, listInventory } from "@/lib/server/catalog";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers, [
      "ADMIN",
      "STOCK_STAFF",
      "BRANCH_STAFF",
    ]);
    const query = inventoryListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );

    return Response.json(await listInventory(query, user));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: { code: "INVALID_QUERY", message: "Invalid inventory filters" } },
        { status: 400 },
      );
    }

    try {
      return authorizationErrorResponse(error);
    } catch (unexpectedError) {
      console.error("Unable to list inventory", unexpectedError);
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Unable to load inventory" } },
        { status: 500 },
      );
    }
  }
}
