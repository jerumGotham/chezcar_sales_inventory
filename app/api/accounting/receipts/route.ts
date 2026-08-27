import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { CustomerSalesError, listReceiptVerifications } from "@/lib/server/services/customer-sales";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "sales:verify:view");
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const [receipts, branches] = await Promise.all([
      listReceiptVerifications(actor, params),
      prisma.location.findMany({ where: { type: "BRANCH", isActive: true, code: { in: ["QC", "BL", "LU", "VC", "SP"] }, ...(actor.role === "BRANCH_STAFF" ? { id: actor.locationId as string } : {}) }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    ]);
    return Response.json({ ...receipts, branches });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_FILTERS", message: "One or more receipt filters are invalid" } }, { status: 400 });
    if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return authorizationErrorResponse(error);
  }
}
