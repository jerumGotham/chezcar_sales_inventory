import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { getSupplierClaim, SupplierClaimError } from "@/lib/server/services/supplier-claims";
type Context = { params: Promise<{ claimId: string }> };
export async function GET(request: Request, context: Context) {
  try { const actor = await requireCapability(request.headers, "supplier-claims:view"); return Response.json({ data: await getSupplierClaim(actor, (await context.params).claimId) }); }
  catch (error) { if (error instanceof SupplierClaimError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status }); try { return authorizationErrorResponse(error); } catch { return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to load claim" } }, { status: 500 }); } }
}
