import { ZodError } from "zod";
import { supplierClaimSettlementSchema } from "@/lib/contracts/supplier-claims";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { addSupplierClaimSettlement, SupplierClaimError } from "@/lib/server/services/supplier-claims";
type Context = { params: Promise<{ claimId: string }> };
export async function POST(request: Request, context: Context) {
  try { const actor = await requireCapability(request.headers, "supplier-claims:record-monetary-resolution"); return Response.json({ data: await addSupplierClaimSettlement(actor, (await context.params).claimId, supplierClaimSettlementSchema.parse(await request.json())) }, { status: 201 }); }
  catch (error) { if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message } }, { status: 400 }); if (error instanceof SupplierClaimError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status }); return authorizationErrorResponse(error); }
}
