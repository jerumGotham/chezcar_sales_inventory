"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";

import { PageShell } from "@/components/page-shell";
import { useCan } from "@/components/shell-access-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { REPORT_TYPES, type ReportResult, type ReportType } from "@/lib/contracts/reports";

const LABELS: Record<ReportType, string> = {
  sales: "Sales",
  "inventory-summary": "Inventory Summary",
  "inventory-movements": "Inventory Movements",
  "returns-warranty": "Returns & Warranty",
  "low-stock": "Low Stock",
};

type Filters = { type: ReportType; dateFrom: string; dateTo: string; branchId: string; salespersonId: string; source: string; paymentMethod: string; actorId: string };

function manilaToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function initialFilters(): Filters {
  const url = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const today = manilaToday();
  const type = REPORT_TYPES.includes(url.get("type") as ReportType) ? url.get("type") as ReportType : "sales";
  return { type, dateFrom: url.get("dateFrom") ?? (type === "sales" ? `${today.slice(0, 7)}-01` : ""), dateTo: url.get("dateTo") ?? (type === "sales" ? today : ""), branchId: url.get("branchId") ?? "", salespersonId: url.get("salespersonId") ?? "", source: url.get("source") ?? "", paymentMethod: url.get("paymentMethod") ?? "", actorId: url.get("actorId") ?? "" };
}

function paramsFor(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params;
}

