"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ReportsResponse = {
  data: {
    sales: { totalSales: number; transactionCount: number; rows: Array<{ id: string; manualReceiptNumber: string; branch: string; customer: string; totalAmount: number; reviewStatus: string }> };
    accounting: { unverified: number; verified: number; flagged: number; flaggedRows: Array<{ id: string; manualReceiptNumber: string; branch: string; customer: string }> };
    orders: { open: number; rows: Array<{ id: string; orderNo: string; customer: string; status: string; balance: number }> };
    inventory: Array<{ itemCode: string; name: string; location: string; onHand: number; reserved: number; available: number; reorderLevel: number }>;
  };
};

async function fetchReports() {
  const response = await fetch("/api/reports", { credentials: "same-origin" });
  if (!response.ok) throw new Error("Unable to load reports");
  return (await response.json()) as ReportsResponse;
}

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

export default function ReportsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["reports-summary"], queryFn: fetchReports });
  const reports = data?.data;

  return (
    <PageShell title="Reports" subtitle="Read-only live summaries for Sales, Accounting/Reconciliation, and Admin Inventory.">
      {isLoading ? (
        <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading reports...</CardContent></Card>
      ) : error || !reports ? (
        <Card><CardContent className="p-6 text-sm text-red-600">{error?.message ?? "Reports unavailable"}</CardContent></Card>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <a href="/api/reports?format=pdf">
              <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
                <FileText className="mr-2 h-4 w-4" />Export PDF
              </Button>
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard label="Sales Total" value={formatPeso(reports.sales.totalSales)} hint={`${reports.sales.transactionCount} posted transaction(s)`} />
            <SummaryCard label="Accounting Queue" value={String(reports.accounting.unverified)} hint={`${reports.accounting.flagged} flagged, ${reports.accounting.verified} verified`} />
            <SummaryCard label="Open Orders" value={String(reports.orders.open)} hint="Reservations and waiting-stock orders" />
          </div>

          <div className="grid min-w-0 gap-6 xl:grid-cols-2">
            <ReportTable title="Receipt-Level Sales" rows={reports.sales.rows.slice(0, 10).map((sale) => [sale.manualReceiptNumber, sale.branch, sale.customer, formatPeso(sale.totalAmount), sale.reviewStatus])} headers={["Receipt", "Branch", "Customer", "Total", "Review"]} />
            <ReportTable title="Flagged Accounting Detail" rows={reports.accounting.flaggedRows.slice(0, 10).map((sale) => [sale.manualReceiptNumber, sale.branch, sale.customer])} headers={["Receipt", "Branch", "Customer"]} />
            <ReportTable title="Customer Orders" rows={reports.orders.rows.slice(0, 10).map((order) => [order.orderNo, order.customer, order.status, formatPeso(order.balance)])} headers={["Order", "Customer", "Status", "Balance"]} />
            <ReportTable title="Inventory Summary" rows={reports.inventory.slice(0, 10).map((item) => [item.itemCode, item.name, item.location, String(item.onHand), String(item.reserved), String(item.available)])} headers={["Code", "Name", "Location", "On Hand", "Reserved", "Available"]} />
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-2 text-sm text-slate-500">{hint}</p></CardContent></Card>;
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2><Badge variant="outline">Live DB</Badge></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b">{headers.map((header) => <th key={header} className="px-3 py-2 text-left font-medium text-slate-500">{header}</th>)}</tr></thead>
            <tbody>{rows.length === 0 ? <tr><td className="px-3 py-6 text-slate-500" colSpan={headers.length}>No rows.</td></tr> : rows.map((row, index) => <tr key={index} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`} className="px-3 py-2">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
