import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CustomerSalesError, deleteVoidedSale } from "@/lib/server/services/customer-sales";
import { describeError, recordSystemLog } from "@/lib/server/services/system-log";

type Context = { params: Promise<{ saleId: string }> };

/**
 * Removes a voided sale so the branch can encode the receipt again. Voiding
 * already restored the stock and the money; this clears the record and frees
 * the receipt number.
 */
export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:delete-voided");
    const { saleId } = await context.params;
    return Response.json({ data: await deleteVoidedSale(actor, saleId) });
  } catch (error) {
    if (error instanceof CustomerSalesError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    const known = authorizationErrorResponse(error);
    if (known) return known;
    const { message, detail } = describeError(error);
    await recordSystemLog({ level: "ERROR", source: "DELETE /api/accounting/receipts/[saleId]", message, detail });
    return Response.json({ error: { code: "SERVER_ERROR", message: "Unable to delete the sale" } }, { status: 500 });
  }
}
