import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/server/authorization";
import { listAccessibleActiveBranches } from "@/lib/server/locations";
import { loadShellAccess } from "@/lib/server/shell";

import { OfflineDevicesClient, type OfflineBranchOption } from "./offline-devices-client";

export default async function OfflineDevicesPage() {
  const requestHeaders = await headers();
  const access = await loadShellAccess(requestHeaders);

  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("offline-sales:activate-device")) redirect("/access-denied");

  const actor = await requireCapability(
    requestHeaders,
    "offline-sales:activate-device",
  );
  const branches = await listAccessibleActiveBranches(actor);

  return (
    <OfflineDevicesClient
      branches={branches satisfies OfflineBranchOption[]}
      capabilities={access.capabilities}
    />
  );
}
