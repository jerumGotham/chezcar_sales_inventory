import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { readSupplierClaimEvidence } from "@/lib/server/services/supplier-claim-evidence";
import { getSupplierClaim, SupplierClaimError } from "@/lib/server/services/supplier-claims";
type Context = { params: Promise<{ claimId: string; evidenceId: string }> };
export async function GET(request: Request, context: Context) {
  try { const actor = await requireCapability(request.headers, "supplier-claims:view"); const { claimId, evidenceId } = await context.params; await getSupplierClaim(actor, claimId); const record = await prisma.supplierClaimEvidence.findFirst({ where: { id: evidenceId, claimId } }); if (!record) return new Response("Not found", { status: 404 }); const file = await readSupplierClaimEvidence(record.storageKey); return new Response(file.body, { headers: { "Content-Type": file.contentType, "Content-Disposition": `inline; filename="${record.fileName.replaceAll('"', "")}"`, "Cache-Control": "private, no-store" } }); }
  catch (error) { if (error instanceof SupplierClaimError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status }); try { return authorizationErrorResponse(error); } catch { return new Response("Not found", { status: 404 }); } }
}
