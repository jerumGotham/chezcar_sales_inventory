import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import {
  branchPriceSchema,
  InventoryMutationError,
  setBranchPrice,
} from "@/lib/server/catalog";

type Context = { params: Promise<{ balanceId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Enter a price greater than zero" } },
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
    console.error("Unable to set the branch price", unexpectedError);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Unable to set the branch price" } },
      { status: 500 },
    );
  }
}

/** A price of null clears the branch's own price and returns it to the product's. */
export async function PUT(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "inventory:price:update");
    const { balanceId } = await context.params;
    const input = branchPriceSchema.parse(await request.json());
    return Response.json({ data: await setBranchPrice(actor, balanceId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
