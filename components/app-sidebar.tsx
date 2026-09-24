"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  ArrowLeftRight,
  LayoutDashboard,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  UserCog,
  Users,
  ShoppingCart,
  ShieldCheck,
  ScrollText,
  Truck,
  Contact,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import type {
  ShellMenuEntryDto,
  ShellMenuIcon,
} from "@/lib/contracts/access";
import { cn } from "@/lib/utils";

const DESKTOP_PIN_KEY = "chezcar-sidebar-pinned";

const MENU_ICONS: Record<ShellMenuIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: Users,
  "customer-sales": ShoppingCart,
  products: Package,
  inventory: Boxes,
  "customer-orders": ClipboardList,
  users: UserCog,
  roles: ShieldCheck,
  branches: Building2,
  suppliers: Truck,
  personnel: Contact,
  "returns-warranty": RotateCcw,
  reports: FileText,
  "receipt-verification": FileText,
  "stock-transfers": ArrowLeftRight,
  "offline-devices": ShieldCheck,
  audit: ScrollText,
};

export function AppSidebar({ menu }: { menu: readonly ShellMenuEntryDto[] }) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktopExpanded, setIsDesktopExpanded] = useState(true);
  const [isDesktopPinned, setIsDesktopPinned] = useState(true);

  useEffect(() => {
    const storedPinned = window.localStorage.getItem(DESKTOP_PIN_KEY);

    if (storedPinned !== null) {
      const nextPinned = storedPinned === "true";
      // Hydrate the user preference after localStorage becomes available.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // Close mobile navigation whenever the route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const activeMenuHref = menu.reduce<string | null>((best, item) => {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return matches && (!best || item.href.length > best.length) ? item.href : best;
  }, null);

  const renderMenu = (showLabels: boolean) => (
    <nav className="space-y-2">
      {menu.map((menuItem) => {
        const Icon = MENU_ICONS[menuItem.icon];
        const active = menuItem.href === activeMenuHref;

        return (
          <Link
            key={menuItem.href}
            href={menuItem.href as never}
            aria-label={menuItem.label}
            title={menuItem.label}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "group h-12 w-full rounded-2xl border px-3 text-sm font-medium transition-all duration-200",
              showLabels ? "justify-start gap-3" : "justify-center px-0",
              active
                ? "border-brand-200 bg-brand-100 text-brand-800 shadow-sm hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-100"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground dark:hover:border-white/10",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active
                  ? "text-brand-700 dark:text-brand-200"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            {showLabels ? (
              <span className="truncate">{menuItem.label}</span>
            ) : (
              <span className="sr-only">{menuItem.label}</span>
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
        className="fixed left-4 top-4 z-50 rounded-2xl border-border bg-card text-foreground shadow-sm backdrop-blur hover:bg-muted lg:hidden"
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
          <Card className="flex h-full flex-col overflow-hidden border-border bg-card/95 text-foreground shadow-soft">
            <CardHeader
              className={cn(
                "gap-4 border-b border-border bg-muted",
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
                  {/* The wordmark already carries the business name, so the
                      expanded header gives it the width instead of repeating
                      it in text beside a thumbnail too small to read. */}
                  {isDesktopExpanded ? (
                    <div className="min-w-0">
                      {/* Dark ink for a light sidebar, white for a dark one.
                          Swapped by class so no theme state is needed here. */}
                      <Image
                        src="/predator-mark.png"
                        alt="Predator Offroad PH"
                        width={840}
                        height={280}
                        className="h-auto w-[210px] max-w-full dark:hidden"
                        priority
                      />
                      <Image
                        src="/predator-mark-light.png"
                        alt=""
                        aria-hidden="true"
                        width={2029}
                        height={369}
                        className="hidden h-auto w-[210px] max-w-full dark:block"
                        priority
                      />
                      <CardTitle className="mt-2 text-sm font-medium tracking-wide text-muted-foreground">
                        Sales &amp; Inventory
                      </CardTitle>
                    </div>
                  ) : (
                    <>
                      {/* Collapsed, a wide wordmark is unreadable, so the
                          square badge stands in for it. */}
                      <Image
                        src="/predator-icon-192.png"
                        alt="Predator Offroad PH"
                        width={192}
                        height={192}
                        className="h-10 w-10 rounded-lg"
                        priority
                      />
                      <span className="sr-only">Predator Sales and Inventory</span>
                    </>
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
                    className="h-9 w-9 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
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
                      "h-9 w-9 rounded-xl border border-border bg-card hover:bg-muted",
                      isDesktopPinned
                        ? "text-brand-600 dark:text-brand-300"
                        : "text-muted-foreground",
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

            <CardContent className="flex-1 overflow-y-auto p-3 pb-8">
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
        <Card className="flex h-full flex-col overflow-hidden border-border bg-card text-foreground shadow-soft">
          <CardHeader className="gap-4 border-b border-border bg-muted p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Image
                  src="/predator-mark.png"
                  alt="Predator Offroad PH"
                  width={840}
                  height={280}
                  className="h-auto w-[210px] max-w-full dark:hidden"
                  priority
                />
                <Image
                  src="/predator-mark-light.png"
                  alt=""
                  aria-hidden="true"
                  width={2029}
                  height={369}
                  className="hidden h-auto w-[210px] max-w-full dark:block"
                  priority
                />
                <CardTitle className="mt-2 text-sm font-medium tracking-wide text-muted-foreground">
                  Sales &amp; Inventory
                </CardTitle>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setIsMobileOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-3 pb-8">
            {renderMenu(true)}
          </CardContent>
        </Card>
      </aside>
    </>
  );
}
