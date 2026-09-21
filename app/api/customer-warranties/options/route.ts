import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import type { Capability } from "@/lib/server/policy/access";
import { accessibleLocationWhere, hasAllLocationAccess } from "@/lib/server/policy/access";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customer-warranties:create" as Capability);
    const [locations, lines, products] = await Promise.all([
        prisma.location.findMany({ where: { type: "BRANCH", isActive: true, ...accessibleLocationWhere(actor) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.saleLine.findMany({ where: { sale: { status: "POSTED", customerId: { not: null }, accountingReview: { status: "VERIFIED" }, location: accessibleLocationWhere(actor) } }, select: { id: true, quantity: true, productItemCode: true, productName: true, warrantyDurationMonths: true, warrantyExpiresAt: true, sale: { select: { reference: true, manualReceiptNumber: true, locationId: true, customer: { select: { name: true } } } } }, orderBy: { sale: { postedAt: "desc" } }, take: 250 }),
      prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, itemCode: true, name: true }, orderBy: { itemCode: "asc" }, take: 2_000 }),
    ]);
    // An item already claimed in full is dropped, so the list cannot offer a
    // choice the create call would refuse. Rejected and cancelled claims do not
    // count, matching the check the service runs, so a dismissed claim frees
    // the item to be claimed again.
    const claimed = await prisma.customerWarranty.groupBy({
      by: ["saleLineId"],
      where: { saleLineId: { in: lines.map((line) => line.id) }, status: { notIn: ["REJECTED", "CANCELLED"] } },
      _sum: { claimQuantity: true },
    });
    const claimedByLine = new Map(claimed.map((row) => [row.saleLineId, row._sum.claimQuantity ?? 0]));
    const openLines = lines.filter((line) => (claimedByLine.get(line.id) ?? 0) < line.quantity);

    return Response.json({ data: { locations, lines: openLines, products, legacyAllowed: actor.isOwner, canSelectLocation: hasAllLocationAccess(actor) } });
  } catch (error) { return authorizationErrorResponse(error); }
}
