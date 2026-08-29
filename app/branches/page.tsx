import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";

import { BranchesClient } from "./branches-client";

export default async function BranchesPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("branches:view")) redirect("/access-denied");

  return <BranchesClient capabilities={access.capabilities} />;
}
