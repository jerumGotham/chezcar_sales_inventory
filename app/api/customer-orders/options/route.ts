import { NextResponse } from "next/server";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:view");
    const requestedLocationId = new URL(request.url).searchParams.get("locationId");
    const locationId = actor.role === "BRANCH_STAFF" ? actor.locationId : requestedLocationId;
    if (actor.role !== "ADMIN" && !locationId) return NextResponse.json({ error: { code: "LOCATION_REQUIRED", message: "Your account is not assigned to a branch" } }, { status: 400 });
    const location = locationId
      ? await prisma.location.findFirst({ where: { id: locationId, type: "BRANCH", isActive: true, code: { in: ["QC", "BL", "LU", "VC", "SP"] } }, select: { id: true } })
      : null;
    if (locationId && !location) return NextResponse.json({ error: { code: "INVALID_LOCATION", message: "Select an active branch" } }, { status: 400 });
    const [customers, products, branches] = await Promise.all([
      prisma.customer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true } }),
      locationId
        ? prisma.product.findMany({ where: { status: "ACTIVE", inventoryBalances: { some: { locationId, onHand: { gt: 0 } } } }, orderBy: { itemCode: "asc" }, take: 2_000, select: { id: true, itemCode: true, name: true, price: true, inventoryBalances: { where: { locationId }, select: { onHand: true, reserved: true } } } })
        : Promise.resolve([]),
      actor.role === "ADMIN"
        ? prisma.location.findMany({ where: { type: "BRANCH", isActive: true, code: { in: ["QC", "BL", "LU", "VC", "SP"] } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } })
        : [],
    ]);

    return NextResponse.json({
      data: {
        customers,
        products: products.map((product) => ({ id: product.id, itemCode: product.itemCode, name: product.name, price: product.price?.toNumber() ?? 0, availableQuantity: Math.max(0, (product.inventoryBalances[0]?.onHand ?? 0) - (product.inventoryBalances[0]?.reserved ?? 0)) })).filter((product) => product.availableQuantity > 0),
        branches,
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
