import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";
import { WarrantiesClient } from "./warranties-client";

export default async function WarrantiesPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("customer-warranties:view")) redirect("/access-denied");
  return <WarrantiesClient capabilities={access.capabilities} />;
}
