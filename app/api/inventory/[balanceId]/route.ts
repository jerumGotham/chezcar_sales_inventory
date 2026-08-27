import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import {
  InventoryMutationError,
  inventoryUnitCostSchema,
  updateInventoryUnitCost,
} from "@/lib/server/catalog";

type Context = { params: Promise<{ balanceId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Invalid inventory input" } },
      { status: 400 },
    );
  }

  if (error instanceof InventoryMutationError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  try {
    return authorizationErrorResponse(error);
  } catch (unexpectedError) {
    console.error("Unable to update inventory", unexpectedError);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Unable to update inventory" } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "inventory:view");
    const { balanceId } = await context.params;
    const body = await request.json();
    const input = inventoryUnitCostSchema.parse(body);
    return Response.json({ data: await updateInventoryUnitCost(actor, balanceId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
