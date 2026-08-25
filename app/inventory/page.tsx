import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/server/prisma";
import { loadShellAccess } from "@/lib/server/shell";

import {
  InventoryClient,
  type InventoryLocationOption,
} from "./inventory-client";

// Canonical presentation order for the Admin scope selector per the approved
// UI-SPEC: Stock Room (SR) first, then QC, BL, LU, VC, SP.
const SCOPE_LOCATION_ORDER = ["SR", "QC", "BL", "LU", "VC", "SP"];

export default async function InventoryPage() {
  const access = await loadShellAccess(await headers());

  if (!access.authenticated) {
    redirect("/sign-in");
  }

  // Fail closed before any protected data or client code can render.
  // Accounting has no inventory:view capability and never reaches this page.
  if (!access.capabilities.includes("inventory:view")) {
    redirect("/access-denied");
  }

  const locations = await prisma.location.findMany({
    where: {
      isActive: true,
      OR: [
        { code: "SR", type: "WAREHOUSE" },
        { code: { in: ["QC", "BL", "LU", "VC", "SP"] }, type: "BRANCH" },
      ],
    },
    select: { id: true, code: true, name: true },
  });

  const orderedLocations: InventoryLocationOption[] = SCOPE_LOCATION_ORDER.map(
    (code) => locations.find((location) => location.code === code),
  ).filter((location): location is InventoryLocationOption => !!location);

  return (
    <InventoryClient
      role={access.identity.role}
      scope={access.scope}
      locations={orderedLocations}
    />
  );
}
