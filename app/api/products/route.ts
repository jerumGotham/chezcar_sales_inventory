import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { createProduct, listProducts, ProductMutationError, productListQuerySchema, productMutationSchema } from "@/lib/server/catalog";

function productErrorResponse(error: unknown) {
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

export async function GET(request: Request) {
  try {
    await requireCapability(request.headers, "products:view");
    const query = productListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );

    return Response.json(await listProducts(query));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: { code: "INVALID_QUERY", message: "Invalid product filters" } },
        { status: 400 },
      );
    }

    try {
      return authorizationErrorResponse(error);
    } catch (unexpectedError) {
      console.error("Unable to list products", unexpectedError);
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Unable to load products" } },
        { status: 500 },
      );
    }
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "products:view");
    const input = productMutationSchema.parse(await request.json());
    return Response.json({ data: await createProduct(actor, input) }, { status: 201 });
  } catch (error) {
    return productErrorResponse(error);
  }
}
