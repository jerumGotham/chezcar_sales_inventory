import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import {
  correctInventoryBalance,
  inventoryCorrectionSchema,
  InventoryMutationError,
} from "@/lib/server/catalog";

type Context = { params: Promise<{ balanceId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Invalid adjustment input" } },
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
    console.error("Unable to adjust inventory", unexpectedError);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Unable to adjust inventory" } },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "inventory:adjust");
    const { balanceId } = await context.params;
    const input = inventoryCorrectionSchema.parse(await request.json());

    return Response.json({ data: await correctInventoryBalance(actor, balanceId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
