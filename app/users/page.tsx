import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";
import { listAssignableRoleDefinitions } from "@/lib/server/services/roles";
import { listAssignableUserLocations, requireUserManager } from "@/lib/server/services/users";

import { UsersClient, type UsersLocationOption } from "./users-client";

export default async function UsersPage() {
  const requestHeaders = await headers();
  const access = await loadShellAccess(requestHeaders);

  if (!access.authenticated) {
    redirect("/sign-in");
  }

  if (!access.capabilities.includes("users:view")) {
    redirect("/access-denied");
  }

  const actor = await requireUserManager(requestHeaders, "users:view");
  const [orderedLocations, roles] = await Promise.all([
    listAssignableUserLocations(actor) as Promise<UsersLocationOption[]>,
    listAssignableRoleDefinitions(actor),
  ]);

  return (
    <UsersClient
      capabilities={access.capabilities}
      locations={orderedLocations}
      roles={roles}
    />
  );
}
