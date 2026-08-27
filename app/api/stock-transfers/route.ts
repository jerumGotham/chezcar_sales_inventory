import { z, ZodError } from "zod";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { createTransferSchema } from "@/lib/contracts/stock-transfers";
import { TransferError, createTransfer, listTransfers } from "@/lib/server/services/stock-transfers";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid transfer input" } }, { status: 400 });
  if (error instanceof TransferError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Stock transfer request failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to process stock transfer" } }, { status: 500 }); }
}
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  transferId: z.string().trim().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "stock-transfers:view");
    const searchParams = new URL(request.url).searchParams;
    const query = listQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      transferId: searchParams.get("transferId") ?? undefined,
    });
    return Response.json(await listTransfers(actor, query));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) { try { const actor = await requireCapability(request.headers, "stock-transfers:view"); return Response.json({ data: await createTransfer(actor, createTransferSchema.parse(await request.json())) }, { status: 201 }); } catch (error) { return errorResponse(error); } }
