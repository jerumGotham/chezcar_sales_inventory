import { ZodError } from "zod";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { hasAllLocationAccess } from "@/lib/server/policy/access";
import { transferStatusLabel } from "@/lib/stock-transfer-status";
import { createTransferSchema, listTransfersQuerySchema } from "@/lib/contracts/stock-transfers";
import { TransferError, createTransfer, exportTransfers, listTransfers } from "@/lib/server/services/stock-transfers";
import { exportIdentity, pdfResponse } from "@/lib/server/export-identity";
import { createStockTransfersPdf } from "@/lib/server/list-pdf";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid transfer input" } }, { status: 400 });
  if (error instanceof TransferError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Stock transfer request failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to process stock transfer" } }, { status: 500 }); }
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const formats = searchParams.getAll("format");
    const format = formats[0] ?? null;
    if (formats.length > 1 || (format !== null && format !== "json" && format !== "pdf")) {
      return Response.json({ error: { code: "INVALID_FORMAT", message: "Stock transfer format must be json or pdf" } }, { status: 400 });
    }
    const actor = await requireCapability(request.headers, "stock-transfers:view");
    const query = listTransfersQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      transferId: searchParams.get("transferId") ?? undefined,
      status: searchParams.get("status") || undefined,
      sourceId: searchParams.get("sourceId") || undefined,
      destinationId: searchParams.get("destinationId") || undefined,
      reference: searchParams.get("reference") || undefined,
      dispatchedFrom: searchParams.get("dispatchedFrom") || undefined,
      dispatchedTo: searchParams.get("dispatchedTo") || undefined,
      deliveredFrom: searchParams.get("deliveredFrom") || undefined,
      deliveredTo: searchParams.get("deliveredTo") || undefined,
    });
    if (format === "pdf") {
      const { rows, appliedFilters, truncated } = await exportTransfers(actor, query);
      /*
       * The same day the list prints, from the same value, so the sheet and
       * the screen cannot disagree about when a transfer moved.
       */
      const day = (value: string | null) =>
        value ? new Date(value).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }) : "--";
      return pdfResponse(
        await createStockTransfersPdf(
          rows.map((transfer) => ({
            reference: transfer.reference,
            source: `${transfer.source.name} (${transfer.source.code})`,
            destination: `${transfer.destination.name} (${transfer.destination.code})`,
            dispatched: day(transfer.dispatchedAt),
            delivered: day(transfer.deliveredAt),
            deliveryReceipt: transfer.dispatchReceiptNumber || "--",
            status: transferStatusLabel(transfer.status),
            products: transfer.lines.length,
          })),
          {
            generatedBy: await exportIdentity(actor.userId),
            scope: hasAllLocationAccess(actor) ? "All locations" : "Assigned locations",
            appliedFilters,
          },
          truncated,
        ),
        "predator-stock-transfers.pdf",
      );
    }

    return Response.json(await listTransfers(actor, query));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) { try { const actor = await requireCapability(request.headers, "stock-transfers:create"); return Response.json({ data: await createTransfer(actor, createTransferSchema.parse(await request.json())) }, { status: 201 }); } catch (error) { return errorResponse(error); } }
