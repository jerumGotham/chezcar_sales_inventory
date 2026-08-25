import { ZodError } from "zod";

import { createStockReceiptSchema } from "@/lib/contracts/stock-receipts";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { createStockReceipt, listStockReceipts, StockReceiptError } from "@/lib/server/services/stock-receipts";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid supplier receipt input" } }, { status: 400 });
  }
  if (error instanceof StockReceiptError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  try {
    return authorizationErrorResponse(error);
  } catch (unexpected) {
    console.error("Stock receipt request failed", unexpected);
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to process supplier receipt" } }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    return Response.json({ data: await listStockReceipts(await requireCapability(request.headers, "inventory:view")) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "inventory-receiving:create");
    return Response.json({ data: await createStockReceipt(actor, createStockReceiptSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
