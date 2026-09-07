import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";
import { BackjobsClient } from "./backjobs-client";

export default async function BackjobsPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("backjobs:view")) redirect("/access-denied");
  return <BackjobsClient capabilities={access.capabilities} />;
}
