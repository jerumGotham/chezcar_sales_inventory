import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/server/authorization";
import { listAssignablePersonnelBranches } from "@/lib/server/services/personnel";
import { loadShellAccess } from "@/lib/server/shell";

import { PersonnelClient } from "./personnel-client";

export default async function PersonnelPage() {
  const requestHeaders = await headers();
  const access = await loadShellAccess(requestHeaders);
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("personnel:view")) redirect("/access-denied");

  const actor = await requireCapability(requestHeaders, "personnel:view");
  const branches = await listAssignablePersonnelBranches(actor);
  return <PersonnelClient capabilities={access.capabilities} branches={branches} />;
}
