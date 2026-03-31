"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { menus } from "@/lib/menu";
import { cn } from "@/lib/utils";

const DESKTOP_PIN_KEY = "chezcar-sidebar-pinned";

export function AppSidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopExpanded, setIsDesktopExpanded] = useState(true);
  const [isDesktopPinned, setIsDesktopPinned] = useState(true);

  useEffect(() => {
    const storedPinned = window.localStorage.getItem(DESKTOP_PIN_KEY);

    if (storedPinned !== null) {
      const nextPinned = storedPinned === "true";
      setIsDesktopPinned(nextPinned);
      setIsDesktopExpanded(nextPinned);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DESKTOP_PIN_KEY, String(isDesktopPinned));
  }, [isDesktopPinned]);

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  useEffect(() => {
    setIsMobileOpen(false);

    if (!isDesktopPinned) {
      setIsDesktopExpanded(false);
    }
  }, [pathname, isDesktopPinned]);

  const toggleDesktopSidebar = () => {
    setIsDesktopExpanded((current) => !current);
  };

  const toggleDesktopPin = () => {
    setIsDesktopPinned((current) => {
      const nextPinned = !current;

      if (nextPinned) {
        setIsDesktopExpanded(true);
      }

      return nextPinned;
    });
  };

  const renderMenu = (showLabels: boolean) => (
    <nav className="space-y-2">
      {menus.map((menu) => {
        const Icon = menu.icon;
        const active =
          pathname === menu.href || pathname.startsWith(`${menu.href}/`);

        return (
          <Link
            key={menu.href}
            href={menu.href}
            aria-label={menu.label}
            title={menu.label}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "group h-12 w-full rounded-2xl border px-3 text-sm font-medium transition-all duration-200",
              showLabels ? "justify-start gap-3" : "justify-center px-0",
              active
                ? "border-brand-200 bg-brand-100 text-brand-800 shadow-sm hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-100"
                : "border-transparent text-slate-600 hover:border-brand-100 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/5 dark:hover:text-white",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active
                  ? "text-brand-700 dark:text-brand-200"
                  : "text-slate-400 group-hover:text-brand-600 dark:text-slate-500 dark:group-hover:text-white",
              )}
            />
            {showLabels ? (
              <span className="truncate">{menu.label}</span>
            ) : (
              <span className="sr-only">{menu.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 rounded-2xl border-brand-200 bg-white text-brand-700 shadow-sm backdrop-blur hover:bg-brand-50 hover:text-brand-800 dark:border-white/10 dark:bg-card dark:text-white dark:hover:bg-white/10 lg:hidden"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <aside
        className={cn(
          "relative hidden shrink-0 transition-[width] duration-300 ease-out lg:block",
          isDesktopExpanded ? "w-80" : "w-24",
        )}
      >
        <div className="sticky top-0 h-screen p-3">
          <Card className="flex h-full flex-col overflow-hidden border-brand-100 bg-white/95 text-slate-900 shadow-soft dark:border-white/10 dark:bg-card dark:text-white">
            <CardHeader
              className={cn(
                "gap-4 border-b border-brand-100 bg-brand-50/80 dark:border-white/10 dark:bg-white/5",
                isDesktopExpanded ? "p-5" : "items-center p-4",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-3",
                  isDesktopExpanded ? "justify-between" : "flex-col",
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-3",
                    !isDesktopExpanded && "flex-col",
                  )}
                >
                  <div className="relative overflow-hidden rounded-2xl border border-[#65f144]/25 bg-white/95 p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
                    <Image
                      src="/chezcar-logo.svg"
                      alt="Chezcar Auto Care logo"
                      width={isDesktopExpanded ? 60 : 44}
                      height={isDesktopExpanded ? 60 : 44}
                      className="h-auto w-auto rounded-xl"
                      priority
                    />
                  </div>

                  {isDesktopExpanded ? (
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600 dark:text-brand-300">
                        Chezcar
                      </p>
                      <CardTitle className="mt-1 text-xl text-slate-900 dark:text-white">
                        Sales &amp; Inventory
                      </CardTitle>
                    </div>
                  ) : (
                    <span className="sr-only">Chezcar Sales and Inventory</span>
                  )}
                </div>

                <div
                  className={cn(
                    "flex items-center gap-2",
                    !isDesktopExpanded && "flex-col",
                  )}
                >
                  {/* <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl border border-brand-100 bg-white text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={toggleDesktopSidebar}
                    aria-label={
                      isDesktopExpanded ? "Collapse sidebar" : "Expand sidebar"
                    }
                  >
                    {isDesktopExpanded ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" />
                    )}
                  </Button> */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-9 w-9 rounded-xl border border-brand-100 bg-white hover:bg-brand-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                      isDesktopPinned
                        ? "text-brand-600 dark:text-brand-300"
                        : "text-slate-500 dark:text-white/60",
                    )}
                    onClick={toggleDesktopPin}
                    aria-label={
                      isDesktopPinned ? "Unpin sidebar" : "Pin sidebar"
                    }
                  >
                    {isDesktopPinned ? (
                      <Pin className="h-4 w-4" />
                    ) : (
                      <PinOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-3">
              {renderMenu(isDesktopExpanded)}
            </CardContent>
          </Card>
        </div>
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm transition-opacity duration-200 lg:hidden dark:bg-black/55",
          isMobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-sm p-3 transition-transform duration-300 ease-out lg:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!isMobileOpen}
      >
        <Card className="flex h-full flex-col overflow-hidden border-brand-100 bg-white text-slate-900 shadow-soft dark:border-white/10 dark:bg-card dark:text-white">
          <CardHeader className="gap-4 border-b border-brand-100 bg-brand-50/90 p-5 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative overflow-hidden rounded-2xl border border-brand-100 bg-white p-1">
                  <Image
                    src="/chezcar-logo.svg"
                    alt="Chezcar Auto Care logo"
                    width={60}
                    height={60}
                    className="h-auto w-auto rounded-xl"
                    priority
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600 dark:text-brand-300">
                    Chezcar
                  </p>
                  <CardTitle className="mt-1 text-xl text-slate-900 dark:text-white">
                    Sales &amp; Inventory
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                    Auto care operations hub
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl border border-brand-100 bg-white text-slate-600 hover:bg-brand-50 hover:text-brand-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                onClick={() => setIsMobileOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-3">
            {renderMenu(true)}
          </CardContent>
        </Card>
      </aside>
    </>
  );
}
