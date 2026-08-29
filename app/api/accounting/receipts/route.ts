import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CustomerSalesError, listReceiptVerifications } from "@/lib/server/services/customer-sales";
import { listActiveBranches } from "@/lib/server/locations";
import { hasAllLocationAccess } from "@/lib/server/policy/access";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "sales:verify:view");
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const [receipts, branches] = await Promise.all([
      listReceiptVerifications(actor, params),
      listActiveBranches().then((rows) =>
        hasAllLocationAccess(actor)
          ? rows
          : rows.filter((branch) => actor.locationIds.includes(branch.id)),
      ),
    ]);
    return Response.json({ ...receipts, branches });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_FILTERS", message: "One or more receipt filters are invalid" } }, { status: 400 });
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return authorizationErrorResponse(error);
  }
}
