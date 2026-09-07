import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { removeSupplierClaimEvidence, saveSupplierClaimEvidence } from "@/lib/server/services/supplier-claim-evidence";
import { addSupplierClaimEvidence, SupplierClaimError } from "@/lib/server/services/supplier-claims";
type Context = { params: Promise<{ claimId: string }> };
export async function POST(request: Request, context: Context) {
  let key: string | undefined;
  try { const actor = await requireCapability(request.headers, "supplier-claims:evidence"); const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) throw new SupplierClaimError("INVALID_INPUT", "Evidence file is required", 400); const saved = await saveSupplierClaimEvidence(file); key = saved.key; const data = await addSupplierClaimEvidence(actor, (await context.params).claimId, saved, String(form.get("caption") ?? "").trim() || undefined); key = undefined; return Response.json({ data }, { status: 201 }); }
  catch (error) { if (key) await removeSupplierClaimEvidence(key).catch(() => undefined); if (error instanceof SupplierClaimError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status }); if (error instanceof Error && error.message.startsWith("Evidence")) return Response.json({ error: { code: "INVALID_INPUT", message: error.message } }, { status: 400 }); return authorizationErrorResponse(error); }
}
