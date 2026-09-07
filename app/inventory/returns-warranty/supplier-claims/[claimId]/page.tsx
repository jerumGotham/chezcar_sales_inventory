import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadShellAccess } from "@/lib/server/shell";
import { SupplierClaimDetailClient } from "./supplier-claim-detail-client";
export default async function SupplierClaimDetailPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("supplier-claims:view")) redirect("/access-denied");
  return <SupplierClaimDetailClient capabilities={access.capabilities} />;
}
