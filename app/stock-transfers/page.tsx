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
  const branches = canManageSource
    ? await listActiveBranches()
    : await listAccessibleActiveBranches(actor);
  const { transferId } = await searchParams;
  return (
    <StockTransfersClient
      capabilities={access.capabilities}
      branches={branches}
      canManageSource={canManageSource}
      initialTransferId={transferId}
      isAdmin={access.identity.isOwner}
    />
  );
}
