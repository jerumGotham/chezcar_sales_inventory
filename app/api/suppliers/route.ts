import { createSupplierSchema, supplierListQuerySchema } from "@/lib/contracts/suppliers";
import { requireCapability } from "@/lib/server/authorization";
import {
  createSupplier,
  listSuppliers,
  suppliersErrorResponse,
} from "@/lib/server/services/suppliers";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "suppliers:view");
    const query = supplierListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    // Already { data, meta }: the list screen reads both.
    return Response.json(await listSuppliers(actor, query));
  } catch (error) {
    return suppliersErrorResponse(error, "Unable to list suppliers");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "suppliers:create");
    const input = createSupplierSchema.parse(await request.json());
    return Response.json({ data: await createSupplier(actor, input) }, { status: 201 });
  } catch (error) {
    return suppliersErrorResponse(error, "Unable to create supplier");
  }
}
