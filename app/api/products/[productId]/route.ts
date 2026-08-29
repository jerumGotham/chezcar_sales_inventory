import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { deleteProduct, ProductMutationError, productMutationSchema, updateProduct } from "@/lib/server/catalog";

type Context = { params: Promise<{ productId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Invalid product input" } },
      { status: 400 },
    );
  }

  if (error instanceof ProductMutationError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  try {
    return authorizationErrorResponse(error);
  } catch (unexpectedError) {
    console.error("Unable to process product", unexpectedError);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Unable to process product" } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "products:update");
    const { productId } = await context.params;
    const input = productMutationSchema.parse(await request.json());
    return Response.json({ data: await updateProduct(actor, productId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "products:delete");
    const { productId } = await context.params;
    return Response.json({ data: await deleteProduct(actor, productId) });
  } catch (error) {
    return errorResponse(error);
  }
}
