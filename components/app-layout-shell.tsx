"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isPosPage = pathname?.startsWith("/pos");

  if (isPosPage) {
    return (
      <main className="min-h-screen bg-slate-50 text-foreground">
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-screen lg:flex">
      <AppSidebar />
      <main className="min-h-screen min-w-0 flex-1 bg-white p-5 pt-20 dark:bg-background lg:p-8">
        {children}
      </main>
    </div>
  );
}
