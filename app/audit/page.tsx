import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";

import { AuditClient } from "./audit-client";

export default async function AuditPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("audit:view")) redirect("/access-denied");

  return <AuditClient />;
}
