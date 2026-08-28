import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { listActiveOperationalLocations } from "@/lib/server/locations";
import { loadShellAccess } from "@/lib/server/shell";

import {
  InventoryClient,
  type InventoryLocationOption,
} from "./inventory-client";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ balanceId?: string }>;
}) {
  const access = await loadShellAccess(await headers());
  const { balanceId } = await searchParams;

  if (!access.authenticated) {
    redirect("/sign-in");
  }

  // Fail closed before any protected data or client code can render.
  // Accounting has no inventory:view capability and never reaches this page.
  if (!access.capabilities.includes("inventory:view")) {
    redirect("/access-denied");
  }

  const orderedLocations: InventoryLocationOption[] =
    await listActiveOperationalLocations();

  return (
    <InventoryClient
      role={access.identity.role}
      scope={access.scope}
      locations={orderedLocations}
      initialBalanceId={balanceId}
    />
  );
}
