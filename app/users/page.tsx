import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/server/prisma";
import { loadShellAccess } from "@/lib/server/shell";

import { UsersClient, type UsersLocationOption } from "./users-client";

// Canonical presentation order per the approved UI-SPEC: Stock Room (SR)
// first, then QC, BL, LU, VC, SP.
const CANONICAL_LOCATION_ORDER = ["SR", "QC", "BL", "LU", "VC", "SP"] as const;

export default async function UsersPage() {
  const access = await loadShellAccess(await headers());

  if (!access.authenticated) {
    redirect("/sign-in");
  }

  // `users:manage` is held by the owner Admin only; every other role fails
  // closed before any protected data or client code can render.
  if (!access.capabilities.includes("users:manage")) {
    redirect("/access-denied");
  }

  // Location options derive from canonical active locations only so hostile
  // or stale codes never enter the assignment UI.
  const locations = await prisma.location.findMany({
    where: {
      isActive: true,
      OR: [
        { code: "SR", type: "WAREHOUSE" },
        { code: { in: ["QC", "BL", "LU", "VC", "SP"] }, type: "BRANCH" },
      ],
    },
    select: { id: true, code: true, name: true, type: true },
  });

  const orderedLocations: UsersLocationOption[] = CANONICAL_LOCATION_ORDER.map(
    (code) => locations.find((location) => location.code === code),
  ).filter((location): location is UsersLocationOption => Boolean(location));

  return <UsersClient locations={orderedLocations} />;
}
