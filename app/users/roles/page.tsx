import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";

import { RolesClient } from "./roles-client";

export default async function RolesPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.identity.isOwner || !access.capabilities.includes("roles:manage")) {
    redirect("/access-denied");
  }
  return <RolesClient />;
}
