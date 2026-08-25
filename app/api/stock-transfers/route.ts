import { ZodError } from "zod";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { createTransferSchema } from "@/lib/contracts/stock-transfers";
import { TransferError, createTransfer, listTransfers } from "@/lib/server/services/stock-transfers";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid transfer input" } }, { status: 400 });
  if (error instanceof TransferError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Stock transfer request failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to process stock transfer" } }, { status: 500 }); }
}
export async function GET(request: Request) { try { return Response.json({ data: await listTransfers(await requireCapability(request.headers, "stock-transfers:view")) }); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) { try { const actor = await requireCapability(request.headers, "stock-transfers:view"); return Response.json({ data: await createTransfer(actor, createTransferSchema.parse(await request.json())) }, { status: 201 }); } catch (error) { return errorResponse(error); } }
