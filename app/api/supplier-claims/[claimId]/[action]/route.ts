import { ZodError } from "zod";
import { supplierClaimActionCapabilities, supplierClaimActions, supplierClaimActionSchema } from "@/lib/contracts/supplier-claims";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { actOnSupplierClaim, SupplierClaimError } from "@/lib/server/services/supplier-claims";
type Context = { params: Promise<{ claimId: string; action: string }> };
export async function POST(request: Request, context: Context) {
  try { const { claimId, action } = await context.params; if (!supplierClaimActions.includes(action as typeof supplierClaimActions[number])) throw new SupplierClaimError("NOT_FOUND", "Unknown claim action", 404); const typedAction = action as typeof supplierClaimActions[number]; const actor = await requireCapability(request.headers, supplierClaimActionCapabilities[typedAction]); return Response.json({ data: await actOnSupplierClaim(actor, claimId, typedAction, supplierClaimActionSchema.parse(await request.json())) }); }
  catch (error) { if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message } }, { status: 400 }); if (error instanceof SupplierClaimError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status }); try { return authorizationErrorResponse(error); } catch { return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to update claim" } }, { status: 500 }); } }
}
