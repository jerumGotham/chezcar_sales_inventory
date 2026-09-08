import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";
import { WarrantyDetailClient } from "./warranty-detail-client";

export default async function WarrantyDetailPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("customer-warranties:view")) redirect("/access-denied");
  return <WarrantyDetailClient capabilities={access.capabilities} isOwner={access.identity.isOwner} />;
}