async function fetchReport(filters: Filters) {
  const response = await fetch(`/api/reports?${paramsFor(filters)}`, { credentials: "same-origin" });
  const body = await response.json() as { data?: ReportResult; error?: { message?: string } };
  if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Unable to load report");
  return body.data;
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

export default function ReportsPage() {
  const canExport = useCan("reports:export");
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState<Filters>(initialFilters);
  const { data, isLoading, error } = useQuery({ queryKey: ["report", applied], queryFn: () => fetchReport(applied) });
  const isDated = draft.type === "sales" || draft.type === "inventory-movements" || draft.type === "returns-warranty";

  function change<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectType(type: ReportType) {
    const today = manilaToday();
    setDraft((current) => ({ ...current, type, dateFrom: type === "sales" && !current.dateFrom ? `${today.slice(0, 7)}-01` : current.dateFrom, dateTo: type === "sales" && !current.dateTo ? today : current.dateTo, salespersonId: type === "sales" ? current.salespersonId : "", source: type === "sales" ? current.source : "", paymentMethod: type === "sales" ? current.paymentMethod : "", actorId: type === "inventory-movements" ? current.actorId : "" }));
  }

  function applyFilters() {
    setApplied(draft);
    window.history.replaceState(null, "", `${window.location.pathname}?${paramsFor(draft)}`);
  }

  const exportParams = paramsFor(applied);
  exportParams.set("format", "pdf");

  return (
    <PageShell title="Reports" subtitle="Five focused, read-only reports from authorized durable records.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {REPORT_TYPES.map((type) => <Button key={type} size="sm" variant={draft.type === type ? "default" : "outline"} onClick={() => selectType(type)}>{LABELS[type]}</Button>)}
        </div>

        <Card><CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {isDated && <Field label="From"><Input type="date" value={draft.dateFrom} onChange={(event) => change("dateFrom", event.target.value)} /></Field>}
            {isDated && <Field label="To"><Input type="date" value={draft.dateTo} onChange={(event) => change("dateTo", event.target.value)} /></Field>}
            <Field label="Branch"><NativeSelect value={draft.branchId} onChange={(value) => change("branchId", value)} options={data?.filters.branches ?? []} allLabel="All authorized" /></Field>
            {draft.type === "sales" && <Field label="Salesperson"><NativeSelect value={draft.salespersonId} onChange={(value) => change("salespersonId", value)} options={data?.filters.salespersons ?? []} allLabel="All salespersons" /></Field>}
            {draft.type === "sales" && <Field label="Source"><NativeSelect value={draft.source} onChange={(value) => change("source", value)} options={[{ id: "DIRECT_SALE", label: "Direct Sale" }, { id: "CUSTOMER_ORDER", label: "Customer Order" }]} allLabel="All sources" /></Field>}
            {draft.type === "sales" && <Field label="Payment"><NativeSelect value={draft.paymentMethod} onChange={(value) => change("paymentMethod", value)} options={["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"].map((id) => ({ id, label: id.replaceAll("_", " ") }))} allLabel="All methods" /></Field>}
            {draft.type === "inventory-movements" && <Field label="Actor"><NativeSelect value={draft.actorId} onChange={(value) => change("actorId", value)} options={data?.filters.actors ?? []} allLabel="All actors" /></Field>}
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button onClick={applyFilters}>Apply filters</Button>
            {canExport && data && <a href={`/api/reports?${exportParams}`} className={buttonVariants({ variant: "outline" })}><FileText /> Export PDF</a>}
          </div>
        </CardContent></Card>

        {isLoading ? <State><Loader2 className="h-4 w-4 animate-spin" /> Loading report...</State> : error || !data ? <State destructive>{error?.message ?? "Report unavailable"}</State> : <ReportView report={data} />}
      </div>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span>{children}</label>;
}

function NativeSelect({ value, onChange, options, allLabel }: { value: string; onChange: (value: string) => void; options: Array<{ id: string; label: string }>; allLabel: string }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground"><option value="">{allLabel}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
}

function State({ children, destructive = false }: { children: React.ReactNode; destructive?: boolean }) {
  return <Card><CardContent className={`flex items-center gap-2 p-6 text-sm ${destructive ? "text-destructive" : "text-muted-foreground"}`}>{children}</CardContent></Card>;
}

function ReportView({ report }: { report: ReportResult }) {
  if (report.type === "sales") return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Verified transactions" value={String(report.grandTotal.transactionCount)} /><Metric label="Units sold" value={String(report.grandTotal.units)} /><Metric label="Discounts" value={peso.format(report.grandTotal.totalDiscount)} /><Metric label="Average sale" value={peso.format(report.grandTotal.averageSale)} /><Metric label="Grand total" value={peso.format(report.grandTotal.totalAmount)} /></div>
    <Table headers={["Verified", "Receipt", "Branch", "Salesperson", "Source", "Payment", "Customer", "Units", "Discount", "Total"]} rows={report.rows.map((row) => [dateTime.format(new Date(row.verifiedAt)), row.receipt, row.branch, row.salesperson, row.source, row.paymentMethod.replaceAll("_", " "), row.customer, String(row.units), peso.format(row.discountAmount), peso.format(row.totalAmount)])} />
    <Table title="Branch totals" headers={["Branch", "Transactions", "Units", "Sales", "% of Total"]} rows={report.branchTotals.map((row) => [row.branch, String(row.transactionCount), String(row.units), peso.format(row.totalAmount), `${row.percentage.toFixed(1)}%`])} />
  </>;
  if (report.type === "inventory-summary" || report.type === "low-stock") return <>
    {report.type === "inventory-summary" && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="On hand" value={String(report.totals.onHand)} /><Metric label="Reserved" value={String(report.totals.reserved)} /><Metric label="Quarantined" value={String(report.totals.quarantined)} /><Metric label="Available" value={String(report.totals.available)} /></div>}
    <Table headers={["Code", "Product", "Branch", "On hand", "Reserved", "Quarantined", "Available", "Reorder", "Suggested"]} rows={report.rows.map((row) => [row.itemCode, row.product, row.branch, String(row.onHand), String(row.reserved), String(row.quarantined), String(row.available), String(row.reorderLevel), String(row.suggestedReorder)])} />
  </>;
  if (report.type === "inventory-movements") return <Table headers={["Occurred", "Recorded", "Branch", "Code", "Product", "Movement", "Qty", "Actor", "Reference"]} rows={report.rows.map((row) => [dateTime.format(new Date(row.occurredAt)), dateTime.format(new Date(row.createdAt)), row.branch, row.itemCode, row.product, row.type.replaceAll("_", " "), String(row.quantity), row.actor, row.reference])} />;
  return <Table headers={["Created", "Type", "Reference", "Branch", "Party", "Item", "Qty", "Status"]} rows={report.rows.map((row) => [dateTime.format(new Date(row.createdAt)), row.recordType, row.reference, row.branch, row.party, row.item, String(row.quantity), row.status.replaceAll("_", " ")])} />;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>;
}

function Table({ title, headers, rows }: { title?: string; headers: string[]; rows: string[][] }) {
  return <Card className="min-w-0"><CardContent className="p-0">{title && <h2 className="px-4 pt-4 font-semibold">{title}</h2>}<div className="overflow-x-auto"><table className="w-full min-w-max text-sm"><thead><tr className="border-b bg-muted/40">{headers.map((header) => <th key={header} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`} className="max-w-72 px-3 py-2">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-muted-foreground">No rows in the applied scope.</td></tr>}</tbody></table></div></CardContent></Card>;
}
