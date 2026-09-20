import {
  authorizationErrorResponse,
  requireAnyCapability,
} from "@/lib/server/authorization";
import {
  listTransferProductOptions,
  TransferError,
} from "@/lib/server/services/stock-transfers";

export async function GET(request: Request) {
  try {
    const actor = await requireAnyCapability(request.headers, [
      "stock-transfers:create",
      "stock-transfers:update",
    ]);

    const sourceId = new URL(request.url).searchParams.get("sourceId") ?? undefined;
    return Response.json(
      { data: await listTransferProductOptions(actor, sourceId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof TransferError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    try {
      return authorizationErrorResponse(error);
    } catch (unexpected) {
      console.error("Stock transfer options request failed", unexpected);
      return Response.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to load transfer product options",
          },
        },
        { status: 500 },
      );
    }
  }
}
