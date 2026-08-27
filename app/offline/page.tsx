import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/server/prisma";
import { loadShellAccess } from "@/lib/server/shell";

import { OfflineDevicesClient, type OfflineBranchOption } from "./offline-devices-client";

export default async function OfflineDevicesPage() {
  const access = await loadShellAccess(await headers());

  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("users:manage")) redirect("/access-denied");

  const branches = await prisma.location.findMany({
    where: {
      type: "BRANCH",
      isActive: true,
      code: { in: ["QC", "BL", "LU", "VC", "SP"] },
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  return <OfflineDevicesClient branches={branches satisfies OfflineBranchOption[]} />;
}
