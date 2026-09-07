import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";
import { NewBackjobClient } from "./new-backjob-client";

export default async function NewBackjobPage() {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("backjobs:create")) redirect("/access-denied");
  return <NewBackjobClient isOwner={access.identity.isOwner} />;
}
