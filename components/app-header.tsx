"use client";

import Image from "next/image";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, KeyRound, LogOut, MapPin, Moon, ScrollText, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { useCan, useShellAccess } from "@/components/shell-access-context";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { markHeaderNotificationRead } from "@/lib/header-notifications";

const THEME_KEY = "chezcar-theme";
// Dark-only release. The class is already set on <html> by the root layout so
// the first paint is dark; this keeps the toggle and saved preference dormant
// rather than deleting the code behind them.
const FORCE_DARK_THEME = true;

type HeaderNotification = {
  id: string;
  cursor: string;
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  relatedType?: string | null;
  relatedId?: string | null;
};

async function fetchHeaderNotifications() {
  const response = await fetch("/api/notifications", { credentials: "same-origin" });
  if (!response.ok) return [] as HeaderNotification[];
  const json = (await response.json()) as { data: HeaderNotification[] };
  return json.data;
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function notificationCursor(value: string | null) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return BigInt(0);
  }
}

export function AppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const router = useRouter();
  const access = useShellAccess();
  const canViewNotifications = useCan("notifications:view");
  const canViewAudit = useCan("audit:view");
  const canMarkNotificationsRead = useCan("notifications:mark-read");
  const queryClient = useQueryClient();
  const identityEmail = access.authenticated ? access.identity.email : null;
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isReady, setIsReady] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [toast, setToast] = useState<HeaderNotification | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationsQuery = useQuery({
    queryKey: ["notifications", identityEmail],
    queryFn: fetchHeaderNotifications,
    enabled: canViewNotifications,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const unreadCount = notificationsQuery.data?.filter((notification) => !notification.read).length ?? 0;

  useEffect(() => {
    if (!canViewNotifications || !identityEmail || typeof EventSource === "undefined") return;

    const cursorKey = `chezcar-notification-cursor:${identityEmail}`;
    const cursor = window.localStorage.getItem(cursorKey) ?? "0";
    const events = new EventSource(`/api/notifications/stream?cursor=${encodeURIComponent(cursor)}`, {
      withCredentials: true,
    });

    const handleNotification = (event: MessageEvent<string>) => {
      const notification = JSON.parse(event.data) as HeaderNotification;
      window.localStorage.setItem(cursorKey, notification.cursor);
      queryClient.setQueryData<HeaderNotification[]>(["notifications", identityEmail], (current = []) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        merged.set(notification.id, notification);
        return Array.from(merged.values()).sort((a, b) => {
          const aCursor = BigInt(a.cursor ?? "0");
          const bCursor = BigInt(b.cursor ?? "0");
          return aCursor === bCursor ? 0 : aCursor > bCursor ? -1 : 1;
        });
      });
    };

    const handleError = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", identityEmail] });
    };

    events.addEventListener("notification", handleNotification);
    events.addEventListener("error", handleError);

    return () => {
      events.removeEventListener("notification", handleNotification);
      events.removeEventListener("error", handleError);
      events.close();
    };
  }, [canViewNotifications, identityEmail, queryClient]);

  useEffect(() => {
    const notifications = notificationsQuery.data;
    if (!notifications || !identityEmail) return;

    const popupCursorKey = `chezcar-notification-popup-cursor:${identityEmail}`;
    const lastPopupCursor = notificationCursor(
      window.localStorage.getItem(popupCursorKey),
    );
    const newNotification = notifications.find(
      (notification) =>
        !notification.read &&
        notificationCursor(notification.cursor) > lastPopupCursor,
    );
    if (newNotification) {
      window.localStorage.setItem(popupCursorKey, newNotification.cursor);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToast(newNotification);
    }
  }, [identityEmail, notificationsQuery.data]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (FORCE_DARK_THEME) {
      applyTheme("dark");
      return;
    }
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const nextTheme =
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    // Hydrate the persisted theme after the browser becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(nextTheme);
    applyTheme(nextTheme);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (FORCE_DARK_THEME || !isReady) {
      return;
    }

    window.localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }, [isReady, theme]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const openToastNotification = async () => {
    if (!toast) return;
    const notification = toast;
    setToast(null);
    router.push("/notifications" as Route);

    if (!canMarkNotificationsRead || notification.read) return;
    try {
      await markHeaderNotificationRead(notification.id);
      queryClient.setQueryData<HeaderNotification[]>(
        ["notifications", identityEmail],
        (current = []) =>
          current.map((currentNotification) =>
            currentNotification.id === notification.id
              ? { ...currentNotification, read: true }
              : currentNotification,
          ),
      );
    } catch {
      void queryClient.invalidateQueries({
        queryKey: ["notifications", identityEmail],
      });
    }
  };

  /*
   * Sticky from lg up only. The card is tall once the scope chip and the icons
   * wrap, and pinning that to a phone viewport costs more room than it saves.
   * The negative margins bleed the page background to the edges so rows scroll
   * behind it rather than showing above its rounded corners, and the matching
   * negative top leaves the resting position unchanged.
   */
  return (
    <>
      <div className="mb-6 lg:sticky lg:top-0 lg:z-30 lg:-mx-8 lg:-mt-8 lg:bg-card lg:px-8 lg:pt-8 lg:">
        <div className="flex flex-col gap-4 rounded-[1.75rem] border border-border bg-card px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {access.authenticated ? (
              <div
                className="flex min-h-11 max-w-full items-center gap-2 rounded-2xl border border-border bg-muted px-3 py-2 text-sm text-foreground"
                aria-label={`Current scope: ${access.scope.label}`}
              >
                <MapPin
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-muted-foreground">
                    Current scope
                  </span>
                  <span className="block break-words font-semibold">
                    {access.scope.label}
                  </span>
                </span>
              </div>
            ) : null}

            {/* Beside the scope rather than in the sidebar: only the owner holds
                audit:view, so a menu entry nobody else sees costs every other role
                a row of nothing. Access is unchanged — the capability still gates
                both this link and the route. */}
            {canViewAudit ? (
              <Link
                href="/audit"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-muted text-foreground hover:bg-accent"
                aria-label="Audit trail"
                title="Audit trail"
              >
                <ScrollText className="h-5 w-5" />
              </Link>
            ) : null}

            {canViewNotifications ? (
              <Link
                href="/notifications"
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-muted text-foreground hover:bg-accent"
                aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            ) : null}

            {!FORCE_DARK_THEME && (
              <Button
                variant="outline"
                size="icon"
                className="rounded-2xl border-border bg-muted text-foreground hover:bg-accent"
                onClick={() =>
                  setTheme((current) => (current === "light" ? "dark" : "light"))
                }
                aria-label={
                  theme === "light" ? "Switch to dark mode" : "Switch to light mode"
                }
              >
                {theme === "light" ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
              </Button>
            )}

            {access.authenticated ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-2xl border border-border bg-muted px-3 py-2 text-left transition hover:bg-accent"
                  onClick={() => setIsMenuOpen((current) => !current)}
                  aria-expanded={isMenuOpen}
                  aria-haspopup="menu"
                >
                  <Image
                    src="/user-avatar.svg"
                    alt="Current user avatar"
                    width={40}
                    height={40}
                    className="rounded-full border border-border bg-card"
                  />
                  <div className="hidden min-w-0 sm:block">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {access.identity.name}
                    </p>
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={access.identity.roleName}
                    >
                      {access.identity.roleName}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isMenuOpen && "rotate-180",
                    )}
                  />
                </button>

                <div
                  className={cn(
                    "absolute right-0 top-[calc(100%+0.75rem)] z-30 w-56 rounded-2xl border border-border bg-popover p-2 shadow-soft transition",
                    isMenuOpen
                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none -translate-y-2 opacity-0",
                  )}
                  role="menu"
                >
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">
                      {access.identity.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {access.identity.email}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">
                      {access.identity.roleName}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsPasswordOpen(true);
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                    Change password
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-500/10"
                    role="menuitem"
                    onClick={async () => {
                      setIsMenuOpen(false);
                      await authClient.signOut();
                      router.replace("/sign-in" as Route);
                      router.refresh();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {canViewNotifications && toast ? (
        <div className="fixed right-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-4 shadow-xl" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => void openToastNotification()}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New notification</p>
              <p className="mt-1 font-semibold text-foreground">{toast.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{toast.description}</p>
            </button>
            <button type="button" className="rounded-lg p-1 text-muted-foreground hover:bg-muted" onClick={() => setToast(null)} aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      <ChangePasswordDialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen} />
    </>
  );
}
