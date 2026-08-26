"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, Bell, ClipboardList, Loader2, ReceiptText, TrendingUp } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type DashboardResponse = {
  summary: {
    role: string;
    todaySales: number;
    todayTransactions: number;
    monthSales: number;
    monthTransactions: number;
    openOrders: number;
    readyOrders: number;
    unverifiedSales: number;
    flaggedSales: number;
    lowStock: Array<{ itemCode: string; name: string; location: string; available: number; reorderLevel: number }>;
  };
  notifications: Array<{ id: string; title: string; description: string; read: boolean }>;
};

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

async function fetchDashboard() {
  const response = await fetch("/api/dashboard", { credentials: "same-origin" });
  if (!response.ok) throw new Error("Unable to load dashboard");
  return (await response.json()) as DashboardResponse;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboard,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const summary = data?.summary;

  return (
    <PageShell title="Dashboard" subtitle="Live operational summary from persisted sales, orders, inventory, accounting, and notifications.">
      {isLoading ? (
        <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard...</CardContent></Card>
      ) : error || !summary ? (
        <Card><CardContent className="p-6 text-sm text-red-600">{error?.message ?? "Dashboard unavailable"}</CardContent></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} label="Today Sales" value={formatPeso(summary.todaySales)} hint={`${summary.todayTransactions} transaction(s) today`} />
            <MetricCard icon={<ReceiptText className="h-5 w-5 text-sky-600" />} label="Month Sales" value={formatPeso(summary.monthSales)} hint={`${summary.monthTransactions} posted transaction(s)`} />
            <MetricCard icon={<ClipboardList className="h-5 w-5 text-violet-600" />} label="Open Orders" value={String(summary.openOrders)} hint={`${summary.readyOrders} ready for release`} />
            <MetricCard icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} label="Accounting Queue" value={String(summary.unverifiedSales)} hint={`${summary.flaggedSales} flagged mismatch(es)`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Low / Out Stock</h2>
                    <p className="text-sm text-slate-500">Available stock compared with reorder levels.</p>
                  </div>
                  <Link href="/inventory"><Button variant="outline" size="sm">Inventory</Button></Link>
                </div>
                <div className="mt-4 space-y-3">
                  {summary.lowStock.length === 0 ? <p className="text-sm text-slate-500">No low-stock rows in scope.</p> : summary.lowStock.map((item) => (
                    <div key={`${item.itemCode}-${item.location}`} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="font-medium">{item.name}</p><p className="text-xs text-slate-500">{item.itemCode} • {item.location}</p></div>
                        <Badge variant="outline">{item.available} / {item.reorderLevel}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Notifications</h2>
                    <p className="text-sm text-slate-500">Unread operational alerts for your user.</p>
                  </div>
                  <Link href="/notifications"><Button variant="outline" size="sm"><Bell className="mr-2 h-4 w-4" />Open</Button></Link>
                </div>
                <div className="mt-4 space-y-3">
                  {data.notifications.length === 0 ? <p className="text-sm text-slate-500">No notifications.</p> : data.notifications.map((notice) => (
                    <div key={notice.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{notice.title}</p>
                        {!notice.read && <Badge>Unread</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{notice.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function MetricCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return <Card><CardContent className="flex items-start justify-between gap-4 p-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-2 text-sm text-slate-500">{hint}</p></div><div className="rounded-full bg-slate-50 p-2">{icon}</div></CardContent></Card>;
}
