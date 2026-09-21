"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { IdleSessionLogout } from "@/components/idle-session-logout";
import { useShellAccess } from "@/components/shell-access-context";

export function AppLayoutShellClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const access = useShellAccess();
  const isTransferPrintView =
    /^\/stock-transfers\/[^/]+\/print$/.test(pathname);
  // Warranty and supplier-claim print views sit one folder deeper, and without
  // them here the sidebar and header end up on the sheet handed to a customer.
  const isReturnsPrintView =
    /^\/inventory\/returns-warranty\/(?:warranties\/|supplier-claims\/)?[^/]+\/print$/.test(pathname);

  if (pathname.startsWith("/sign-in") || isTransferPrintView || isReturnsPrintView) {
    return children;
  }

  return (
    <div className="min-h-screen lg:flex">
      {access.authenticated && <IdleSessionLogout />}
      <AppSidebar menu={access.menu} />
      <main className="min-h-screen min-w-0 flex-1 bg-white p-5 pt-20 pb-16 dark:bg-background lg:p-8 lg:pb-24">
        {children}
      </main>
    </div>
  );
}
