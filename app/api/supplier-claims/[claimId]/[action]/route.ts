import { ZodError } from "zod";
import { supplierClaimActions, supplierClaimActionSchema } from "@/lib/contracts/supplier-claims";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { actOnSupplierClaim, SupplierClaimError } from "@/lib/server/services/supplier-claims";
import type { CapabilityId } from "@/lib/contracts/roles";
type Context = { params: Promise<{ claimId: string; action: string }> };
const actionCapabilities: Record<typeof supplierClaimActions[number], CapabilityId> = {
  submit: "supplier-claims:manage", "wait-replacement": "supplier-claims:manage",
  "return-to-supplier": "supplier-claims:return-stock", "send-repair": "supplier-claims:repair-stock",
  "receive-replacement": "supplier-claims:receive-replacement", "release-repaired": "supplier-claims:repair-stock",
  "receive-repaired": "supplier-claims:repair-stock", writeoff: "supplier-claims:approve-writeoff",
  reject: "supplier-claims:close", complete: "supplier-claims:close", cancel: "supplier-claims:close",
};
export async function POST(request: Request, context: Context) {
  try { const { claimId, action } = await context.params; if (!supplierClaimActions.includes(action as typeof supplierClaimActions[number])) throw new SupplierClaimError("NOT_FOUND", "Unknown claim action", 404); const typedAction = action as typeof supplierClaimActions[number]; const actor = await requireCapability(request.headers, actionCapabilities[typedAction]); return Response.json({ data: await actOnSupplierClaim(actor, claimId, typedAction, supplierClaimActionSchema.parse(await request.json())) }); }
  catch (error) { if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message } }, { status: 400 }); if (error instanceof SupplierClaimError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status }); try { return authorizationErrorResponse(error); } catch { return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to update claim" } }, { status: 500 }); } }
}
