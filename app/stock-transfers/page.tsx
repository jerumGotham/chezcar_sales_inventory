import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/server/authorization";
import { canAccessLocation } from "@/lib/server/policy/access";
import { prisma } from "@/lib/server/prisma";
import { loadShellAccess } from "@/lib/server/shell";
import { listAccessibleActiveBranches, listActiveBranches } from "@/lib/server/locations";
import { StockTransfersClient } from "./stock-transfers-client";

export default async function StockTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ transferId?: string }>;
}) {
  const requestHeaders = await headers();
  const access = await loadShellAccess(requestHeaders);
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("stock-transfers:view")) redirect("/access-denied");
  const needsStockRoomProducts =
    access.capabilities.includes("stock-transfers:create") ||
    access.capabilities.includes("stock-transfers:update");
  const actor = await requireCapability(requestHeaders, "stock-transfers:view");
  const stockRoom = needsStockRoomProducts
    ? await prisma.location.findFirst({ where: { code: "SR", type: "WAREHOUSE", isActive: true }, select: { id: true } })
    : null;
  const canManageSource = Boolean(
    stockRoom && canAccessLocation(actor, stockRoom.id),
  );
  const [branches, products] = await Promise.all([
    canManageSource ? listActiveBranches() : listAccessibleActiveBranches(actor),
    canManageSource && stockRoom ? prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, itemCode: true, name: true, inventoryBalances: { where: { locationId: stockRoom.id }, select: { onHand: true, reserved: true } } }, orderBy: { itemCode: "asc" }, take: 500 }).then((rows) => rows.map((product) => ({ id: product.id, itemCode: product.itemCode, name: product.name, availableQuantity: Math.max(0, (product.inventoryBalances[0]?.onHand ?? 0) - (product.inventoryBalances[0]?.reserved ?? 0)) }))) : Promise.resolve([]),
  ]);
  const { transferId } = await searchParams;
  return (
    <StockTransfersClient
      capabilities={access.capabilities}
      branches={branches}
      products={products}
      initialTransferId={transferId}
      isAdmin={access.identity.isOwner}
    />
  );
}
