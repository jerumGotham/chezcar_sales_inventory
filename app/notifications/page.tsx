"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { useCan } from "@/components/shell-access-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notificationDestination } from "@/lib/notification-links";

type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
  type?: "info" | "warning" | "success";
  read?: boolean;
  relatedType?: string | null;
  relatedId?: string | null;
  relatedReference?: string | null;
};

async function fetchNotifications() {
  const response = await fetch("/api/notifications", {
    credentials: "same-origin",
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.message ?? "Unable to load notifications");
  }
  return json.data as Notification[];
}

async function markNotificationRead(id: string) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
    credentials: "same-origin",
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.message ?? "Unable to mark notification read");
  }
  return json.data as Notification;
}

async function markNotificationsRead() {
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    credentials: "same-origin",
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.message ?? "Unable to mark notifications read");
  }
  return json.data as Notification[];
}

function TypeIcon({ type }: { type: Notification["type"] }) {
  if (type === "warning")
    return <AlertTriangle className="size-4 text-amber-600" />;
  if (type === "success")
    return <CheckCircle2 className="size-4 text-emerald-600" />;
  return <Info className="size-4 text-sky-600" />;
}

export default function NotificationsPage() {
  const canViewNotifications = useCan("notifications:view");
  const canMarkRead = useCan("notifications:mark-read");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    enabled: canViewNotifications,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const openMutation = useMutation({
    mutationFn: async ({
      notification,
      destination,
    }: {
      notification: Notification;
      destination: string | null;
    }) => {
      if (canMarkRead && !notification.read) await markNotificationRead(notification.id);
      return destination;
    },
    onSuccess: (destination) => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (destination) router.push(destination as Route);
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => {
      if (!canMarkRead) throw new Error("You do not have permission to mark notifications as read.");
      return markNotificationsRead();
    },
    onSuccess: (notifications) =>
      queryClient.setQueryData(["notifications"], notifications),
  });
  const activateNotification = (
    notification: Notification,
    destination: string | null,
  ) => {
    if (openMutation.isPending) return;
    openMutation.mutate({ notification, destination });
  };

  const notifications = useMemo(
    () =>
      (notificationsQuery.data ?? []).map((notification) => ({
        ...notification,
        type: notification.type ?? "info",
      })),
    [notificationsQuery.data],
  );
  const filteredNotifications = useMemo(
    () =>
      activeTab === "unread"
        ? notifications.filter((notification) => !notification.read)
        : notifications,
    [activeTab, notifications],
  );

  return (
    <PageShell
      title="Notifications"
      subtitle="Review operational alerts and open their related transactions."
      actions={
        canMarkRead ? <Button
          variant="workflow"
          onClick={() => markAllReadMutation.mutate()}
          disabled={
            markAllReadMutation.isPending ||
            notifications.every((notification) => notification.read)
          }
        >
          Mark all as read
        </Button> : null
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-5 bg-green-50 dark:bg-slate-900">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-12 px-4 py-3">Type</th>
                  <th className="px-4 py-3">Notification</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="w-28 px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {notificationsQuery.isLoading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={6}>
                      Loading notifications...
                    </td>
                  </tr>
                ) : notificationsQuery.isError ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-red-600" colSpan={6}>
                      {(notificationsQuery.error as Error).message}
                    </td>
                  </tr>
                ) : filteredNotifications.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={6}>
                      No notifications available.
                    </td>
                  </tr>
                ) : (
                  filteredNotifications.map((notification) => {
                    const destination = notificationDestination(notification);
                    return (
                      <tr
                        key={notification.id}
                        onClick={destination ? () => activateNotification(notification, destination) : undefined}
                        className={`border-b last:border-0 ${notification.read ? "bg-white dark:bg-slate-950" : "bg-green-50/60 dark:bg-emerald-950/30"} ${destination ? "cursor-pointer transition-colors hover:bg-green-100/60 dark:hover:bg-emerald-950/50" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <TypeIcon type={notification.type} />
                        </td>
                        <td className="max-w-xl px-4 py-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {notification.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {notification.description}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">
                          {notification.relatedReference ?? "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                          {notification.time}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={notification.read ? "secondary" : "outline"}>
                            {notification.read ? "Read" : "New"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(destination || (canMarkRead && !notification.read)) && <Button
                            size="sm"
                            variant={destination ? "view" : "workflow"}
                            disabled={openMutation.isPending || (!destination && notification.read)}
                            aria-label={destination ? `Open ${notification.relatedReference ?? notification.title}` : `Mark ${notification.title} as read`}
                            onClick={(event) => {
                              event.stopPropagation();
                              activateNotification(notification, destination);
                            }}
                          >
                            {destination ? (
                              <>
                                Open <ArrowUpRight className="ml-1 size-3.5" />
                              </>
                            ) : (
                              "Mark read"
                            )}
                          </Button>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
