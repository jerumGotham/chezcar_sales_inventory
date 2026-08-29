import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { listActiveOperationalLocations } from "@/lib/server/locations";
import { loadShellAccess } from "@/lib/server/shell";
import { listAssignableRoleDefinitions } from "@/lib/server/services/roles";

import { UsersClient, type UsersLocationOption } from "./users-client";

export default async function UsersPage() {
  const access = await loadShellAccess(await headers());

  if (!access.authenticated) {
    redirect("/sign-in");
  }

  // Administration capabilities are held by the owner Admin only; every other role fails
  // closed before any protected data or client code can render.
  if (!access.identity.isOwner || !access.capabilities.includes("users:view")) {
    redirect("/access-denied");
  }

  const [orderedLocations, roles] = await Promise.all([
    listActiveOperationalLocations() as Promise<UsersLocationOption[]>,
    listAssignableRoleDefinitions(),
  ]);

  return (
    <UsersClient
      capabilities={access.capabilities}
      locations={orderedLocations}
      roles={roles}
    />
  );
}
