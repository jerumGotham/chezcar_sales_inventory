import { supplierStatusRequestSchema } from "@/lib/contracts/suppliers";
import { requireCapability } from "@/lib/server/authorization";
import {
  setSupplierStatus,
  suppliersErrorResponse,
} from "@/lib/server/services/suppliers";

type SupplierRouteContext = { params: Promise<{ supplierId: string }> };

export async function POST(request: Request, context: SupplierRouteContext) {
  try {
    const actor = await requireCapability(request.headers, "suppliers:deactivate");
    const { supplierId } = await context.params;
    const input = supplierStatusRequestSchema.parse(await request.json());
    return Response.json({ data: await setSupplierStatus(actor, supplierId, input) });
  } catch (error) {
    return suppliersErrorResponse(error, "Unable to change supplier status");
  }
}
