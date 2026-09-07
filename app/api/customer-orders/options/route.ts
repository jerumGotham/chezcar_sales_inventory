import { NextResponse } from "next/server";

import { authorizationErrorResponse, requireAnyCapability } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { findActiveBranch, listActiveBranches } from "@/lib/server/locations";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/server/policy/access";
import { listActiveSalespersonOptions } from "@/lib/server/services/personnel";
import { availableStock } from "@/lib/inventory-quantity";

export async function GET(request: Request) {
  try {
    const actor = await requireAnyCapability(request.headers, [
      "customer-orders:create",
      "customer-orders:release",
      "sales:post",
    ]);
    const searchParams = new URL(request.url).searchParams;
    const requestedLocationId = searchParams.get("locationId");
    const includeUnavailable = searchParams.get("includeUnavailable") === "true";
    const locationId = requestedLocationId;
    const location = locationId
      ? await findActiveBranch(locationId)
      : null;
    if (locationId && (!location || !canAccessLocation(actor, location.id))) return NextResponse.json({ error: { code: "INVALID_LOCATION", message: "Select an assigned active branch" } }, { status: 400 });
    const [customers, products, branches, salespersons] = await Promise.all([
      prisma.customer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true } }),
      locationId
        ? prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { itemCode: "asc" }, take: 2_000, select: { id: true, itemCode: true, name: true, category: true, price: true, inventoryBalances: { where: { locationId }, select: { onHand: true, reserved: true, quarantined: true } } } })
        : Promise.resolve([]),
      listActiveBranches().then((rows) =>
        hasAllLocationAccess(actor)
          ? rows
          : rows.filter((branch) => actor.locationIds.includes(branch.id)),
      ),
      locationId ? listActiveSalespersonOptions(actor, locationId) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      data: {
        customers,
        products: products.map((product) => ({ id: product.id, itemCode: product.itemCode, name: product.name, category: product.category ?? "Uncategorized", price: product.price?.toNumber() ?? 0, availableQuantity: availableStock({ onHand: product.inventoryBalances[0]?.onHand ?? 0, reserved: product.inventoryBalances[0]?.reserved ?? 0, quarantined: product.inventoryBalances[0]?.quarantined ?? 0 }) })).filter((product) => includeUnavailable || product.availableQuantity > 0),
        branches,
        salespersons,
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
