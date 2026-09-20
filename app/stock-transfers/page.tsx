import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/server/authorization";
import { loadShellAccess } from "@/lib/server/shell";
import { listActiveBranches, listAccessibleOperationalLocations } from "@/lib/server/locations";
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
  const actor = await requireCapability(requestHeaders, "stock-transfers:view");

  // Stock can leave any location the user holds, and land at any active branch.
  const sources = await listAccessibleOperationalLocations(actor);
  const branches = await listActiveBranches();
  const { transferId } = await searchParams;
  return (
    <StockTransfersClient
      capabilities={access.capabilities}
      branches={branches}
      sources={sources.map(({ id, code, name }) => ({ id, code, name }))}
      canManageSource={sources.length > 0}
      initialTransferId={transferId}
      isAdmin={access.identity.isOwner}
    />
  );
}
