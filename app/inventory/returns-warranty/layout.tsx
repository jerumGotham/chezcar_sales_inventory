import type { ReactNode } from "react";
import { headers } from "next/headers";

import { loadShellAccess } from "@/lib/server/shell";
import { PageShellNavigationProvider } from "@/components/page-shell-navigation";
import { ReturnsWarrantyNav } from "./returns-warranty-nav";

export default async function ReturnsWarrantyLayout({ children }: { children: ReactNode }) {
  const access = await loadShellAccess(await headers());

  return (
    <PageShellNavigationProvider navigation={<ReturnsWarrantyNav capabilities={access.capabilities} />}>
      {children}
    </PageShellNavigationProvider>
  );
}
