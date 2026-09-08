import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";
import { WarrantyCreateClient } from "./warranty-create-client";

export default async function CreateWarrantyPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("customer-warranties:create")) redirect("/access-denied");
  return <WarrantyCreateClient isOwner={access.identity.isOwner} />;
}
