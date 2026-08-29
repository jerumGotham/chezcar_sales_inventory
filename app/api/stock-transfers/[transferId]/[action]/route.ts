import { ZodError } from "zod";

import type { CapabilityId } from "@/lib/contracts/roles";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { discrepancySchema, investigationSchema, resolutionSchema, updateDraftSchema, versionSchema } from "@/lib/contracts/stock-transfers";
import { TransferError, confirmReceipt, deleteDraftTransfer, dispatchTransfer, finalizeTransfer, reportDiscrepancy, resolveTransfer, submitInvestigation, updateDraftTransfer } from "@/lib/server/services/stock-transfers";

type Context = { params: Promise<{ transferId: string; action: string }> };

const ACTION_CAPABILITIES = {
  finalize: "stock-transfers:finalize",
  dispatch: "stock-transfers:dispatch",
  "confirm-receipt": "stock-transfers:receive",
  "report-discrepancy": "stock-transfers:report-discrepancy",
  investigate: "stock-transfers:investigate",
  resolve: "stock-transfers:resolve",
  delete: "stock-transfers:delete",
  update: "stock-transfers:update",
} as const satisfies Record<string, CapabilityId>;

function isTransferAction(action: string): action is keyof typeof ACTION_CAPABILITIES {
  return action in ACTION_CAPABILITIES;
}

function errorResponse(error: unknown) { if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid transfer action input" } }, { status: 400 }); if (error instanceof TransferError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status }); try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Stock transfer action failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to process stock transfer" } }, { status: 500 }); } }

export async function POST(request: Request, context: Context) {
  try {
    const { transferId, action } = await context.params;
    if (!isTransferAction(action)) {
      throw new TransferError("NOT_FOUND", "Unknown transfer action", 404);
    }

    const actor = await requireCapability(request.headers, ACTION_CAPABILITIES[action]);
    if (action === "delete") {
      return Response.json({ data: await deleteDraftTransfer(actor, transferId) });
    }

    const body = await request.json();
    if (action === "finalize") return Response.json({ data: await finalizeTransfer(actor, transferId, versionSchema.parse(body).version) });
    if (action === "dispatch") return Response.json({ data: await dispatchTransfer(actor, transferId, versionSchema.parse(body).version) });
    if (action === "confirm-receipt") return Response.json({ data: await confirmReceipt(actor, transferId, versionSchema.parse(body).version) });
    if (action === "report-discrepancy") return Response.json({ data: await reportDiscrepancy(actor, transferId, discrepancySchema.parse(body)) });
    if (action === "investigate") return Response.json({ data: await submitInvestigation(actor, transferId, investigationSchema.parse(body)) });
    if (action === "resolve") return Response.json({ data: await resolveTransfer(actor, transferId, resolutionSchema.parse(body)) });

    const input = updateDraftSchema.parse(body);
    return Response.json({ data: await updateDraftTransfer(actor, transferId, input.version, input.lines) });
  } catch (error) {
    return errorResponse(error);
  }
}
