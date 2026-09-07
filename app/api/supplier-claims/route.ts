import { ZodError } from "zod";
import { createSupplierClaimSchema, supplierClaimListQuerySchema } from "@/lib/contracts/supplier-claims";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { createSupplierClaim, listSupplierClaims, SupplierClaimError } from "@/lib/server/services/supplier-claims";

function failure(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message } }, { status: 400 });
  if (error instanceof SupplierClaimError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Supplier claim request failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to process supplier claim" } }, { status: 500 }); }
}

export async function GET(request: Request) {
  try { const actor = await requireCapability(request.headers, "supplier-claims:view"); const params = new URL(request.url).searchParams; return Response.json(await listSupplierClaims(actor, supplierClaimListQuerySchema.parse(Object.fromEntries(params)))); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { const actor = await requireCapability(request.headers, "supplier-claims:create"); return Response.json({ data: await createSupplierClaim(actor, createSupplierClaimSchema.parse(await request.json())) }, { status: 201 }); } catch (error) { return failure(error); }
}
