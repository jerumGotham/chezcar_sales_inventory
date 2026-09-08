import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import type { Capability } from "@/lib/server/policy/access";
import { CustomerWarrantyError, getCustomerWarranty } from "@/lib/server/services/customer-warranties";
import { readWarrantyEvidence } from "@/lib/server/services/warranty-evidence";

type Context = { params: Promise<{ warrantyId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customer-warranties:view" as Capability);
    const warranty = await getCustomerWarranty(actor, (await context.params).warrantyId);
    if (!warranty.intakePhotoKey || !warranty.intakePhotoName) throw new CustomerWarrantyError("NOT_FOUND", "No intake photo was attached to this claim", 404);
    const evidence = await readWarrantyEvidence(warranty.intakePhotoKey);
    return new Response(evidence.body, { headers: { "Content-Type": evidence.contentType, "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="${warranty.intakePhotoName.replaceAll('"', "")}"` } });
  } catch (error) {
    if (error instanceof CustomerWarrantyError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Response("Not found", { status: 404 });
    return authorizationErrorResponse(error);
  }
}
