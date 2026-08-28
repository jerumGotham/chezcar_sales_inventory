"use client";

import Image from "next/image";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, ChevronDown, LogOut, MapPin, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShellAccess } from "@/components/shell-access-context";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { notificationDestination } from "@/lib/notification-links";
import { markHeaderNotificationRead } from "@/lib/header-notifications";

const THEME_KEY = "chezcar-theme";

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

async function fetchPushPublicKey() {
  const response = await fetch("/api/notifications/push-public-key", { credentials: "same-origin" });
  if (!response.ok) return null;
  const json = (await response.json()) as { data: { enabled: boolean; publicKey: string | null } };
  return json.data.enabled ? json.data.publicKey : null;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
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
  const queryClient = useQueryClient();
  const identityEmail = access.authenticated ? access.identity.email : null;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isReady, setIsReady] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState<HeaderNotification | null>(null);
  const [toastError, setToastError] = useState("");
  const [pushState, setPushState] = useState<"unsupported" | "unavailable" | "default" | "denied" | "subscribed" | "pending">("unavailable");
  const menuRef = useRef<HTMLDivElement>(null);
  const seenNotificationIds = useRef(new Set<string>());
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchHeaderNotifications,
    enabled: access.authenticated,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const unreadCount = notificationsQuery.data?.filter((notification) => !notification.read).length ?? 0;

  const enablePushNotifications = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }

    setPushState("pending");
    const publicKey = await fetchPushPublicKey();
    if (!publicKey) {
      setPushState("unavailable");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushState(permission === "denied" ? "denied" : "default");
      return;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await fetch("/api/notifications/push-subscription", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    setPushState("subscribed");
  };

  useEffect(() => {
    if (!access.authenticated || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    let cancelled = false;
    void fetchPushPublicKey().then(async (publicKey) => {
      if (cancelled) return;
      if (!publicKey) {
        setPushState("unavailable");
        return;
      }
      if (Notification.permission === "denied") {
        setPushState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setPushState(subscription ? "subscribed" : "default");
    });

    return () => {
      cancelled = true;
    };
  }, [access.authenticated]);

  useEffect(() => {
    if (!access.authenticated || !identityEmail || typeof EventSource === "undefined") return;

    const cursorKey = `chezcar-notification-cursor:${identityEmail}`;
    const cursor = window.localStorage.getItem(cursorKey) ?? "0";
    const events = new EventSource(`/api/notifications/stream?cursor=${encodeURIComponent(cursor)}`, {
      withCredentials: true,
    });

    const handleNotification = (event: MessageEvent<string>) => {
      const notification = JSON.parse(event.data) as HeaderNotification;
      window.localStorage.setItem(cursorKey, notification.cursor);
      queryClient.setQueryData<HeaderNotification[]>(["notifications"], (current = []) => {
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
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    events.addEventListener("notification", handleNotification);
    events.addEventListener("error", handleError);

    return () => {
      events.removeEventListener("notification", handleNotification);
      events.removeEventListener("error", handleError);
      events.close();
    };
  }, [access.authenticated, identityEmail, queryClient]);

  useEffect(() => {
    const notifications = notificationsQuery.data;
    if (!notifications) return;

    if (seenNotificationIds.current.size === 0) {
      notifications.forEach((notification) => seenNotificationIds.current.add(notification.id));
      return;
    }

    const newNotification = notifications.find(
      (notification) => !notification.read && !seenNotificationIds.current.has(notification.id),
    );
    notifications.forEach((notification) => seenNotificationIds.current.add(notification.id));
    if (newNotification) {
      setToastError("");
      setToast(newNotification);
    }
  }, [notificationsQuery.data]);

  useEffect(() => {
    if (!toast || toastError) return;
    const timer = window.setTimeout(() => setToast(null), 7_000);
    return () => window.clearTimeout(timer);
  }, [toast, toastError]);

  useEffect(() => {
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
    if (!isReady) {
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
    try {
      if (!toast.read) await markHeaderNotificationRead(toast.id);
      queryClient.setQueryData<HeaderNotification[]>(
        ["notifications"],
        (current = []) =>
          current.map((notification) =>
            notification.id === toast.id
              ? { ...notification, read: true }
              : notification,
          ),
      );
      const destination = notificationDestination(toast) ?? "/notifications";
      setToastError("");
      setToast(null);
      router.push(destination as Route);
    } catch (error) {
      setToastError(error instanceof Error ? error.message : "Unable to open notification.");
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[1.75rem] border border-brand-100 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {access.authenticated ? (
          <div
            className="flex min-h-11 max-w-full items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50/70 px-3 py-2 text-sm text-foreground dark:border-slate-800 dark:bg-slate-900"
            aria-label={`Current scope: ${access.scope.label}`}
          >
            <MapPin
              className="h-4 w-4 shrink-0 text-brand-700 dark:text-brand-300"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Current scope
              </span>
              <span className="block break-words font-semibold">
                {access.scope.label}
              </span>
            </span>
          </div>
        ) : null}

        {access.authenticated ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-2xl border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={enablePushNotifications}
            disabled={pushState === "unsupported" || pushState === "unavailable" || pushState === "denied" || pushState === "subscribed" || pushState === "pending"}
            title={
              pushState === "subscribed"
                ? "Browser notifications enabled"
                : pushState === "unavailable"
                  ? "Browser notifications need VAPID keys"
                  : pushState === "denied"
                    ? "Browser notifications are blocked"
                    : "Enable browser notifications"
            }
            aria-label="Enable browser notifications"
          >
            <BellRing className="h-5 w-5" />
          </Button>
        ) : null}

        {access.authenticated ? (
          <Link
            href="/notifications"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
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

        <Button
          variant="outline"
          size="icon"
          className="rounded-2xl border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
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

        {access.authenticated ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-3 py-2 text-left transition hover:bg-brand-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() => setIsMenuOpen((current) => !current)}
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
            >
              <Image
                src="/user-avatar.svg"
                alt="Current user avatar"
                width={40}
                height={40}
                className="rounded-full border border-brand-100 bg-white dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold text-foreground">
                  {access.identity.name}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  Authenticated user
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-500 transition-transform dark:text-slate-400",
                  isMenuOpen && "rotate-180",
                )}
              />
            </button>

            <div
              className={cn(
                "absolute right-0 top-[calc(100%+0.75rem)] z-30 w-56 rounded-2xl border border-brand-100 bg-white p-2 shadow-soft transition dark:border-slate-800 dark:bg-slate-950",
                isMenuOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-2 opacity-0",
              )}
              role="menu"
            >
              <div className="rounded-xl bg-brand-50/80 px-3 py-2 dark:bg-slate-900">
                <p className="text-sm font-semibold text-foreground">
                  {access.identity.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {access.identity.email}
                </p>
              </div>
              <button
                type="button"
                className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
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
      {toast ? (
        <div className="fixed right-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-brand-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => void openToastNotification()}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">New notification</p>
              <p className="mt-1 font-semibold text-foreground">{toast.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{toast.description}</p>
              {toastError ? <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{toastError}</p> : null}
            </button>
            <button type="button" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setToastError(""); setToast(null); }} aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
