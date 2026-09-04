import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { notifyReceiptEvidencePending } from "@/lib/server/services/receipt-evidence-notifications";
import { CustomerSalesError } from "@/lib/server/services/customer-sales";

type Context = { params: Promise<{ saleId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "sales:evidence:upload");
    const { saleId } = await context.params;
    return Response.json({ data: await notifyReceiptEvidencePending(actor, saleId) });
  } catch (error) {
    if (error instanceof CustomerSalesError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return authorizationErrorResponse(error);
  }
}
