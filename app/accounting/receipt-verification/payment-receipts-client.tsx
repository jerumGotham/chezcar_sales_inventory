"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";
import type { StylesConfig } from "react-select";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/components/shell-access-context";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

type PaymentRow = {
  id: string;
  reference: string;
  kind: string;
  kindLabel: string;
  status: "ACTIVE" | "VOIDED";
  branch: string;
  customer: string;
  orderReference: string | null;
  orderTotal: number | null;
  orderBalance: number | null;
  amount: number;
  method: string;
  receiptNumber: string;
  notes: string | null;
  salesperson: string | null;
  collectedBy: string;
  collectedAt: string;
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "MISMATCH_REPORTED";
  verifiedAt: string | null;
  mismatchCategory: string | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  receiptPhotoUrl: string | null;
  receiptPhotoVersion: string | null;
  branchResponse: string | null;
  branchResponseNote: string | null;
  branchReplacementReceiptNumber: string | null;
  branchRespondedBy: string | null;
  branchRespondedAt: string | null;
  resolutionAction: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  voidReason: string | null;
  voidedAt: string | null;
};

type PaymentResponse = {
  data: PaymentRow[];
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number; unverified: number; verified: number; mismatches: number; missingEvidence: number };
  branches: Array<{ id: string; code: string; name: string }>;
};

type Filters = {
  page: number;
  search: string;
  reviewStatus: string;
  locationId: string;
  dateFrom: string;
  dateTo: string;
  paymentId: string;
};

const REVIEW_STATUS_OPTIONS: Option[] = [
  { value: "all", label: "All review states" },
  { value: "UNVERIFIED", label: "Unverified" },
  { value: "MISMATCH_REPORTED", label: "Mismatch reported" },
  { value: "VERIFIED", label: "Verified" },
];

const MISMATCH_OPTIONS: Option[] = [
  { value: "AMOUNT_MISMATCH", label: "Amount does not match the receipt" },
  { value: "RECEIPT_NOT_FOUND", label: "Receipt was not submitted" },
  { value: "DUPLICATE_RECEIPT", label: "Receipt number was already used" },
  { value: "OTHER", label: "Other" },
];

const BRANCH_RESPONSE_OPTIONS: Option[] = [
  { value: "ORIGINAL_ENCODING_CORRECT", label: "The recorded payment is correct" },
  { value: "RECEIPT_CORRECTION_NEEDED", label: "The receipt needs correction" },
  { value: "WRONG_RECEIPT_PHOTO", label: "The wrong receipt photo was attached" },
  { value: "PAYMENT_ENCODED_INCORRECTLY", label: "The payment was encoded incorrectly" },
];

const selectStyles: StylesConfig<Option, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: "40px",
    borderRadius: "0.75rem",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--border))",
    boxShadow: "none",
    backgroundColor: "hsl(var(--background))",
  }),
  menu: (base) => ({ ...base, zIndex: 40, borderRadius: "0.75rem", overflow: "hidden" }),
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });

function humanize(value: string | null) {
  if (!value) return "-";
  return value.toLowerCase().replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}

async function fetchPayments(filters: Filters): Promise<PaymentResponse> {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: "10" });
  if (filters.search) params.set("search", filters.search);
  if (filters.reviewStatus !== "all") params.set("reviewStatus", filters.reviewStatus);
  if (filters.locationId) params.set("locationId", filters.locationId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.paymentId) params.set("paymentId", filters.paymentId);
  const response = await fetch(`/api/accounting/payments?${params.toString()}`, { credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Unable to load payment receipts");
  return json as PaymentResponse;
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "The request could not be completed");
  return json.data;
}

