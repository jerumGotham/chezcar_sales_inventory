"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, ArrowLeftRight, Bell, ClipboardList, Loader2, Package, ReceiptText, ShieldCheck, TrendingUp, Warehouse } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
    verifiedToday: number;
    agedOrders: number;
    availableStock: number;
    lowStockCount: number;
    outOfStockCount: number;
    inactiveWithStockCount: number;
    supplierReceiptsToday: number;
    transferDrafts: number;
    transfersForDispatch: number;
    inTransitTransfers: number;
    discrepanciesNeedingAction: number;
    incomingTransfers: number;
    salesTrend: Array<{ date: string; sales: number; transactions: number }>;
    branchPerformance: Array<{ branch: string; sales: number; transactions: number }>;
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
             {summary.role === "ADMIN" ? (
               <>
                 <MetricCard icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} label="Today Sales" value={formatPeso(summary.todaySales)} hint={`${summary.todayTransactions} transaction(s) today`} />
                 <MetricCard icon={<ReceiptText className="h-5 w-5 text-sky-600" />} label="Today Transactions" value={String(summary.todayTransactions)} hint="Posted sales today" />
                 <MetricCard icon={<TrendingUp className="h-5 w-5 text-indigo-600" />} label="Month-to-Date Sales" value={formatPeso(summary.monthSales)} hint={`${summary.monthTransactions} posted transaction(s)`} />
                 <MetricCard icon={<ClipboardList className="h-5 w-5 text-violet-600" />} label="Open Reservations" value={String(summary.openOrders)} hint={`${summary.readyOrders} ready for release`} />
               </>
             ) : summary.role === "STOCK_STAFF" ? (
               <>
                 <MetricCard icon={<Warehouse className="h-5 w-5 text-sky-600" />} label="SR Available Stock" value={String(summary.availableStock)} hint="Available units in Stock Room" />
                  <MetricCard icon={<ReceiptText className="h-5 w-5 text-emerald-600" />} label="Supplier Receipts Today" value={String(summary.supplierReceiptsToday)} hint="Posted into Stock Room" />
                  <MetricCard icon={<ClipboardList className="h-5 w-5 text-violet-600" />} label="Transfer Drafts" value={String(summary.transferDrafts)} hint="Drafts to complete" />
                  <MetricCard icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} label="Low / Out Stock" value={String(summary.lowStockCount)} hint={`${summary.outOfStockCount} out of stock`} />
               </>
             ) : summary.role === "BRANCH_STAFF" ? (
               <>
                 <MetricCard icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} label="Today Sales" value={formatPeso(summary.todaySales)} hint={`${summary.todayTransactions} transaction(s) today`} />
                  <MetricCard icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} label="Low / Out Stock" value={String(summary.lowStockCount)} hint={`${summary.outOfStockCount} out of stock`} />
                 <MetricCard icon={<Package className="h-5 w-5 text-violet-600" />} label="Available Stock" value={String(summary.availableStock)} hint={`${summary.outOfStockCount} out of stock`} />
                 <MetricCard icon={<ArrowLeftRight className="h-5 w-5 text-blue-600" />} label="Incoming Transfers" value={String(summary.incomingTransfers)} hint="In transit to your branch" />
               </>
             ) : (
               <>
                 <MetricCard icon={<ShieldCheck className="h-5 w-5 text-amber-600" />} label="Unverified Transactions" value={String(summary.unverifiedSales)} hint="Awaiting Accounting review" />
                 <MetricCard icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />} label="Verified Today" value={String(summary.verifiedToday)} hint="Reviewed today" />
                 <MetricCard icon={<AlertTriangle className="h-5 w-5 text-rose-600" />} label="Flagged Mismatches" value={String(summary.flaggedSales)} hint="Needs reconciliation" />
                 <MetricCard icon={<TrendingUp className="h-5 w-5 text-sky-600" />} label="Month-to-Date Sales" value={formatPeso(summary.monthSales)} hint={`${summary.monthTransactions} posted transaction(s)`} />
               </>
             )}
           </div>

           {summary.role === "ADMIN" || summary.role === "ACCOUNTING_STAFF" ? (
             <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
               <Card>
                 <CardContent className="p-5">
                   <div className="flex items-center justify-between gap-3">
                     <div>
                       <h2 className="text-base font-semibold">Sales Trend</h2>
                       <p className="text-sm text-slate-500">Posted sales over the last 30 days.</p>
                     </div>
                     <Badge variant="outline">30 days</Badge>
                   </div>
                   <div className="mt-5 h-[280px]">
                     <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={summary.salesTrend} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} />
                         <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => String(value).slice(5)} />
                         <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => `₱${Math.round(Number(value) / 1000)}k`} width={52} />
                         <Tooltip formatter={(value) => formatPeso(Number(value))} />
                         <Line type="monotone" dataKey="sales" name="Sales" stroke="#059669" strokeWidth={3} dot={false} />
                       </LineChart>
                     </ResponsiveContainer>
                   </div>
                 </CardContent>
               </Card>
               <Card>
                 <CardContent className="p-5">
                   <div className="flex items-center justify-between gap-3">
                     <div>
                       <h2 className="text-base font-semibold">Branch Performance</h2>
                       <p className="text-sm text-slate-500">Posted sales over the last 30 days.</p>
                     </div>
                     <Badge variant="outline">Sales</Badge>
                   </div>
                   <div className="mt-5 h-[280px]">
                     {summary.branchPerformance.length === 0 ? <p className="flex h-full items-center justify-center text-sm text-slate-500">No sales data yet.</p> : (
                       <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={summary.branchPerformance} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                           <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                           <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => `₱${Math.round(Number(value) / 1000)}k`} />
                           <YAxis type="category" dataKey="branch" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={72} />
                           <Tooltip formatter={(value) => formatPeso(Number(value))} />
                           <Bar dataKey="sales" name="Sales" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                         </BarChart>
                       </ResponsiveContainer>
                     )}
                   </div>
                 </CardContent>
               </Card>
             </div>
           ) : null}

           <div className="grid gap-6 xl:grid-cols-2">
             {summary.role !== "ACCOUNTING_STAFF" ? (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Low / Out Stock</h2>
                   <p className="text-sm text-slate-500">{summary.outOfStockCount} out of stock, {summary.lowStockCount} at or below reorder level.</p>
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
             ) : null}

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
