import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import type { Capability } from "@/lib/server/policy/access";
import { CustomerWarrantyError, getCustomerWarranty } from "@/lib/server/services/customer-warranties";

type Context = { params: Promise<{ warrantyId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "customer-warranties:view" as Capability);
    return Response.json({ data: await getCustomerWarranty(actor, (await context.params).warrantyId) });
  } catch (error) {
    if (error instanceof CustomerWarrantyError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Warranty detail failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to load warranty" } }, { status: 500 }); }
  }
}
