"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, ArrowLeftRight, Bell, CalendarDays, ClipboardList, Loader2, MapPin, Package, ReceiptText, ShieldCheck, TrendingUp, Warehouse } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type SalesPeriod = "today" | "last7Days" | "monthToDate";
type SalesBranch = { id: string; code: string; name: string };

const SALES_PERIOD_OPTIONS: Array<{ value: SalesPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "last7Days", label: "Last 7 Days" },
  { value: "monthToDate", label: "Month to Date" },
];

type DashboardResponse = {
  summary: {
    capabilities: string[];
    canFilterSales: boolean;
    salesFilter: {
      period: SalesPeriod | "last30Days";
      periodLabel: string;
      branchId: string;
      branchLabel: string;
    };
    salesBranches: SalesBranch[];
    filteredSales: number;
    filteredTransactions: number;
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
    lowStockBranchCount: number;
    outOfStockCount: number;
    inactiveWithStockCount: number;
    supplierReceiptsToday: number;
    transferDrafts: number;
    transfersForDispatch: number;
    inTransitTransfers: number;
    discrepanciesNeedingAction: number;
    incomingTransfers: number;
    salesTrend: Array<{ label: string; sales: number; transactions: number }>;
    branchPerformance: Array<{ branch: string; sales: number; transactions: number }>;
    lowStock: Array<{ itemCode: string; name: string; location: string; available: number; reorderLevel: number }>;
  };
  notifications: Array<{ id: string; title: string; description: string; read: boolean }>;
};

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

