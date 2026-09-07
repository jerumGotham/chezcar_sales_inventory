import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";

import { SuppliersClient } from "./suppliers-client";

export default async function SuppliersPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("suppliers:view")) redirect("/access-denied");

  return <SuppliersClient capabilities={access.capabilities} />;
}
