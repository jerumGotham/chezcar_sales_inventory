import { ReactNode } from "react";
import { headers } from "next/headers";

import { AppLayoutShellClient } from "@/components/app-layout-shell-client";
import { ShellAccessProvider } from "@/components/shell-access-context";
import { loadShellAccess } from "@/lib/server/shell";

export default async function AppLayoutShell({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = new Headers(await headers());
  const access = await loadShellAccess(requestHeaders);

  return (
    <ShellAccessProvider access={access}>
      <AppLayoutShellClient>{children}</AppLayoutShellClient>
    </ShellAccessProvider>
  );
}
