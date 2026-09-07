import { updateSupplierSchema } from "@/lib/contracts/suppliers";
import { requireCapability } from "@/lib/server/authorization";
import {
  suppliersErrorResponse,
  updateSupplier,
} from "@/lib/server/services/suppliers";

type SupplierRouteContext = { params: Promise<{ supplierId: string }> };

export async function PATCH(request: Request, context: SupplierRouteContext) {
  try {
    const actor = await requireCapability(request.headers, "suppliers:update");
    const { supplierId } = await context.params;
    const input = updateSupplierSchema.parse(await request.json());
    return Response.json({ data: await updateSupplier(actor, supplierId, input) });
  } catch (error) {
    return suppliersErrorResponse(error, "Unable to update supplier");
  }
}