function StatusBadge({ row }: { row: Pick<PaymentRow, "reviewStatus" | "status"> }) {
  // A voided receipt is neither verified nor waiting, so it says so plainly
  // rather than sitting in the queue looking like work still to do.
  if (row.status === "VOIDED") return <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200">Voided</Badge>;
  if (row.reviewStatus === "VERIFIED") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Verified</Badge>;
  if (row.reviewStatus === "MISMATCH_REPORTED") return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Mismatch</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Unverified</Badge>;
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "amber" | "rose" | "emerald" }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;
  return (
    <div className={cn("rounded-xl border p-4", tones[tone])}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function PaymentReceiptsClient({ linkedPaymentId }: { linkedPaymentId: string }) {
  const canViewEvidence = useCan("sales:evidence:view");
  const canReview = useCan("sales:verify") && canViewEvidence;
  const canRespond = useCan("sales:mismatch:respond");
  const canResolve = useCan("sales:resolve");
  const canVoid = useCan("sales:void-replace");
  const canUpload = useCan("sales:evidence:upload");
  const canDelete = useCan("sales:evidence:delete");

  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [reviewStatusDraft, setReviewStatusDraft] = useState<Option>(REVIEW_STATUS_OPTIONS[0]);
  const [locationDraft, setLocationDraft] = useState<Option | null>(null);
  const [dateFromDraft, setDateFromDraft] = useState("");
  const [dateToDraft, setDateToDraft] = useState("");
  const [filters, setFilters] = useState<Filters>({
    page: 1,
    search: "",
    reviewStatus: "all",
    locationId: "",
    dateFrom: "",
    dateTo: "",
    paymentId: linkedPaymentId,
  });
  const [selectedId, setSelectedId] = useState<string | null>(linkedPaymentId || null);
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [mismatchCategory, setMismatchCategory] = useState<Option>(MISMATCH_OPTIONS[0]);
  const [reviewNotes, setReviewNotes] = useState("");
  const [branchResponse, setBranchResponse] = useState<Option>(BRANCH_RESPONSE_OPTIONS[0]);
  const [branchNote, setBranchNote] = useState("");
  const [replacementReceipt, setReplacementReceipt] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // Every action refreshed the list and said nothing, so a verify that worked
  // looked the same as one that never fired.
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["accounting-payments", filters],
    queryFn: () => fetchPayments(filters),
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  // Falling back to the first row keeps a receipt open as filters change without
  // an effect writing state back into the render that produced it.
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  // A newly opened receipt starts from what the branch recorded, so the reviewer
  // changes only what the paper actually disagrees with.
  const [draftFor, setDraftFor] = useState<string | null>(null);
  if (selected && draftFor !== selected.id) {
    setDraftFor(selected.id);
    setReceiptAmount(String(selected.amount));
    setReceiptNumber(selected.receiptNumber);
    setReviewNotes("");
    setBranchNote("");
    setReplacementReceipt("");
    setResolutionNote("");
    setFormError(null);
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["accounting-payments"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selected) throw new Error("Select a payment receipt first.");
      const body = new FormData();
      body.append("photo", file);
      const response = await fetch(`/api/accounting/payments/${selected.id}/photo`, { method: "POST", credentials: "same-origin", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to upload the receipt photo");
      return json.data;
    },
    onSuccess: async () => {
      if (photoInputRef.current) photoInputRef.current.value = "";
      setFormNotice("Receipt photo uploaded.");
      await refresh();
    },
    onError: (mutationError: Error) => { setFormNotice(null); setFormError(mutationError.message); },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async () => {
      if (!selected?.receiptPhotoVersion) throw new Error("There is no receipt photo to delete.");
      const response = await fetch(`/api/accounting/payments/${selected.id}/photo`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: selected.receiptPhotoVersion }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to delete the receipt photo");
      return json.data;
    },
    onSuccess: async () => { setFormNotice("Receipt photo deleted."); await refresh(); },
    onError: (mutationError: Error) => { setFormNotice(null); setFormError(mutationError.message); },
  });

  const reviewMutation = useMutation({
    mutationFn: (status: "VERIFIED" | "MISMATCH_REPORTED") =>
      post(`/api/accounting/payments/${selected!.id}/review`, {
        status,
        ...(status === "MISMATCH_REPORTED" ? { mismatchCategory: mismatchCategory.value, notes: reviewNotes } : {}),
        receiptAmount: Number(receiptAmount),
        receiptNumber,
      }),
    onSuccess: async (_, status) => { setFormNotice(status === "VERIFIED" ? "Payment receipt verified." : "Mismatch reported. The branch has been asked to respond."); await refresh(); },
    onError: (mutationError: Error) => { setFormNotice(null); setFormError(mutationError.message); },
  });

  const branchResponseMutation = useMutation({
    mutationFn: () =>
      post(`/api/accounting/payments/${selected!.id}/branch-response`, {
        response: branchResponse.value,
        note: branchNote,
        ...(replacementReceipt.trim() ? { replacementReceiptNumber: replacementReceipt.trim() } : {}),
      }),
    onSuccess: async () => { setFormNotice("Response sent to Accounting."); await refresh(); },
    onError: (mutationError: Error) => { setFormNotice(null); setFormError(mutationError.message); },
  });

  const resolveMutation = useMutation({
    mutationFn: (action: "CONFIRMED_CORRECT" | "VOIDED") =>
      post(`/api/accounting/payments/${selected!.id}/resolve`, { action, note: resolutionNote }),
    onSuccess: async (_, action) => { setFormNotice(action === "CONFIRMED_CORRECT" ? "Original encoding confirmed. The payment is now verified." : "Payment voided."); await refresh(); },
    onError: (mutationError: Error) => { setFormNotice(null); setFormError(mutationError.message); },
  });

  const branchOptions = useMemo<Option[]>(
    () => (data?.branches ?? []).map((branch) => ({ value: branch.id, label: `${branch.code} - ${branch.name}` })),
    [data],
  );

  function applyFilters() {
    setFilters({
      page: 1,
      search: searchDraft.trim(),
      reviewStatus: reviewStatusDraft.value,
      locationId: locationDraft?.value ?? "",
      dateFrom: dateFromDraft,
      dateTo: dateToDraft,
      paymentId: "",
    });
    setSelectedId(null);
  }

  function clearFilters() {
    setSearchDraft("");
    setReviewStatusDraft(REVIEW_STATUS_OPTIONS[0]);
    setLocationDraft(null);
    setDateFromDraft("");
    setDateToDraft("");
    setFilters({ page: 1, search: "", reviewStatus: "all", locationId: "", dateFrom: "", dateTo: "", paymentId: "" });
    setSelectedId(null);
  }

  const meta = data?.meta;
  const busy = reviewMutation.isPending || branchResponseMutation.isPending || resolveMutation.isPending || uploadMutation.isPending || deletePhotoMutation.isPending;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Downpayments and later order payments are verified here. A sale receipt keeps its own tab, so the same piece of paper is never reviewed twice.
      </p>

      {meta ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Photo pending" value={meta.missingEvidence} tone="amber" />
          <SummaryCard label="Unverified" value={meta.unverified} tone="amber" />
          <SummaryCard label="Mismatch reported" value={meta.mismatches} tone="rose" />
          <SummaryCard label="Verified" value={meta.verified} tone="emerald" />
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-6">
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor="payment-search">Receipt, order, or customer</Label>
            <Input id="payment-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="OR-000123" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-review-status">Review state</Label>
            <Select
              inputId="payment-review-status"
              instanceId="payment-review-status"
              options={REVIEW_STATUS_OPTIONS}
              value={reviewStatusDraft}
              onChange={(option) => setReviewStatusDraft(option ?? REVIEW_STATUS_OPTIONS[0])}
              styles={selectStyles}
              isSearchable
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-branch">Branch</Label>
            <Select
              inputId="payment-branch"
              instanceId="payment-branch"
              options={branchOptions}
              value={locationDraft}
              onChange={(option) => setLocationDraft(option)}
              styles={selectStyles}
              isClearable
              isSearchable
              placeholder="All branches"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-date-from">Collected from</Label>
            <Input id="payment-date-from" type="date" value={dateFromDraft} onChange={(event) => setDateFromDraft(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-date-to">Collected to</Label>
            <Input id="payment-date-to" type="date" value={dateToDraft} onChange={(event) => setDateToDraft(event.target.value)} />
          </div>
          <div className="flex items-end gap-2 lg:col-span-6">
            <Button onClick={applyFilters}>Apply Filters</Button>
            <Button variant="outline" onClick={clearFilters}>Clear</Button>
            {isFetching ? <span className="text-xs text-muted-foreground">Refreshing...</span> : null}
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-600">{(error as Error).message}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Customer / order</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">State</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td className="px-4 py-6 text-muted-foreground" colSpan={6}>Loading payment receipts...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td className="px-4 py-6 text-muted-foreground" colSpan={6}>No payment receipts match these filters.</td></tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedId(row.id)}
                        className={cn("cursor-pointer border-t transition-colors hover:bg-muted/40", row.id === selectedId && "bg-muted/60")}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.receiptNumber}</p>
                          <p className="text-xs text-muted-foreground">{dateTime.format(new Date(row.collectedAt))}</p>
                        </td>
                        <td className="px-4 py-3">{row.kindLabel}</td>
                        <td className="px-4 py-3">
                          <p>{row.customer}</p>
                          <p className="text-xs text-muted-foreground">{row.orderReference ?? "-"}</p>
                        </td>
                        <td className="px-4 py-3">{row.branch}</td>
                        <td className="px-4 py-3 text-right font-medium">{peso.format(row.amount)}</td>
                        <td className="px-4 py-3"><StatusBadge row={row} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {meta && meta.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">Page {meta.page} of {meta.totalPages} · {meta.totalItems} receipt(s)</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Select a payment receipt to review it.</p>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">{selected.receiptNumber}</h2>
                    <StatusBadge row={selected} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selected.kindLabel} · {selected.branch} · collected by {selected.collectedBy}
                  </p>
                  {selected.status === "VOIDED" ? (
                    <p className="text-sm text-rose-600">This payment was voided. {selected.voidReason}</p>
                  ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-3 rounded-xl border p-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Amount recorded</dt><dd className="font-medium">{peso.format(selected.amount)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Payment method</dt><dd>{humanize(selected.method)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Customer</dt><dd>{selected.customer}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Order</dt><dd>{selected.orderReference ?? "-"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Order total</dt><dd>{selected.orderTotal === null ? "-" : peso.format(selected.orderTotal)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Balance now</dt><dd>{selected.orderBalance === null ? "-" : peso.format(selected.orderBalance)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Salesperson</dt><dd>{selected.salesperson ?? "-"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Collected</dt><dd>{dateTime.format(new Date(selected.collectedAt))}</dd></div>
                </dl>

                <div className="space-y-2">
                  <Label>Receipt photo</Label>
                  {selected.receiptPhotoUrl && canViewEvidence ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.receiptPhotoUrl} alt={`Receipt ${selected.receiptNumber}`} className="max-h-72 w-full rounded-xl border object-contain" />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {selected.receiptPhotoUrl ? "You do not have permission to view receipt photos." : "No receipt photo attached yet."}
                    </p>
                  )}
                  {canUpload && selected.reviewStatus !== "VERIFIED" && selected.status === "ACTIVE" ? (
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="block w-full text-sm"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadMutation.mutate(file);
                      }}
                    />
                  ) : null}
                  {canDelete && selected.receiptPhotoUrl && selected.reviewStatus === "UNVERIFIED" && !selected.reviewedAt ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => deletePhotoMutation.mutate()}>Delete photo</Button>
                  ) : null}
                </div>

                {selected.reviewStatus === "UNVERIFIED" && canReview && selected.status === "ACTIVE" ? (
                  <div className="space-y-3 rounded-xl border p-3">
                    <p className="text-sm font-medium">What does the receipt say?</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="payment-receipt-amount">Amount on receipt</Label>
                        <Input id="payment-receipt-amount" type="number" step="0.01" min="0" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="payment-receipt-number">Receipt number</Label>
                        <Input id="payment-receipt-number" value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} maxLength={100} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="payment-mismatch-category">If it does not match</Label>
                      <Select
                        inputId="payment-mismatch-category"
                        instanceId="payment-mismatch-category"
                        options={MISMATCH_OPTIONS}
                        value={mismatchCategory}
                        onChange={(option) => setMismatchCategory(option ?? MISMATCH_OPTIONS[0])}
                        styles={selectStyles}
                        isSearchable
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="payment-review-notes">Notes</Label>
                      <Textarea id="payment-review-notes" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={3} placeholder="Required when reporting a mismatch" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy || !selected.receiptPhotoUrl} onClick={() => reviewMutation.mutate("VERIFIED")}>Confirm Correct</Button>
                      <Button variant="destructive" disabled={busy || !selected.receiptPhotoUrl || !reviewNotes.trim()} onClick={() => reviewMutation.mutate("MISMATCH_REPORTED")}>Report Mismatch</Button>
                    </div>
                    {!selected.receiptPhotoUrl ? (
                      <p className="text-xs text-muted-foreground">Attach the receipt photo before reviewing.</p>
                    ) : null}
                  </div>
                ) : null}

                {selected.reviewStatus === "MISMATCH_REPORTED" && selected.status === "ACTIVE" ? (
                  <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                    <p className="text-sm font-medium text-rose-900">
                      Mismatch: {humanize(selected.mismatchCategory)}
                    </p>
                    <p className="text-sm text-rose-900">{selected.reviewNotes}</p>
                    <p className="text-xs text-rose-800">
                      Reported by {selected.reviewedBy ?? "-"}{selected.reviewedAt ? ` on ${dateTime.format(new Date(selected.reviewedAt))}` : ""}
                    </p>

                    {selected.branchRespondedAt ? (
                      <div className="rounded-lg border bg-background p-3 text-sm">
                        <p className="font-medium">Branch finding: {humanize(selected.branchResponse)}</p>
                        <p>{selected.branchResponseNote}</p>
                        {selected.branchReplacementReceiptNumber ? <p className="text-xs text-muted-foreground">Replacement receipt: {selected.branchReplacementReceiptNumber}</p> : null}
                        <p className="text-xs text-muted-foreground">
                          {selected.branchRespondedBy} on {dateTime.format(new Date(selected.branchRespondedAt))}
                        </p>
                      </div>
                    ) : canRespond && !selected.resolvedAt ? (
                      <div className="space-y-2 rounded-lg border bg-background p-3">
                        <Label htmlFor="payment-branch-response">Branch finding</Label>
                        <Select
                          inputId="payment-branch-response"
                          instanceId="payment-branch-response"
                          options={BRANCH_RESPONSE_OPTIONS}
                          value={branchResponse}
                          onChange={(option) => setBranchResponse(option ?? BRANCH_RESPONSE_OPTIONS[0])}
                          styles={selectStyles}
                          isSearchable
                        />
                        <Textarea value={branchNote} onChange={(event) => setBranchNote(event.target.value)} rows={3} placeholder="Explain what the branch found" />
                        <Input value={replacementReceipt} onChange={(event) => setReplacementReceipt(event.target.value)} placeholder="Replacement receipt number (optional)" maxLength={100} />
                        <Button disabled={busy || !branchNote.trim()} onClick={() => branchResponseMutation.mutate()}>Submit Branch Response</Button>
                      </div>
                    ) : (
                      <p className="text-sm text-rose-900">Waiting for the branch to respond.</p>
                    )}

                    {selected.branchRespondedAt && !selected.resolvedAt && (canResolve || canVoid) ? (
                      <div className="space-y-2 rounded-lg border bg-background p-3">
                        <Label htmlFor="payment-resolution-note">Resolution note</Label>
                        <Textarea id="payment-resolution-note" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={3} />
                        <div className="flex flex-wrap gap-2">
                          {canResolve ? (
                            <Button disabled={busy || !resolutionNote.trim()} onClick={() => resolveMutation.mutate("CONFIRMED_CORRECT")}>Confirm As Recorded</Button>
                          ) : null}
                          {canVoid ? (
                            <Button variant="destructive" disabled={busy || !resolutionNote.trim()} onClick={() => resolveMutation.mutate("VOIDED")}>Void Payment</Button>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Voiding returns the amount to the order balance so the branch can record it again with the right receipt.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selected.resolvedAt ? (
                  <div className="rounded-xl border p-3 text-sm">
                    <p className="font-medium">Resolved: {humanize(selected.resolutionAction)}</p>
                    <p>{selected.resolutionNote}</p>
                    <p className="text-xs text-muted-foreground">{selected.resolvedBy} on {dateTime.format(new Date(selected.resolvedAt))}</p>
                  </div>
                ) : null}

                {selected.reviewStatus === "VERIFIED" && selected.verifiedAt ? (
                  <p className="text-sm text-emerald-700">
                    Verified on {dateTime.format(new Date(selected.verifiedAt))}. This receipt now counts in the Sales report for that date.
                  </p>
                ) : null}

                {formNotice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{formNotice}</p> : null}
                {formError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{formError}</p> : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