async function fetchDashboard(
  salesPeriod: SalesPeriod,
  salesBranchId: string,
) {
  const params = new URLSearchParams();
  if (salesPeriod !== "today") params.set("salesPeriod", salesPeriod);
  if (salesBranchId !== "all") params.set("salesBranchId", salesBranchId);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/dashboard${query}`, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Unable to load dashboard");
  return (await response.json()) as DashboardResponse;
}

export default function DashboardPage() {
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>("today");
  const [salesBranchId, setSalesBranchId] = useState("all");
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["dashboard-summary", salesPeriod, salesBranchId],
    queryFn: () => fetchDashboard(salesPeriod, salesBranchId),
    placeholderData: (previous) => previous,
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
           {summary.canFilterSales ? (
             <AdminSalesFilters
               period={salesPeriod}
               branchId={salesBranchId}
               branches={summary.salesBranches}
               isFetching={isFetching}
               onPeriodChange={setSalesPeriod}
               onBranchChange={setSalesBranchId}
             />
           ) : null}

           <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
             {summary.canFilterSales ? (
               <>
                  <MetricCard href="/customer-orders?view=sales" icon={<TrendingUp className="h-5 w-5 text-emerald-600" />} label="Sales" value={formatPeso(summary.filteredSales)} hint={`${summary.salesFilter.periodLabel} - ${summary.salesFilter.branchLabel}`} />
                  <MetricCard href="/customer-orders?view=sales" icon={<ReceiptText className="h-5 w-5 text-sky-600" />} label="Transactions" value={String(summary.filteredTransactions)} hint={`${summary.filteredTransactions} posted sale(s) in scope`} />
                  <MetricCard href="/reports" icon={<TrendingUp className="h-5 w-5 text-indigo-600" />} label="Average per Transaction" value={formatPeso(summary.filteredTransactions > 0 ? summary.filteredSales / summary.filteredTransactions : 0)} hint={`${summary.salesFilter.periodLabel} - ${summary.salesFilter.branchLabel}`} />
                  <MetricCard href="/inventory" icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} label="Low-Stock Branches" value={String(summary.lowStockBranchCount)} hint={`${summary.lowStockCount} live low-stock row(s), not sales-filtered`} />
               </>
              ) : summary.capabilities.includes("inventory-receiving:create") && !summary.capabilities.includes("sales:post") ? (
               <>
                 <MetricCard icon={<Warehouse className="h-5 w-5 text-sky-600" />} label="SR Available Stock" value={String(summary.availableStock)} hint="Available units in Stock Room" />
                  <MetricCard icon={<ReceiptText className="h-5 w-5 text-emerald-600" />} label="Supplier Receipts Today" value={String(summary.supplierReceiptsToday)} hint="Posted into Stock Room" />
                  <MetricCard icon={<ClipboardList className="h-5 w-5 text-violet-600" />} label="Transfer Drafts" value={String(summary.transferDrafts)} hint="Drafts to complete" />
                  <MetricCard icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} label="Low / Out Stock" value={String(summary.lowStockCount)} hint={`${summary.outOfStockCount} out of stock`} />
               </>
              ) : summary.capabilities.includes("sales:post") ? (
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

           {summary.capabilities.includes("reports:view") ? (
             <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
               <Card>
                 <CardContent className="p-5">
                   <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold">Sales Trend</h2>
                        <p className="text-sm text-slate-500">
                          Posted sales for {summary.salesFilter.periodLabel.toLowerCase()} in {summary.salesFilter.branchLabel}.
                        </p>
                      </div>
                      <Badge variant="outline">{summary.salesFilter.periodLabel}</Badge>
                   </div>
                   <div className="mt-5 h-[280px]">
                     <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={summary.salesTrend} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => summary.salesFilter.period === "today" ? String(value) : String(value).slice(5)} />
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
                        <p className="text-sm text-slate-500">
                          Branch sales ranking for {summary.salesFilter.periodLabel.toLowerCase()}.
                        </p>
                      </div>
                      <Badge variant="outline">{summary.salesFilter.branchLabel}</Badge>
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
             {summary.capabilities.includes("inventory:view") ? (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                     <h2 className="text-base font-semibold">Low Stock by Branch</h2>
                   <p className="text-sm text-slate-500">{summary.outOfStockCount} out of stock, {summary.lowStockCount} at or below reorder level.</p>
                  </div>
                  <Link href="/inventory" className={buttonVariants({ variant: "view", size: "sm" })}>Inventory</Link>
                </div>
                <div className="mt-4 space-y-3">
                  {summary.lowStock.length === 0 ? <p className="text-sm text-slate-500">No low-stock rows in scope.</p> : summary.lowStock.map((item) => (
                    <div key={`${item.itemCode}-${item.location}`} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                         <div><p className="font-medium">{item.location}</p><p className="text-sm text-slate-700">{item.itemCode} - {item.name}</p></div>
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
                  <Link href="/notifications" className={buttonVariants({ variant: "view", size: "sm" })}><Bell className="mr-2 h-4 w-4" />Open</Link>
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

function AdminSalesFilters({
  period,
  branchId,
  branches,
  isFetching,
  onPeriodChange,
  onBranchChange,
}: {
  period: SalesPeriod;
  branchId: string;
  branches: SalesBranch[];
  isFetching: boolean;
  onPeriodChange: (period: SalesPeriod) => void;
  onBranchChange: (branchId: string) => void;
}) {
  const branchOptions = [
    { value: "all", label: "All Branches" },
    ...branches.map((branch) => ({
      value: branch.id,
      label: `${branch.code} - ${branch.name}`,
    })),
  ];

  return (
    <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900">
      <CardContent className="grid p-0 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex items-start gap-3 p-5">
          <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <TrendingUp className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Admin Sales View</h2>
              <Badge variant="outline">Sales only</Badge>
              {isFetching ? (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Updating
                </span>
              ) : null}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Period and branch apply to sales, transactions, trend, and branch
              performance. Inventory and alerts stay live across all branches.
            </p>
          </div>
        </div>

        <div className="grid gap-4 border-t bg-slate-50/70 p-4 sm:grid-cols-[auto_minmax(12rem,1fr)] lg:border-t-0 lg:border-l dark:bg-slate-950/30">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              Period
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-1">
              {SALES_PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={period === option.value ? "default" : "ghost"}
                  aria-pressed={period === option.value}
                  onClick={() => onPeriodChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <MapPin className="size-3.5" aria-hidden="true" />
              Branch
            </div>
            <Select<string>
              items={branchOptions}
              value={branchId}
              onValueChange={(value) => {
                if (value !== null) onBranchChange(value);
              }}
            >
              <SelectTrigger className="w-full sm:min-w-56" aria-label="Sales branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branchOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ icon, label, value, hint, href }: { icon: React.ReactNode; label: string; value: string; hint: string; href?: Route }) {
  const card = <Card className={href ? "h-full transition-colors hover:border-emerald-300 hover:bg-emerald-50/30" : undefined}><CardContent className="flex items-start justify-between gap-4 p-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-2 text-sm text-slate-500">{hint}</p></div><div className="rounded-full bg-slate-50 p-2">{icon}</div></CardContent></Card>;
  return href ? <Link href={href} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">{card}</Link> : card;
}
