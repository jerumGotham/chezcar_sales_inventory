"use client";

import { useQuery } from "@tanstack/react-query";
import { Boxes, FileText, Filter, Loader2, Receipt, RefreshCw, RotateCcw, ShieldCheck, TrendingDown, Users, type LucideIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { PageShell } from "@/components/page-shell";
import { TablePagination } from "@/components/table-pagination";
import { useShellAccess } from "@/components/shell-access-context";
import { hasCapability } from "@/lib/permissions";
import type { CapabilityId } from "@/lib/contracts/roles";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  PAYMENT_METHODS,
  FAST_MOVING_DAYS_PER_SALE,
  PRODUCT_STATUSES,
  SALES_VIEWS,
  SALES_VIEW_LABELS,
  REPORT_TYPES,
  RETURN_CASE_TYPES,
  RETURN_RESOLUTIONS,
  RETURN_STATUSES,
  SALE_SOURCES,
  reportMonthEnd,
  type InventorySummaryReport,
  type ReportFilterOptions,
  type ReportResult,
  type ReportType,
  type SalesReport,
  type SalespersonSalesReport,
  type StockMovementReport,
} from "@/lib/contracts/reports";

const LABELS: Record<ReportType, string> = {
  sales: "Sales",
  "salesperson-sales": "Sales by Salesperson",
  "inventory-summary": "Inventory Summary",
  "stock-movement": "Stock Movement",
  "returns-warranty": "Returns & Warranty",
};

const REPORT_ICONS: Record<ReportType, LucideIcon> = {
  sales: Receipt,
  "salesperson-sales": Users,
  "inventory-summary": Boxes,
  "stock-movement": TrendingDown,
  "returns-warranty": ShieldCheck,
};

type Filters = {
  type: ReportType;
  dateFrom: string;
  dateTo: string;
  locationId: string;
  salespersonId: string;
  source: string;
  paymentMethod: string;
  view: string;
  search: string;
  category: string;
  brand: string;
  productStatus: string;
  caseType: string;
  status: string;
  resolution: string;
  entitySearch: string;
  movement: string;
};

const EMPTY_FILTERS: Omit<Filters, "type" | "dateFrom" | "dateTo"> = {
  locationId: "", salespersonId: "", source: "", paymentMethod: "", view: "", search: "", category: "", brand: "",
  productStatus: "", caseType: "", status: "", resolution: "", entitySearch: "", movement: "",
};

function manilaToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function isDated(type: ReportType) {
  return type === "sales" || type === "salesperson-sales" || type === "returns-warranty" || type === "stock-movement";
}

function filtersFromSearchParams(url = new URLSearchParams()): Filters {
  const today = manilaToday();
  const type = REPORT_TYPES.includes(url.get("type") as ReportType) ? url.get("type") as ReportType : "sales";
  // Retired report links open a clean Sales report, not a mix of old filters.
  if (url.has("type") && !REPORT_TYPES.includes(url.get("type") as ReportType)) return filtersFromSearchParams();
  const dateFrom = url.get("dateFrom") ?? `${today.slice(0, 7)}-01`;
  const monthDate = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) && !Number.isNaN(new Date(`${dateFrom}T00:00:00Z`).getTime()) ? dateFrom : today;
  const result: Filters = {
    type,
    dateFrom: isDated(type) ? dateFrom : "",
    dateTo: isDated(type) ? url.get("dateTo") ?? reportMonthEnd(monthDate) : "",
    ...EMPTY_FILTERS,
  };
  for (const key of Object.keys(EMPTY_FILTERS) as Array<keyof typeof EMPTY_FILTERS>) result[key] = url.get(key) ?? "";
  return result;
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

async function fetchOptions(filters: Record<string, string>) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const response = await fetch(`/api/reports/options?${params}`, { credentials: "same-origin" });
  const body = await response.json() as { data?: ReportFilterOptions; error?: { message?: string } };
  if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Unable to load filter options");
  return body.data;
}

