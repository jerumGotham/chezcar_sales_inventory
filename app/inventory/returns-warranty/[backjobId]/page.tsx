import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";
import { BackjobDetailClient } from "./backjob-detail-client";

export default async function BackjobDetailPage({ params }: { params: Promise<{ backjobId: string }> }) {
  const access = await loadShellAccess(await headers());
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("backjobs:view")) redirect("/access-denied");
  return <BackjobDetailClient backjobId={(await params).backjobId} capabilities={access.capabilities} />;
}
