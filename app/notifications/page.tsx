"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { notifications as mockNotifications } from "@/lib/mock-data";

type Notification = {
  title: string;
  description: string;
  time: string;
  type?: "info" | "warning" | "success";
  read?: boolean;
};

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [notifications, setNotifications] = useState<Notification[]>(
    mockNotifications.map((n) => ({
      ...n,
      type: (n as any).type || "info",
      read: false,
    })),
  );

  const filteredNotifications = useMemo(() => {
    if (activeTab === "unread") {
      return notifications.filter((n) => !n.read);
    }
    return notifications;
  }, [activeTab, notifications]);

  const markAsRead = (index: number) => {
    setNotifications((prev) =>
      prev.map((n, i) => (i === index ? { ...n, read: true } : n)),
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const getCardClass = (type?: string, read?: boolean) => {
    if (read) {
      return "border-slate-200 bg-white";
    }

    switch (type) {
      case "warning":
        return "border-amber-200 bg-amber-50/80";
      case "success":
        return "border-emerald-200 bg-emerald-50/80";
      default:
        return "border-green-200 bg-green-50/80";
    }
  };

  const getIcon = (type?: string) => {
    switch (type) {
      case "warning":
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
        );
      case "success":
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
        );
      case "info":
      default:
        return (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <Info className="h-5 w-5 text-green-600" />
          </div>
        );
    }
  };

  const getTypeBadgeClass = (type?: string) => {
    switch (type) {
      case "warning":
        return "border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100";
      case "success":
        return "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
      default:
        return "border-green-200 bg-green-100 text-green-700 hover:bg-green-100";
    }
  };

  return (
    <PageShell
      title="Notifications"
      subtitle="Stay updated with stock alerts, approvals, and important system activities."
      actions={
        <Button
          variant="outline"
          onClick={markAllAsRead}
          className="border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
        >
          Mark all as read
        </Button>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-5 bg-green-50">
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-white data-[state=active]:text-green-700"
          >
            All
          </TabsTrigger>
          <TabsTrigger
            value="unread"
            className="data-[state=active]:bg-white data-[state=active]:text-green-700"
          >
            Unread
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4">
        {filteredNotifications.length === 0 && (
          <Card className="border-dashed border-green-200 bg-green-50/40">
            <CardContent className="p-6 text-center text-sm text-slate-500">
              No notifications available.
            </CardContent>
          </Card>
        )}

        {filteredNotifications.map((item, index) => (
          <Card
            key={`${item.title}-${index}`}
            className={`transition-all ${getCardClass(item.type, item.read)}`}
          >
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-4">
                <div className="shrink-0">{getIcon(item.type)}</div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-800">
                      {item.title}
                    </h3>

                    {!item.read && (
                      <Badge
                        variant="outline"
                        className={getTypeBadgeClass(item.type)}
                      >
                        New
                      </Badge>
                    )}
                  </div>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="bg-white/80 text-slate-600"
                    >
                      {item.time}
                    </Badge>

                    {item.type && (
                      <Badge
                        variant="outline"
                        className={
                          item.type === "warning"
                            ? "border-amber-200 text-amber-700"
                            : item.type === "success"
                              ? "border-emerald-200 text-emerald-700"
                              : "border-green-200 text-green-700"
                        }
                      >
                        {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {!item.read && (
                <div className="flex shrink-0 md:justify-end">
                  <Button
                    size="sm"
                    onClick={() => markAsRead(index)}
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    Mark as read
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
