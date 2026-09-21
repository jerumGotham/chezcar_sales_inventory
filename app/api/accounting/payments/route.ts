import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { listActiveBranches } from "@/lib/server/locations";
import { hasAllLocationAccess } from "@/lib/server/policy/access";
import { listPaymentVerifications, PaymentError } from "@/lib/server/services/payments";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "sales:verify:view");
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const [payments, branches] = await Promise.all([
      listPaymentVerifications(actor, params),
      listActiveBranches().then((rows) =>
        hasAllLocationAccess(actor) ? rows : rows.filter((branch) => actor.locationIds.includes(branch.id)),
      ),
    ]);
    return Response.json({ ...payments, branches }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_FILTERS", message: "One or more payment filters are invalid" } }, { status: 400 });
    if (error instanceof PaymentError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return authorizationErrorResponse(error);
  }
}
