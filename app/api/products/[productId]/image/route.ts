import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import {
  ProductImageError,
  readProductImage,
  removeProductImage,
  uploadProductImage,
} from "@/lib/server/services/product-images";

type Context = { params: Promise<{ productId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ProductImageError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Product image not found" } },
      { status: 404 },
    );
  }
  try {
    return authorizationErrorResponse(error);
  } catch (unexpectedError) {
    console.error("Unable to process product image", unexpectedError);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Unable to process product image" } },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, context: Context) {
  try {
    await requireCapability(request.headers, "products:view");
    const { productId } = await context.params;
    const image = await readProductImage(productId);
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "products:view");
    const { productId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) {
      throw new ProductImageError("INVALID_IMAGE", "Product image is required");
    }
    return Response.json({ data: await uploadProductImage(actor, productId, file) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "products:view");
    const { productId } = await context.params;
    return Response.json({ data: await removeProductImage(actor, productId) });
  } catch (error) {
    return errorResponse(error);
  }
}