function options(values: readonly string[]) {
  return values.map((id) => ({ id, label: id.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }));
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ReportsPage() {
  const ready = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);

  // Keep SSR and hydration identical; mount URL-initialized state only in the browser.
  return (
    <PageShell title="Reports" subtitle="View sales, salesperson totals, available stock, and customer service cases.">
      {ready ? <ReportsContent /> : <State><Loader2 className="h-4 w-4 animate-spin" /> Loading report...</State>}
    </PageShell>
  );
}

function ReportsContent() {
  const access = useShellAccess();
  // A role holds reports one at a time, so the strip only offers what it has
  // and a grant carries its own export with it.
  const permitted = REPORT_TYPES.filter((type) => access.authenticated && hasCapability(access.capabilities, `reports:${type}` as CapabilityId));
  const [draft, setDraft] = useState<Filters>(() => {
    const requested = filtersFromSearchParams(new URLSearchParams(window.location.search));
    return permitted.includes(requested.type) || !permitted.length
      ? requested
      : filtersFromSearchParams(new URLSearchParams({ type: permitted[0] }));
  });
  const [applied, setApplied] = useState<Filters>(draft);
  const [customDateTo, setCustomDateTo] = useState(() => new URLSearchParams(window.location.search).has("dateTo"));
  const { data, isLoading, error } = useQuery({ queryKey: ["report", applied], queryFn: () => fetchReport(applied) });
  const optionFilters = { type: draft.type, locationId: draft.locationId, productStatus: draft.type === "inventory-summary" ? draft.productStatus : "" };
  const { data: filterOptions, isFetching: optionsLoading, error: optionsError, refetch: reloadOptions } = useQuery({
    queryKey: ["report-options", optionFilters], queryFn: () => fetchOptions(optionFilters),
  });

  function change<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeLocation(locationId: string) {
    setDraft((current) => ({ ...current, locationId, salespersonId: "" }));
  }

  function changeDateFrom(dateFrom: string) {
    setDraft((current) => ({
      ...current, dateFrom,
      ...(!customDateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? { dateTo: reportMonthEnd(dateFrom) } : {}),
    }));
  }

  function selectType(type: ReportType) {
    const next = filtersFromSearchParams(new URLSearchParams({ type }));
    setCustomDateTo(false);
    setDraft(next);
    setApplied(next);
    window.history.replaceState(null, "", `${window.location.pathname}?${paramsFor(next)}`);
  }

  function applyFilters() {
    const next = filtersFromSearchParams(paramsFor(draft));
    setDraft(next);
    setApplied(next);
    window.history.replaceState(null, "", `${window.location.pathname}?${paramsFor(next)}`);
  }

  const exportParams = paramsFor(applied);
  if (data?.type === "inventory-summary" && !applied.locationId && data.effectiveScope[0]) exportParams.set("locationId", data.effectiveScope[0].id);
  exportParams.set("format", "pdf");
  const inventoryFilters = draft.type === "inventory-summary";
  const movementFilters = draft.type === "stock-movement";
  const salesFilters = draft.type === "sales" || draft.type === "salesperson-sales";
  const appliedData = data?.type === applied.type ? data : undefined;
  const locationOptions = filterOptions ?? appliedData?.filters;
  const pending = paramsFor(draft).toString() !== paramsFor(applied).toString();

  return (
      <div className="space-y-4">
        <nav aria-label="Report selection" className="flex flex-wrap gap-2">
          {permitted.map((type) => {
            const Icon = REPORT_ICONS[type];
            return <Button key={type} aria-pressed={applied.type === type} className={applied.type === type ? "font-semibold underline underline-offset-4" : undefined} variant={applied.type === type ? "default" : "outline"} onClick={() => selectType(type)}><Icon aria-hidden="true" />{LABELS[type]}</Button>;
          })}
        </nav>

        <Card><CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {isDated(draft.type) && <Field label="From" helper={salesFilters ? (draft.view === "VERIFIED_DATE" ? "Based on verification date (Manila)." : "Based on sale date (Manila).") : movementFilters ? "Sales counted inside this period (Manila)." : "Based on case creation date (Manila)."}><Input type="date" value={draft.dateFrom} onChange={(event) => changeDateFrom(event.target.value)} /></Field>}
            {isDated(draft.type) && <Field label="To" helper="Inclusive; defaults to month-end."><Input type="date" value={draft.dateTo} onChange={(event) => { setCustomDateTo(Boolean(event.target.value)); change("dateTo", event.target.value); }} /></Field>}
            <Field label={inventoryFilters ? "Branch" : "Location"} helper={inventoryFilters ? "Defaults to one branch. Select All Branches to compare." : undefined}>
              <NativeSelect
                value={draft.locationId || (inventoryFilters ? locationOptions?.defaultLocationId ?? "" : "")}
                onChange={changeLocation}
                options={inventoryFilters ? [{ id: "all", label: "All Branches (authorized)" }, ...(locationOptions?.locations ?? [])] : locationOptions?.locations ?? []}
                allLabel={inventoryFilters ? optionsLoading ? "Loading default branch..." : locationOptions?.locations.length ? "Default branch" : "No authorized active branches" : "All authorized"}
              />
            </Field>

            {salesFilters && <Field label="Salesperson"><NativeSelect value={draft.salespersonId} onChange={(value) => change("salespersonId", value)} options={filterOptions?.salespersons ?? []} disabled={optionsLoading || !filterOptions} allLabel={optionsLoading ? "Loading salespersons..." : "All salespersons"} /></Field>}
            {salesFilters && <Field label="Source"><NativeSelect value={draft.source} onChange={(value) => change("source", value)} options={options(SALE_SOURCES)} allLabel="All sources" /></Field>}
            {salesFilters && <Field label="Payment"><NativeSelect value={draft.paymentMethod} onChange={(value) => change("paymentMethod", value)} options={options(PAYMENT_METHODS)} allLabel="All methods" /></Field>}
            {salesFilters && <Field label="View"><NativeSelect value={draft.view} onChange={(value) => change("view", value)} options={SALES_VIEWS.filter((id) => id !== "SALE_DATE").map((id) => ({ id, label: SALES_VIEW_LABELS[id] }))} allLabel={SALES_VIEW_LABELS.SALE_DATE} /></Field>}

            {(inventoryFilters || movementFilters) && <Field label="Item code or name"><Input value={draft.search} onChange={(event) => change("search", event.target.value)} placeholder="Search product" /></Field>}
            {(inventoryFilters || movementFilters) && <Field label="Category"><NativeSelect value={draft.category} onChange={(value) => change("category", value)} options={filterOptions?.categories ?? []} disabled={optionsLoading || !filterOptions} allLabel="All categories" /></Field>}
            {(inventoryFilters || movementFilters) && <Field label="Brand"><NativeSelect value={draft.brand} onChange={(value) => change("brand", value)} options={filterOptions?.brands ?? []} disabled={optionsLoading || !filterOptions} allLabel="All brands" /></Field>}
            {movementFilters && <Field label="Movement" helper="No movement first shows stock nobody bought."><NativeSelect value={draft.movement} onChange={(value) => change("movement", value)} options={[{ id: "NO_MOVEMENT", label: "No movement" }, { id: "SLOW", label: "Slow moving" }, { id: "FAST", label: "Fast moving" }]} allLabel="All movement" /></Field>}
            {draft.type === "inventory-summary" && <Field label="Product status"><NativeSelect value={draft.productStatus} onChange={(productStatus) => setDraft((current) => ({ ...current, productStatus, category: "", brand: "" }))} options={options(PRODUCT_STATUSES)} allLabel="All statuses" /></Field>}

            {draft.type === "returns-warranty" && <Field label="Case type"><NativeSelect value={draft.caseType} onChange={(value) => change("caseType", value)} options={options(RETURN_CASE_TYPES)} allLabel="All case types" /></Field>}
            {draft.type === "returns-warranty" && <Field label="Status"><NativeSelect value={draft.status} onChange={(value) => change("status", value)} options={options(RETURN_STATUSES)} allLabel="All statuses" /></Field>}
            {draft.type === "returns-warranty" && <Field label="Resolution"><NativeSelect value={draft.resolution} onChange={(value) => change("resolution", value)} options={options(RETURN_RESOLUTIONS)} allLabel="All resolutions" /></Field>}
            {draft.type === "returns-warranty" && <Field label="Customer, supplier, product, staff"><Input value={draft.entitySearch} onChange={(event) => change("entitySearch", event.target.value)} placeholder="Search relevant entity" /></Field>}
          </div>
          {optionsError && <div className="mt-3 flex items-center gap-2 text-xs text-destructive" role="alert">{optionsError.message}<Button size="sm" variant="outline" onClick={() => reloadOptions()}><RefreshCw aria-hidden="true" />Retry options</Button></div>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <p className="mr-auto self-center text-xs text-muted-foreground">{pending ? "Unapplied changes. Results and PDF still use the applied filters." : `Editing filters for ${LABELS[draft.type]}`}</p>
            <Button variant="outline" onClick={() => { setDraft(filtersFromSearchParams(new URLSearchParams({ type: draft.type }))); setCustomDateTo(false); }}><RotateCcw aria-hidden="true" />Reset filters</Button>
            <Button onClick={applyFilters}><Filter aria-hidden="true" />Apply Filters</Button>
            {appliedData && <a href={`/api/reports?${exportParams}`} className={buttonVariants({ variant: "outline" })}><FileText aria-hidden="true" /> Export {LABELS[applied.type]} PDF</a>}
          </div>
        </CardContent></Card>

        {isLoading ? <State><Loader2 className="h-4 w-4 animate-spin" /> Loading {LABELS[applied.type]} report...</State> : error || !appliedData ? <State destructive>{error?.message ?? `${LABELS[applied.type]} report unavailable`}</State> : <><h2 className="text-lg font-semibold">{LABELS[appliedData.type]} Report</h2><p className="text-xs text-muted-foreground">Applied scope: {appliedData.effectiveScope.map((location) => location.label).join(", ") || "No authorized locations"}{appliedData.dateFrom ? ` | ${appliedData.dateFrom} to ${appliedData.dateTo}` : " | Current snapshot"}</p><ReportView key={paramsFor(applied).toString()} report={appliedData} /></>}
      </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-xs font-medium text-muted-foreground"><span>{label}</span>{children}{helper && <span className="block text-[11px] font-normal">{helper}</span>}</label>;
}

function NativeSelect({ value, onChange, options: rows, allLabel, disabled = false }: { value: string; onChange: (value: string) => void; options: Array<{ id: string; label: string }>; allLabel: string; disabled?: boolean }) {
  return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground disabled:opacity-60"><option value="">{allLabel}</option>{value && !rows.some((row) => row.id === value) && <option value={value}>{value}</option>}{rows.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
}

/**
 * A printed report has to admit what it is missing: money the branch collected
 * inside the period that Accounting has not confirmed, and so is not counted.
 */
function PendingNotice({ report }: { report: SalesReport | SalespersonSalesReport }) {
  // Once unverified receipts are on the page they speak for themselves; the
  // banner is for the default view, where they are missing without a word.
  if (report.view === "VERIFIED_DATE") {
    if (report.pending.count === 0) return null;
    return (
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
          <strong>{report.pending.count} receipt(s)</strong> issued in this period are still unverified, worth {peso.format(report.pending.amount)}. They are not counted in the totals below and will appear once Accounting confirms them.
        </CardContent>
      </Card>
    );
  }
  if (report.view === "UNVERIFIED") {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
          Every receipt here is waiting on Accounting. Nothing on this page is verified revenue: it is {peso.format(report.unverifiedTotal.totalAmount)} the branches say they collected.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
      <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
        This view mixes both. Verified: <strong>{peso.format(report.verifiedTotal.totalAmount)}</strong> across {report.verifiedTotal.transactionCount} receipt(s). Not verified: <strong>{peso.format(report.unverifiedTotal.totalAmount)}</strong> across {report.unverifiedTotal.transactionCount} receipt(s). Present the verified figure as revenue; the rest is money the branch says it holds.
      </CardContent>
    </Card>
  );
}

/**
 * What sold, what did not, and a blank column to write the shelf count in. The
 * slowest rows come first, because the point of a monthly review is finding the
 * stock nobody is buying.
 */
function StockMovementView({ report }: { report: StockMovementReport }) {
  const { totals } = report;
  return <>
    <p className="text-sm text-muted-foreground">
      Sold counts every posted sale in the period, voided sales excluded, so it matches what actually left the shelf whether or not Accounting has verified the receipt yet. Sells every is how often one unit moved across the {report.periodDays} days in this period: a product selling at least once every {FAST_MOVING_DAYS_PER_SALE} days is Fast, slower than that is Slow, and nothing sold at all is NO MOVEMENT. Print this to count against: the PDF carries blank Actual and Variance columns.
    </p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="No movement" value={String(totals.noMovementCount)} />
      <Metric label="Slow moving" value={String(totals.slowCount)} />
      <Metric label="Fast moving" value={String(totals.fastCount)} />
      <Metric label="Units sold" value={String(totals.soldUnits)} />
      <Metric label="Sales value" value={peso.format(totals.soldAmount)} />
      <Metric label="On hand" value={String(totals.onHand)} />
      <Metric label="Available" value={String(totals.available)} />
      <Metric label="Products" value={String(totals.productCount)} />
    </div>
    <Table
      numericFrom={4}
      headers={["Item code", "Product", "Branch", "Movement", "On hand", "Reserved", "Available", "Sold", "Sales value", "Sells every", "Last sold", "Actual", "Variance"]}
      rows={report.rows.map((row) => [
        row.itemCode, row.product, row.branch, MOVEMENT_LABELS[row.grade],
        String(row.onHand), String(row.reserved), String(row.available), String(row.soldUnits),
        peso.format(row.soldAmount),
        row.daysPerSale === null ? "-" : `${row.daysPerSale.toFixed(1)} days`,
        row.lastSoldAt ? dateTime.format(new Date(row.lastSoldAt)) : "Never",
        "", "",
      ])}
      footerRow={["OVERALL TOTAL", "", "", "", String(totals.onHand), "", String(totals.available), String(totals.soldUnits), peso.format(totals.soldAmount), "", "", "", ""]}
    />
  </>;
}

const MOVEMENT_LABELS = { FAST: "Fast", SLOW: "Slow", NO_MOVEMENT: "NO MOVEMENT" } as const;

// The headline figure names what it actually adds up in each view.
const TOTAL_LABELS: Record<string, string> = {
  SALE_DATE: "Combined total",
  VERIFIED_DATE: "Verified sales",
  UNVERIFIED: "Not verified total",
};

function State({ children, destructive = false }: { children: React.ReactNode; destructive?: boolean }) {
  return <Card><CardContent className={`flex items-center gap-2 p-6 text-sm ${destructive ? "text-destructive" : "text-muted-foreground"}`}>{children}</CardContent></Card>;
}

function ReportView({ report }: { report: ReportResult }) {
  if (report.type === "salesperson-sales") {
    const salesByPerson = new Map<string | null, SalesReport["rows"]>();
    for (const row of report.rows) {
      const group = salesByPerson.get(row.salespersonId) ?? [];
      group.push(row);
      salesByPerson.set(row.salespersonId, group);
    }
    return <>
      <PendingNotice report={report} />
      <p className="text-sm text-muted-foreground">See which receipts belong to each salesperson and their total verified sales. This is sales attribution, not a commission or payment report. Older sales without attribution appear under Not recorded (legacy).</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Receipts" value={String(report.grandTotal.transactionCount)} /><Metric label="Units sold" value={String(report.grandTotal.units)} /><Metric label="Discounts" value={peso.format(report.grandTotal.totalDiscount)} /><Metric label="Average sale" value={peso.format(report.grandTotal.averageSale)} /><Metric label={TOTAL_LABELS[report.view]} value={peso.format(report.grandTotal.totalAmount)} /></div>
      <Table title="Salesperson totals" numericFrom={1} headers={["Salesperson", "Receipts", "Units", "Discounts", "Average sale", "Sales", "% of grand total"]} rows={report.salespersonTotals.map((row) => [row.salesperson, String(row.transactionCount), String(row.units), peso.format(row.totalDiscount), peso.format(row.averageSale), peso.format(row.totalAmount), `${row.percentage.toFixed(1)}%`])} footerRow={["OVERALL TOTAL", String(report.grandTotal.transactionCount), String(report.grandTotal.units), peso.format(report.grandTotal.totalDiscount), peso.format(report.grandTotal.averageSale), peso.format(report.grandTotal.totalAmount), report.grandTotal.totalAmount ? "100.0%" : "0.0%"]} />
      {report.salespersonTotals.map((group) => <Table key={group.salespersonId ?? "unattributed"} title={`${group.salesperson} - ${group.transactionCount} receipt(s)`} numericFrom={8} headers={["Sold", "Verified on", "Manual receipt", "Branch", "Customer", "Salesperson on receipt", "Encoder", "Source", "Payment", "Units", "Discount", "Final amount"]} rows={(salesByPerson.get(group.salespersonId) ?? []).map((row) => [dateTime.format(new Date(row.soldAt)), row.verifiedAt ? dateTime.format(new Date(row.verifiedAt)) : <span className="font-medium text-red-600 dark:text-red-400">Not verified</span>, row.manualReceiptNumber, row.branch, row.customer, row.salesperson, row.encoder, row.source, humanize(row.paymentMethod), String(row.units), peso.format(row.discountAmount), peso.format(row.totalAmount)])} footerRow={["SALESPERSON TOTAL", "", "", "", "", "", "", "", "", String(group.units), peso.format(group.totalDiscount), peso.format(group.totalAmount)]} />)}
    </>;
  }
  if (report.type === "sales") return <>
    <PendingNotice report={report} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Receipts" value={String(report.grandTotal.transactionCount)} /><Metric label="Units sold" value={String(report.grandTotal.units)} /><Metric label="Discounts" value={peso.format(report.grandTotal.totalDiscount)} /><Metric label="Average sale" value={peso.format(report.grandTotal.averageSale)} /><Metric label={TOTAL_LABELS[report.view]} value={peso.format(report.grandTotal.totalAmount)} /></div>
    <Table headers={["Sold", "Verified on", "Manual receipt", "Branch", "Customer", "Salesperson", "Encoder", "Source", "Payment", "Units", "Discount", "Final amount"]} rows={report.rows.map((row) => [dateTime.format(new Date(row.soldAt)), row.verifiedAt ? dateTime.format(new Date(row.verifiedAt)) : <span className="font-medium text-red-600 dark:text-red-400">Not verified</span>, row.manualReceiptNumber, row.branch, row.customer, row.salesperson, row.encoder, row.source, humanize(row.paymentMethod), String(row.units), peso.format(row.discountAmount), peso.format(row.totalAmount)])} />
    <Table title="Branch totals" headers={["Branch", "Receipts", "Units", "Sales", "% of grand total"]} rows={report.branchTotals.map((row) => [row.branch, String(row.transactionCount), String(row.units), peso.format(row.totalAmount), `${row.percentage.toFixed(1)}%`])} />
  </>;
  if (report.type === "inventory-summary") return <InventoryView report={report} />;
  if (report.type === "stock-movement") return <StockMovementView report={report} />;
  return <>
    <p className="text-sm text-muted-foreground">Backjob charges are recorded case amounts, not collected payments or additional Sales revenue. Supplier refunds and credits are separate claim tracking, not ledger totals. Amounts follow the applied case filters, including status.</p>
    <p className="text-sm text-muted-foreground">Backjobs list all original items in one case row. Their affected-unit quantity is not recorded; original item selections are not unit counts.</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Total cases" value={String(report.totals.total)} /><Metric label="Open" value={String(report.totals.open)} /><Metric label="Completed" value={String(report.totals.completed)} /><Metric label="Overdue" value={String(report.totals.overdue)} /><Metric label="Unresolved quarantine" value={String(report.totals.unresolvedQuarantinedQuantity)} /><Metric label="Backjob charges recorded" value={peso.format(report.totals.backjobChargeAmount)} /><Metric label="Supplier refunds tracked" value={peso.format(report.totals.supplierRefundAmount)} /><Metric label="Supplier credits tracked" value={peso.format(report.totals.supplierCreditAmount)} /></div>
    <Table title="Counts by type" headers={["Type", "Count"]} rows={report.totals.byType.map((row) => [row.label, String(row.count)])} />
    <Table title="Counts by status, branch, and resolution" headers={["Group", "Value", "Count"]} rows={[...report.totals.byStatus.map((row) => ["Status", humanize(row.label), String(row.count)]), ...report.totals.byBranch.map((row) => ["Branch", row.label, String(row.count)]), ...report.totals.byResolution.map((row) => ["Resolution", humanize(row.label), String(row.count)])]} />
    <Table headers={["Case date", "Type", "Reference", "Original reference", "Location", "Customer / supplier", "Product", "Case quantity", "Assigned personnel", "Salesperson", "Status", "Resolution", "Target", "Overdue", "Linked case", "Unresolved quarantine", "Backjob charge recorded", "Supplier refund", "Supplier credit"]} rows={report.rows.map((row) => [dateTime.format(new Date(row.caseDate)), row.recordType, row.reference, row.originalReference, row.branch, row.party, row.product, row.quantity === null ? "Not recorded" : String(row.quantity), row.assignedPersonnel, row.salesperson, humanize(row.status), humanize(row.resolution), row.targetDate ? dateTime.format(new Date(row.targetDate)) : "", row.overdue ? "Yes" : "No", row.linkedCase, String(row.unresolvedQuarantinedQuantity), row.backjobChargeAmount === null ? "Not applicable" : peso.format(row.backjobChargeAmount), peso.format(row.supplierRefundAmount), peso.format(row.supplierCreditAmount)])} />
  </>;
}

function InventoryView({ report }: { report: InventorySummaryReport }) {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(report.rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const comparison = report.effectiveScope.length > 1;
  const headers = ["Code", "Product", "Category", "Brand", ...(comparison ? report.effectiveScope.map((location) => location.label) : []), comparison ? "Total available" : "Available"];
  const totals = ["FULL FILTERED TOTAL", "", "", "", ...(comparison ? report.branchTotals.map((total) => String(total.available)) : []), String(report.totals.available)];
  return <>
    <p className="text-sm text-muted-foreground">Available = on hand minus reserved and quarantined. Only products with positive available stock in the selected branches are included, once per product. Comparison cells show 0 where no positive stock is available. In-transit stock is excluded.</p>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Products (full filtered set)" value={String(report.totals.productCount)} /><Metric label="Branches in scope" value={String(report.totals.locationCount)} /><Metric label="Available units (full filtered set)" value={String(report.totals.available)} /></div>
    <nav aria-label="Inventory products pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">{report.rows.length ? `${start + 1}-${Math.min(start + pageSize, report.rows.length)}` : "0"} of {report.rows.length} products | 25 per page. Totals and PDF include all filtered products.</p>
      <TablePagination page={currentPage} totalPages={pageCount} onPageChange={setPage} />
    </nav>
    <Table headers={headers} numericFrom={4} footerRow={totals} rows={report.rows.slice(start, start + pageSize).map((row) => [row.itemCode, row.product, row.category, row.brand, ...(comparison ? report.effectiveScope.map((location) => String(row.availableByLocation[location.id])) : []), String(row.available)])} />
  </>;
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>;
}

function Table({ title, headers, rows, footerRow, numericFrom = Infinity }: { title?: string; headers: string[]; rows: React.ReactNode[][]; footerRow?: string[]; numericFrom?: number }) {
  return <Card className="min-w-0"><CardContent className="p-0">{title && <h2 className="px-4 pt-4 font-semibold">{title}</h2>}<div className="overflow-x-auto"><table className="w-full min-w-max text-sm"><thead><tr className="border-b bg-muted/40">{headers.map((header, index) => <th key={`${header}-${index}`} className={`px-3 py-2 text-xs font-medium text-muted-foreground ${index >= numericFrom ? "text-right" : "text-left"}`}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`} className={`max-w-72 px-3 py-2 ${cellIndex >= numericFrom ? "text-right tabular-nums" : ""}`}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-muted-foreground">No rows in the applied scope.</td></tr>}</tbody>{footerRow && <tfoot><tr className="border-t bg-muted/40 font-semibold">{footerRow.map((cell, index) => <td key={index} className={`px-3 py-2 ${index >= numericFrom ? "text-right tabular-nums" : ""}`}>{cell}</td>)}</tr></tfoot>}</table></div></CardContent></Card>;
}
