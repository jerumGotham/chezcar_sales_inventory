import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { listSales } from "@/lib/server/services/customer-sales";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "sales:verify:view");
    return Response.json({ data: await listSales(actor) });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
