import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireUser,
} from "@/lib/server/authorization";
import { listProducts, productListQuerySchema } from "@/lib/server/catalog";

export async function GET(request: Request) {
  try {
    await requireUser(request.headers, ["ADMIN", "STOCK_STAFF"]);
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
