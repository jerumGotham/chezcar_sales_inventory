import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { listActiveBranches } from "@/lib/server/locations";
import { loadShellAccess } from "@/lib/server/shell";

import { OfflineDevicesClient, type OfflineBranchOption } from "./offline-devices-client";

export default async function OfflineDevicesPage() {
  const access = await loadShellAccess(await headers());

  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("offline-sales:activate-device")) redirect("/access-denied");

  const branches = await listActiveBranches();

  return (
    <OfflineDevicesClient
      branches={branches satisfies OfflineBranchOption[]}
      capabilities={access.capabilities}
    />
  );
}
