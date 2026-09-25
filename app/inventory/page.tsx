import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/server/authorization";
import { listAccessibleActiveBranches } from "@/lib/server/locations";
import { loadShellAccess } from "@/lib/server/shell";

import {
  InventoryClient,
  type InventoryLocationOption,
} from "./inventory-client";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ balanceId?: string; location?: string }>;
}) {
  const requestHeaders = await headers();
  const access = await loadShellAccess(requestHeaders);
  const { balanceId, location } = await searchParams;

  if (!access.authenticated) {
    redirect("/sign-in");
  }

  // Fail closed before any protected data or client code can render.
  // Accounting has no inventory:view capability and never reaches this page.
  if (!access.capabilities.includes("inventory:view")) {
    redirect("/access-denied");
  }

  const actor = await requireCapability(requestHeaders, "inventory:view");
  // Branches only, as Branch Maintenance defines them.
  const orderedLocations: InventoryLocationOption[] =
    await listAccessibleActiveBranches(actor);

  return (
    <InventoryClient
      scope={access.scope}
      locations={orderedLocations}
      initialBalanceId={balanceId}
      initialLocationCode={location}
    />
  );
}
