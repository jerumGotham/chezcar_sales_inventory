import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadShellAccess } from "@/lib/server/shell";
import { SupplierClaimsClient } from "./supplier-claims-client";
export default async function SupplierClaimsPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("supplier-claims:view")) redirect("/access-denied");
  return <SupplierClaimsClient />;
}
