"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import { useShellAccess } from "@/components/shell-access-context";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { receiptComparisonSchema, type ReceiptComparison } from "@/lib/contracts/sales";

type SaleLine = {
  itemCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
};
type Sale = {
  id: string;
  reference: string;
  manualReceiptNumber: string;
  receiptBooklet: string;
  branch: string;
  customer: string;
  totalAmount: number;
  discountAmount: number;
  amountPaid: number;
  paymentMethod: string;
  postedAt: string;
  postedBy: string;
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "MISMATCH_REPORTED";
  status: "POSTED" | "VOIDED";
  mismatchCategory: string | null;
  reviewNotes: string | null;
  reportedComparison: ReceiptComparison | null;
  branchResponse:
    | "ORIGINAL_ENCODING_CORRECT"
    | "RECEIPT_CORRECTION_NEEDED"
    | null;
  branchResponseNote: string | null;
  branchReplacementReceiptNumber: string | null;
  branchRespondedAt: string | null;
  receiptPhotoUrl: string | null;
  correctionOfId: string | null;
  resolutionAction: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  lines: SaleLine[];
};

type BranchOption = { id: string; code: string; name: string };
type ReceiptFilters = {
  page: number;
  pageSize: number;
  search: string;
  reviewStatus: "all" | Sale["reviewStatus"];
  saleStatus: "all" | Sale["status"];
  locationId: string;
  dateFrom: string;
  dateTo: string;
  saleId: string;
};
type ReceiptListResponse = {
  data: Sale[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    unverified: number;
    verified: number;
    mismatches: number;
  };
  branches: BranchOption[];
};

type ComparisonDraft = {
  receiptBooklet: string;
  receiptNumber: string;
  paymentMethod: string;
  discountAmount: string;
  amountPaid: string;
  totalAmount: string;
  lines: Array<{ itemCode: string; quantity: string; unitPrice: string }>;
};

const MISMATCH_OPTIONS = [
  ["PRICE_MISMATCH", "Price mismatch"],
  ["QUANTITY_MISMATCH", "Quantity mismatch"],
  ["ITEM_MISMATCH", "Item mismatch"],
  ["TOTAL_MISMATCH", "Total mismatch"],
  ["RECEIPT_NOT_FOUND", "Receipt not found"],
  ["OTHER", "Other"],
] as const;

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

async function fetchReceipts(filters: ReceiptFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  if (filters.search) params.set("search", filters.search);
  if (filters.reviewStatus !== "all")
    params.set("reviewStatus", filters.reviewStatus);
  if (filters.saleStatus !== "all")
    params.set("saleStatus", filters.saleStatus);
  if (filters.locationId) params.set("locationId", filters.locationId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.saleId) params.set("saleId", filters.saleId);
  const response = await fetch(
    `/api/accounting/receipts?${params.toString()}`,
    { credentials: "same-origin" },
  );
  const json = await response.json();
  if (!response.ok)
    throw new Error(json.error?.message ?? "Unable to load receipts");
  return json as ReceiptListResponse;
}

function draftNumber(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function parseComparison(draft: ComparisonDraft) {
  return receiptComparisonSchema.safeParse({
    receiptBooklet: draft.receiptBooklet,
    receiptNumber: draft.receiptNumber,
    paymentMethod: draft.paymentMethod,
    discountAmount: draftNumber(draft.discountAmount),
    amountPaid: draftNumber(draft.amountPaid),
    totalAmount: draftNumber(draft.totalAmount),
    lines: draft.lines.map((line) => ({
      itemCode: line.itemCode,
      quantity: draftNumber(line.quantity),
      unitPrice: draftNumber(line.unitPrice),
    })),
  });
}

function toComparison(draft: ComparisonDraft) {
  const parsed = parseComparison(draft);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid receipt comparison");
  }
  return parsed.data;
}

async function uploadPhoto(
  saleId: string,
  file: File | null,
  existingKey: string | null,
) {
  if (!file || existingKey) return existingKey;
  const formData = new FormData();
  formData.set("photo", file);
  const response = await fetch(`/api/accounting/receipts/${saleId}/photo`, {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  const json = (await response.json().catch(() => null)) as {
    data?: { key?: string };
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new Error(json?.error?.message ?? "Unable to upload receipt photo");
  if (!json?.data?.key)
    throw new Error("Receipt photo upload returned an invalid response");
  return json.data.key;
}

type ComparisonDifference = {
  label: string;
  encodedValue: string;
  reportedValue: string;
};

function cents(value: number) {
  return Math.round(value * 100);
}

function comparisonDifferences(sale: Sale, comparison: ReceiptComparison) {
  const differences: ComparisonDifference[] = [];
  if (sale.manualReceiptNumber !== comparison.receiptNumber)
    differences.push({
      label: "Receipt number",
      encodedValue: sale.manualReceiptNumber,
      reportedValue: comparison.receiptNumber,
    });
  if (sale.receiptBooklet !== comparison.receiptBooklet)
    differences.push({
      label: "Receipt booklet",
      encodedValue: sale.receiptBooklet || "None",
      reportedValue: comparison.receiptBooklet || "None",
    });
  if (sale.paymentMethod !== comparison.paymentMethod)
    differences.push({
      label: "Payment method",
      encodedValue: sale.paymentMethod.replaceAll("_", " "),
      reportedValue: comparison.paymentMethod.replaceAll("_", " "),
    });
  if (cents(sale.discountAmount) !== cents(comparison.discountAmount))
    differences.push({
      label: "Discount",
      encodedValue: formatPeso(sale.discountAmount),
      reportedValue: formatPeso(comparison.discountAmount),
    });
  if (cents(sale.amountPaid) !== cents(comparison.amountPaid))
    differences.push({
      label: "Amount paid",
      encodedValue: formatPeso(sale.amountPaid),
      reportedValue: formatPeso(comparison.amountPaid),
    });
  const saleLines = new Map(sale.lines.map((line) => [line.itemCode, line]));
  const paperLines = new Map(
    comparison.lines.map((line) => [line.itemCode, line]),
  );
  for (const [itemCode, line] of saleLines) {
    const paperLine = paperLines.get(itemCode);
    const itemLabel = `${line.name} (${itemCode})`;
    if (!paperLine) {
      differences.push({
        label: itemLabel,
        encodedValue: "Included",
        reportedValue: "Not listed",
      });
      continue;
    }
    if (line.quantity !== paperLine.quantity)
      differences.push({
        label: `${itemLabel} quantity`,
        encodedValue: String(line.quantity),
        reportedValue: String(paperLine.quantity),
      });
    if (cents(line.unitPrice) !== cents(paperLine.unitPrice))
      differences.push({
        label: `${itemLabel} unit price`,
        encodedValue: formatPeso(line.unitPrice),
        reportedValue: formatPeso(paperLine.unitPrice),
      });
  }
  for (const [itemCode, paperLine] of paperLines)
    if (!saleLines.has(itemCode))
      differences.push({
        label: `Additional item (${itemCode})`,
        encodedValue: "Not listed",
        reportedValue: `Qty ${paperLine.quantity} at ${formatPeso(paperLine.unitPrice)}`,
      });
  if (cents(sale.totalAmount) !== cents(comparison.totalAmount))
    differences.push({
      label: "Total",
      encodedValue: formatPeso(sale.totalAmount),
      reportedValue: formatPeso(comparison.totalAmount),
    });
  return differences;
}

export default function ReceiptVerificationPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading receipt...</div>}>
      <ReceiptVerificationContent />
    </Suspense>
  );
}

function ReceiptVerificationContent() {
  const access = useShellAccess();
  const searchParams = useSearchParams();
  const linkedSaleId = searchParams.get("saleId") ?? "";
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [reviewStatusDraft, setReviewStatusDraft] =
    useState<ReceiptFilters["reviewStatus"]>("all");
  const [saleStatusDraft, setSaleStatusDraft] =
    useState<ReceiptFilters["saleStatus"]>("POSTED");
  const [locationDraft, setLocationDraft] = useState("");
  const [dateFromDraft, setDateFromDraft] = useState("");
  const [dateToDraft, setDateToDraft] = useState("");
  const [filters, setFilters] = useState<ReceiptFilters>({
    page: 1,
    pageSize: 10,
    search: "",
    reviewStatus: "all",
    saleStatus: "POSTED",
    locationId: "",
    dateFrom: "",
    dateTo: "",
    saleId: linkedSaleId,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("PRICE_MISMATCH");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["accounting-receipts", filters],
    queryFn: () => fetchReceipts(filters),
    placeholderData: (previousData) => previousData,
  });
  const sales = useMemo(() => data?.data ?? [], [data?.data]);
  const meta = data?.meta ?? {
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
    unverified: 0,
    verified: 0,
    mismatches: 0,
  };
  const branches = data?.branches ?? [];

  const reviewMutation = useMutation({
    mutationFn: async (status: "VERIFIED" | "MISMATCH_REPORTED") => {
      if (!selectedId) throw new Error("Select a receipt first.");
      const nextPhotoKey = await uploadPhoto(selectedId, photoFile, photoKey);
      const response = await fetch(
        `/api/accounting/receipts/${selectedId}/review`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            mismatchCategory:
              status === "MISMATCH_REPORTED" ? category : undefined,
            notes: status === "MISMATCH_REPORTED" ? notes : undefined,
            comparison: toComparison(comparison),
            receiptPhotoKey:
              status === "MISMATCH_REPORTED" ? nextPhotoKey : undefined,
          }),
        },
      );
      const json = (await response.json().catch(() => null)) as {
        data?: unknown;
        error?: { message?: string };
      } | null;
      if (!response.ok)
        throw new Error(
          json?.error?.message ?? "Unable to update receipt review",
        );
      return json?.data;
    },
    onSuccess: () => {
      setSelectedId(null);
      setNotes("");
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoKey(null);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const resolveMutation = useMutation({
    mutationFn: async (action: "CONFIRMED_CORRECT" | "VOIDED_REPLACED") => {
      if (!selectedId) throw new Error("Select a receipt first.");
      if (!resolutionNote.trim())
        throw new Error("Resolution note is required.");
      if (
        action === "VOIDED_REPLACED" &&
        comparison.receiptNumber.trim() === selectedSale?.manualReceiptNumber
      ) {
        throw new Error(
          "Enter the new replacement receipt number before voiding the original sale.",
        );
      }
      const nextPhotoKey = await uploadPhoto(selectedId, photoFile, photoKey);
      const response = await fetch(
        `/api/accounting/receipts/${selectedId}/resolve`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            note: resolutionNote,
            replacement:
              action === "VOIDED_REPLACED"
                ? toComparison(comparison)
                : undefined,
            receiptPhotoKey: nextPhotoKey ?? undefined,
          }),
        },
      );
      const json = (await response.json().catch(() => null)) as {
        data?: unknown;
        error?: { message?: string };
      } | null;
      if (!response.ok)
        throw new Error(json?.error?.message ?? "Unable to resolve mismatch");
      return json?.data;
    },
    onSuccess: () => {
      setSelectedId(null);
      setResolutionNote("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const branchResponseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a receipt first.");
      const response = await fetch(
        `/api/accounting/receipts/${selectedId}/branch-response`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: branchResponse,
            note: branchResponseNote,
            replacementReceiptNumber:
              branchResponse === "RECEIPT_CORRECTION_NEEDED"
                ? branchReplacementReceiptNumber
                : undefined,
          }),
        },
      );
      const json = (await response.json().catch(() => null)) as {
        data?: unknown;
        error?: { message?: string };
      } | null;
      if (!response.ok)
        throw new Error(
          json?.error?.message ?? "Unable to submit branch response",
        );
      return json?.data;
    },
    onSuccess: () => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const selectedSale = sales.find((sale) => sale.id === selectedId) ?? null;
  const isAdmin = access.identity?.role === "ADMIN";
  const canReview =
    isAdmin || access.identity?.role === "ACCOUNTING_STAFF";
  const canResolve =
    access.identity?.role === "ACCOUNTING_STAFF" ||
    isAdmin;
  const canRespond = access.identity?.role === "BRANCH_STAFF";

  const [comparison, setComparison] = useState<ComparisonDraft>({
    receiptBooklet: "",
    receiptNumber: "",
    paymentMethod: "CASH",
    discountAmount: "0",
    amountPaid: "0",
    totalAmount: "0",
    lines: [],
  });
  const [resolutionNote, setResolutionNote] = useState("");
  const [branchResponse, setBranchResponse] = useState<
    "ORIGINAL_ENCODING_CORRECT" | "RECEIPT_CORRECTION_NEEDED"
  >("ORIGINAL_ENCODING_CORRECT");
  const [branchResponseNote, setBranchResponseNote] = useState("");
  const [branchReplacementReceiptNumber, setBranchReplacementReceiptNumber] =
    useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);

  useEffect(() => {
    if (meta.totalItems > 0 && filters.page > meta.totalPages) {
      // Keep the current page valid after a review changes the result count.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilters((current) => ({ ...current, page: meta.totalPages }));
    }
  }, [filters.page, meta.totalItems, meta.totalPages]);

  const hasActiveFilters = Boolean(
    filters.search ||
    filters.reviewStatus !== "all" ||
    filters.saleStatus !== "POSTED" ||
    filters.locationId ||
    filters.dateFrom ||
    filters.dateTo,
  );
  const showingFrom =
    meta.totalItems === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const showingTo =
    meta.totalItems === 0
      ? 0
      : Math.min(meta.page * meta.pageSize, meta.totalItems);

  const applyFilters = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setFilters({
      page: 1,
      pageSize: 10,
      search: searchDraft.trim(),
      reviewStatus: reviewStatusDraft,
      saleStatus: saleStatusDraft,
      locationId: locationDraft,
      dateFrom: dateFromDraft,
      dateTo: dateToDraft,
      saleId: "",
    });
  };

  const resetFilters = () => {
    setSearchDraft("");
    setReviewStatusDraft("all");
    setSaleStatusDraft("POSTED");
    setLocationDraft("");
    setDateFromDraft("");
    setDateToDraft("");
    setFilters({
      page: 1,
      pageSize: 10,
      search: "",
      reviewStatus: "all",
      saleStatus: "POSTED",
      locationId: "",
      dateFrom: "",
      dateTo: "",
      saleId: "",
    });
  };

  const selectSale = (sale: Sale) => {
    const reported = sale.reportedComparison;
    setSelectedId(sale.id);
    setFormError(null);
    setComparison({
      receiptBooklet: reported?.receiptBooklet ?? sale.receiptBooklet,
      receiptNumber:
        sale.branchResponse === "RECEIPT_CORRECTION_NEEDED" &&
        sale.branchReplacementReceiptNumber
          ? sale.branchReplacementReceiptNumber
          : (reported?.receiptNumber ?? sale.manualReceiptNumber),
      paymentMethod: reported?.paymentMethod ?? sale.paymentMethod,
      discountAmount: String(reported?.discountAmount ?? sale.discountAmount),
      amountPaid: String(reported?.amountPaid ?? sale.amountPaid),
      totalAmount: String(reported?.totalAmount ?? sale.totalAmount),
      lines: (reported?.lines ?? sale.lines).map((line) => ({
        itemCode: line.itemCode,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
      })),
    });
    setResolutionNote("");
    setBranchResponse(
      sale.branchResponse ?? "ORIGINAL_ENCODING_CORRECT",
    );
    setBranchResponseNote(sale.branchResponseNote ?? "");
    setBranchReplacementReceiptNumber(
      sale.branchReplacementReceiptNumber ?? "",
    );
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoKey(null);
  };

  useEffect(() => {
    if (!linkedSaleId || selectedId === linkedSaleId) return;
    const linkedSale = sales.find((sale) => sale.id === linkedSaleId);
    if (!linkedSale) return;
    // Initialize the selected transaction after its linked notification query loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    selectSale(linkedSale);
  }, [linkedSaleId, sales, selectedId]);

  const handlePhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Receipt evidence must be an image file.");
      return;
    }
    if (file.size > 6_000_000) {
      setFormError("Receipt image must be 6 MB or smaller.");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoKey(null);
  };

  const clearSelectedPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoKey(null);
  };

  const parsedComparison = parseComparison(comparison);
  const comparisonError = parsedComparison.success
    ? null
    : parsedComparison.error.issues[0]?.message ?? "Invalid receipt comparison";
  const differences = selectedSale && parsedComparison.success
    ? comparisonDifferences(selectedSale, parsedComparison.data)
    : [];
  const reportedDifferences =
    selectedSale?.reportedComparison
      ? comparisonDifferences(selectedSale, selectedSale.reportedComparison)
      : [];
  const canEditComparison = Boolean(
    selectedSale &&
    selectedSale.status === "POSTED" &&
    ((canReview && selectedSale.reviewStatus === "UNVERIFIED") ||
      (isAdmin &&
        selectedSale.reviewStatus === "MISMATCH_REPORTED" &&
        selectedSale.branchResponse === "RECEIPT_CORRECTION_NEEDED")),
  );
  const updateComparison = (changes: Partial<ComparisonDraft>) =>
    setComparison((current) => ({ ...current, ...changes }));

  return (
    <PageShell
      title="Receipt Verification"
      subtitle="Compare posted manual receipts with the branch encoding before closing the accounting queue."
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Unverified" value={meta.unverified} tone="amber" />
        <SummaryCard
          label="Mismatch reported"
          value={meta.mismatches}
          tone="rose"
        />
        <SummaryCard label="Verified" value={meta.verified} tone="emerald" />
      </div>
      <Card className="mb-6">
        <CardContent className="p-5">
          <form
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
            onSubmit={applyFilters}
          >
            <div className="relative xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                aria-label="Search receipts"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search receipt, customer, branch"
                className="pl-9"
              />
            </div>
            <select
              aria-label="Filter by review status"
              value={reviewStatusDraft}
              onChange={(event) =>
                setReviewStatusDraft(
                  event.target.value as ReceiptFilters["reviewStatus"],
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All review statuses</option>
              <option value="UNVERIFIED">Unverified</option>
              <option value="MISMATCH_REPORTED">Mismatch reported</option>
              <option value="VERIFIED">Verified</option>
            </select>
            <select
              aria-label="Filter by sale status"
              value={saleStatusDraft}
              onChange={(event) =>
                setSaleStatusDraft(
                  event.target.value as ReceiptFilters["saleStatus"],
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="POSTED">Posted sales</option>
              <option value="all">All sale statuses</option>
              <option value="VOIDED">Voided sales</option>
            </select>
            <select
              aria-label="Filter by branch"
              value={locationDraft}
              onChange={(event) => setLocationDraft(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2 md:col-span-2 xl:col-span-2">
              <Input
                aria-label="Filter from date"
                type="date"
                value={dateFromDraft}
                onChange={(event) => setDateFromDraft(event.target.value)}
              />
              <Input
                aria-label="Filter to date"
                type="date"
                value={dateToDraft}
                onChange={(event) => setDateToDraft(event.target.value)}
              />
            </div>
            <div className="flex gap-2 md:col-span-2 xl:col-span-4 xl:justify-end">
              <Button type="submit" className="min-w-32">
                Apply filters
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetFilters}
                disabled={
                  !hasActiveFilters &&
                  !searchDraft &&
                  !locationDraft &&
                  !dateFromDraft &&
                  !dateToDraft
                }
              >
                Reset
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Date filters use the sale posting date. Search also checks receipt
            booklet and reference.
          </p>
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Card className="min-w-0">
          <CardContent className="min-w-0 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Sales queue</h2>
                <p className="text-sm text-slate-500" aria-live="polite">
                  {meta.totalItems === 0
                    ? "No matching receipts"
                    : `Showing ${showingFrom}-${showingTo} of ${meta.totalItems} receipt${meta.totalItems === 1 ? "" : "s"}`}
                  {isFetching && !isLoading ? " · Updating..." : ""}
                </p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              {isLoading ? (
                <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                  receipts...
                </div>
              ) : error ? (
                <div className="flex flex-col items-start gap-3 py-12">
                  <p role="alert" className="text-sm text-red-600">
                    Unable to load receipts. {(error as Error).message}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void queryClient.invalidateQueries({
                        queryKey: ["accounting-receipts"],
                      })
                    }
                  >
                    Try again
                  </Button>
                </div>
              ) : sales.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <p className="text-sm text-slate-500">
                    {hasActiveFilters
                      ? "No receipts match the current filters."
                      : "There are no receipts to verify yet."}
                  </p>
                  {hasActiveFilters ? (
                    <Button variant="outline" onClick={resetFilters}>
                      Reset filters
                    </Button>
                  ) : null}
                </div>
              ) : (
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3">Receipt</th>
                      <th className="px-3 py-3">Branch</th>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Total</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => (
                      <tr
                        key={sale.id}
                        onClick={() => selectSale(sale)}
                        aria-selected={selectedId === sale.id}
                        className={
                          selectedId === sale.id
                            ? "cursor-pointer border-b bg-emerald-50 ring-1 ring-inset ring-emerald-200 last:border-0"
                            : "cursor-pointer border-b transition-colors hover:bg-slate-50 last:border-0"
                        }
                      >
                        <td className="px-3 py-4">
                          <p className="font-medium">
                            {sale.manualReceiptNumber}
                          </p>
                          <p className="text-xs text-slate-500">
                            {sale.reference}
                          </p>
                        </td>
                        <td className="px-3 py-4 text-slate-600">
                          {sale.branch}
                        </td>
                        <td className="px-3 py-4 text-slate-600">
                          {sale.customer}
                        </td>
                        <td className="px-3 py-4 font-medium">
                          {formatPeso(sale.totalAmount)}
                        </td>
                        <td className="px-3 py-4">
                          <ReviewBadge status={sale.reviewStatus} />
                        </td>
                        <td className="px-3 py-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectSale(sale);
                            }}
                          >
                            {selectedId === sale.id ? "Selected" : "Review"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {meta.totalItems > 0 ? (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Page {meta.page} of {meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        page: Math.max(1, current.page - 1),
                      }))
                    }
                    disabled={meta.page <= 1 || isFetching}
                  >
                    <ChevronLeft className="mr-1 size-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        page: Math.min(meta.totalPages, current.page + 1),
                      }))
                    }
                    disabled={meta.page >= meta.totalPages || isFetching}
                  >
                    Next
                    <ChevronRight className="ml-1 size-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="min-w-0 p-5">
            {!selectedSale ? (
              <div className="flex min-h-80 items-center justify-center text-center text-sm text-slate-500">
                Select a receipt to compare its line items and manual receipt
                evidence.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {selectedSale.reference}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      Receipt {selectedSale.manualReceiptNumber}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {selectedSale.branch} • posted by {selectedSale.postedBy}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <SaleStatusBadge status={selectedSale.status} />
                    <ReviewBadge status={selectedSale.reviewStatus} />
                  </div>
                </div>
                <ReceiptSummary
                  title="Encoded receipt"
                  receiptBooklet={selectedSale.receiptBooklet}
                  receiptNumber={selectedSale.manualReceiptNumber}
                  paymentMethod={selectedSale.paymentMethod}
                  discountAmount={selectedSale.discountAmount}
                  amountPaid={selectedSale.amountPaid}
                  totalAmount={selectedSale.totalAmount}
                  lines={selectedSale.lines}
                />
                {selectedSale.reportedComparison && (
                  <ReceiptSummary
                    title="Persisted reported receipt"
                    {...selectedSale.reportedComparison}
                  />
                )}
                {selectedSale.status === "VOIDED" && (
                  <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                    This sale is voided and read-only.
                  </div>
                )}
                {selectedSale.reviewStatus === "MISMATCH_REPORTED" && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                      <p className="font-medium">
                        Reported mismatch:{" "}
                        {selectedSale.mismatchCategory?.replaceAll("_", " ") ??
                          "Uncategorized"}
                      </p>
                      <p className="mt-1">
                        {selectedSale.reviewNotes || "No notes recorded."}
                      </p>
                      <p className="mt-2 border-t border-rose-200 pt-2 font-medium">
                        {selectedSale.branchResponse ===
                        "ORIGINAL_ENCODING_CORRECT"
                          ? "Branch confirmed the original encoding is correct."
                          : selectedSale.branchResponse ===
                              "RECEIPT_CORRECTION_NEEDED"
                            ? `Branch confirmed a correction is needed. Replacement receipt: ${selectedSale.branchReplacementReceiptNumber}`
                            : "Waiting for the branch to double-check this mismatch."}
                      </p>
                      {selectedSale.branchResponseNote && (
                        <p className="mt-1">
                          Branch note: {selectedSale.branchResponseNote}
                        </p>
                      )}
                    </div>
                    {reportedDifferences.length > 0 && (
                      <MismatchDetails differences={reportedDifferences} />
                    )}
                  </div>
                )}
                {canRespond &&
                  selectedSale.reviewStatus === "MISMATCH_REPORTED" && (
                    <div className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                      <div>
                        <p className="font-semibold text-sky-950">
                          Branch double-check
                        </p>
                        <p className="mt-1 text-sm text-sky-800">
                          Compare the original encoding with the physical receipt,
                          then tell Admin and Accounting what should happen next.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="branch-response">Branch finding</Label>
                        <select
                          id="branch-response"
                          value={branchResponse}
                          onChange={(event) =>
                            setBranchResponse(
                              event.target.value as
                                | "ORIGINAL_ENCODING_CORRECT"
                                | "RECEIPT_CORRECTION_NEEDED",
                            )
                          }
                          className="h-10 rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="ORIGINAL_ENCODING_CORRECT">
                            Original encoding is correct
                          </option>
                          <option value="RECEIPT_CORRECTION_NEEDED">
                            Receipt correction is needed
                          </option>
                        </select>
                      </div>
                      {branchResponse === "RECEIPT_CORRECTION_NEEDED" && (
                        <div className="grid gap-2">
                          <Label htmlFor="branch-replacement-receipt">
                            Replacement receipt number
                          </Label>
                          <Input
                            id="branch-replacement-receipt"
                            value={branchReplacementReceiptNumber}
                            onChange={(event) =>
                              setBranchReplacementReceiptNumber(
                                event.target.value,
                              )
                            }
                            placeholder="Enter the new receipt number"
                          />
                        </div>
                      )}
                      <div className="grid gap-2">
                        <Label htmlFor="branch-response-note">
                          Branch explanation
                        </Label>
                        <Textarea
                          id="branch-response-note"
                          value={branchResponseNote}
                          onChange={(event) =>
                            setBranchResponseNote(event.target.value)
                          }
                          placeholder="Explain what you checked and why this response is correct"
                        />
                      </div>
                      <Button
                        onClick={() => branchResponseMutation.mutate()}
                        disabled={
                          branchResponseMutation.isPending ||
                          !branchResponseNote.trim() ||
                          (branchResponse === "RECEIPT_CORRECTION_NEEDED" &&
                            !branchReplacementReceiptNumber.trim())
                        }
                      >
                        {selectedSale.branchResponse
                          ? "Update branch response"
                          : "Submit branch response"}
                      </Button>
                    </div>
                  )}
                {selectedSale.receiptPhotoUrl && !photoPreview && (
                  <Image
                    src={selectedSale.receiptPhotoUrl}
                    alt="Attached manual receipt"
                    width={800}
                    height={600}
                    unoptimized
                    className="max-h-64 w-full rounded-xl border object-contain"
                  />
                )}
                {canEditComparison &&
                selectedSale.reviewStatus !== "VERIFIED" ? (
                  <div className="space-y-4 border-t pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="paper-booklet">Receipt booklet</Label>
                        <Input
                          id="paper-booklet"
                          value={comparison.receiptBooklet}
                          onChange={(event) => updateComparison({ receiptBooklet: event.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="paper-number">
                          {selectedSale.reviewStatus === "MISMATCH_REPORTED"
                            ? "New replacement receipt number"
                            : "Receipt number"}
                        </Label>
                        <Input
                          id="paper-number"
                          value={comparison.receiptNumber}
                          onChange={(event) => updateComparison({ receiptNumber: event.target.value })}
                        />
                        {selectedSale.reviewStatus === "MISMATCH_REPORTED" && (
                          <p className="text-xs text-slate-500">
                            This must differ from the voided original receipt.
                          </p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="paper-payment-method">Payment method</Label>
                        <select
                          id="paper-payment-method"
                          value={comparison.paymentMethod}
                          onChange={(event) => updateComparison({ paymentMethod: event.target.value })}
                          className="h-10 rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="CASH">Cash</option>
                          <option value="GCASH">GCash</option>
                          <option value="MAYA">Maya</option>
                          <option value="BANK_TRANSFER">Bank transfer</option>
                          <option value="CREDIT_CARD">Credit card</option>
                          <option value="SPLIT">Split</option>
                        </select>
                      </div>
                      {([
                        ["paper-discount", "Discount", "discountAmount"],
                        ["paper-amount-paid", "Amount paid", "amountPaid"],
                        ["paper-total", "Total", "totalAmount"],
                      ] as const).map(([id, label, field]) => (
                        <div key={field} className="grid gap-2">
                          <Label htmlFor={id}>{label}</Label>
                          <Input
                            id={id}
                            inputMode="decimal"
                            value={comparison[field]}
                            onChange={(event) => updateComparison({ [field]: event.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-sm font-semibold">
                        {selectedSale.reviewStatus === "MISMATCH_REPORTED"
                          ? "Correction details"
                          : "Receipt item details"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedSale.reviewStatus === "MISMATCH_REPORTED"
                          ? "The values reported by Accounting are loaded below. Change only what the replacement sale needs."
                          : "Enter the quantity and unit price shown on the handwritten receipt."}
                      </p>
                      <div className="mt-4 hidden grid-cols-[minmax(0,1fr)_100px_120px_40px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500 sm:grid">
                        <span>Item code</span>
                        <span>Quantity</span>
                        <span>Unit price</span>
                        <span />
                      </div>
                      <div className="mt-2 space-y-3">
                        {comparison.lines.map((line, index) => {
                          return (
                            <div
                              key={index}
                              className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_100px_120px_40px] sm:bg-transparent sm:p-0"
                            >
                              <Input
                                aria-label={`Item code ${index + 1}`}
                                placeholder="Item code"
                                value={line.itemCode}
                                onChange={(event) =>
                                  setComparison((current) => ({
                                    ...current,
                                    lines: current.lines.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, itemCode: event.target.value } : item,
                                    ),
                                  }))
                                }
                              />
                              <Input
                                aria-label={`Quantity ${index + 1}`}
                                placeholder="Quantity"
                                inputMode="numeric"
                                value={line.quantity}
                                onChange={(event) =>
                                  setComparison((current) => ({
                                    ...current,
                                    lines: current.lines.map(
                                      (item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              quantity: event.target.value,
                                            }
                                          : item,
                                    ),
                                  }))
                                }
                              />
                              <Input
                                aria-label={`Unit price ${index + 1}`}
                                placeholder="Unit price"
                                inputMode="decimal"
                                value={line.unitPrice}
                                onChange={(event) =>
                                  setComparison((current) => ({
                                    ...current,
                                    lines: current.lines.map(
                                      (item, itemIndex) =>
                                        itemIndex === index
                                          ? {
                                              ...item,
                                              unitPrice: event.target.value,
                                            }
                                          : item,
                                    ),
                                  }))
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove line ${index + 1}`}
                                onClick={() =>
                                  setComparison((current) => ({
                                    ...current,
                                    lines: current.lines.filter((_, itemIndex) => itemIndex !== index),
                                  }))
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() =>
                          setComparison((current) => ({
                            ...current,
                            lines: [...current.lines, { itemCode: "", quantity: "1", unitPrice: "0" }],
                          }))
                        }
                      >
                        <Plus className="mr-2 size-4" /> Add line
                      </Button>
                    </div>
                    {comparisonError && (
                      <p role="alert" className="text-sm text-red-600">{comparisonError}</p>
                    )}
                    {differences.length > 0 &&
                      selectedSale.reviewStatus === "UNVERIFIED" && (
                        <MismatchDetails differences={differences} />
                      )}
                    {canReview &&
                      selectedSale.reviewStatus === "UNVERIFIED" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => reviewMutation.mutate("VERIFIED")}
                          disabled={
                            reviewMutation.isPending || Boolean(comparisonError) || differences.length > 0
                          }
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Confirm correct
                        </Button>
                        <span className="self-center text-xs text-slate-500">
                          Correct all comparison fields before confirming.
                        </span>
                      </div>
                    )}
                    {canReview &&
                      selectedSale.reviewStatus === "UNVERIFIED" && (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="mismatch-category">
                            Mismatch category
                          </Label>
                          <select
                            id="mismatch-category"
                            value={category}
                            onChange={(event) =>
                              setCategory(event.target.value)
                            }
                            className="h-10 rounded-md border bg-background px-3 text-sm"
                          >
                            {MISMATCH_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="mismatch-notes">Notes</Label>
                          <Textarea
                            id="mismatch-notes"
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Describe the difference found on the handwritten receipt"
                          />
                        </div>
                      </>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="receipt-photo">
                        Receipt photo (optional)
                      </Label>
                      <Input
                        id="receipt-photo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) =>
                          handlePhoto(event.target.files?.[0])
                        }
                      />
                      <p className="text-xs text-slate-500">
                        Optional even for Receipt Not Found. Upload only if you
                        have supporting evidence.
                      </p>
                    </div>
                    {photoPreview && (
                      <div className="space-y-2">
                        <Image
                          src={photoPreview}
                          alt="Receipt preview"
                          width={800}
                          height={600}
                          unoptimized
                          className="max-h-40 w-full rounded-xl border object-contain"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearSelectedPhoto}
                        >
                          Remove selected image
                        </Button>
                      </div>
                    )}
                    {selectedSale.receiptPhotoUrl && !photoPreview && (
                      <p className="text-xs text-slate-500">
                        A receipt image is already attached. Choose a new file
                        above to replace it.
                      </p>
                    )}
                    {canReview &&
                      selectedSale.reviewStatus === "UNVERIFIED" && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!notes.trim()) {
                            setFormError(
                              "Notes are required when reporting a mismatch.",
                            );
                            return;
                          }
                          reviewMutation.mutate("MISMATCH_REPORTED");
                        }}
                        disabled={reviewMutation.isPending || Boolean(comparisonError)}
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Report mismatch
                      </Button>
                    )}
                  </div>
                ) : null}
                {canResolve &&
                  selectedSale.reviewStatus === "MISMATCH_REPORTED" &&
                  !selectedSale.branchResponse && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Final resolution is available after the branch submits its
                      double-check response.
                    </div>
                  )}
                {canResolve &&
                  selectedSale.reviewStatus === "MISMATCH_REPORTED" &&
                  selectedSale.branchResponse && (
                    <div className="space-y-4 border-t pt-4">
                      <div className="grid gap-2">
                        <Label htmlFor="resolution-note">Resolution note</Label>
                        <Textarea
                          id="resolution-note"
                          value={resolutionNote}
                          onChange={(event) =>
                            setResolutionNote(event.target.value)
                          }
                          placeholder="Explain why this mismatch is being resolved"
                        />
                      </div>
                      {selectedSale.branchResponse ===
                        "ORIGINAL_ENCODING_CORRECT" && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            resolveMutation.mutate("CONFIRMED_CORRECT")
                          }
                          disabled={
                            resolveMutation.isPending ||
                            !resolutionNote.trim() ||
                            Boolean(comparisonError)
                          }
                          className="border-sky-200 text-sky-700"
                        >
                          Confirm original encoding
                        </Button>
                      )}
                      {selectedSale.branchResponse ===
                        "RECEIPT_CORRECTION_NEEDED" && isAdmin && (
                        <Button
                          onClick={() =>
                            resolveMutation.mutate("VOIDED_REPLACED")
                          }
                          disabled={
                            resolveMutation.isPending ||
                            !resolutionNote.trim() ||
                            Boolean(comparisonError)
                          }
                          className="bg-red-600 text-white hover:bg-red-700"
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Void and replace
                        </Button>
                      )}
                      {selectedSale.branchResponse ===
                        "RECEIPT_CORRECTION_NEEDED" && !isAdmin && (
                        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
                          The branch confirmed a correction. Only Admin can void
                          the original sale and post its replacement.
                        </p>
                      )}
                    </div>
                  )}
                {formError && (
                  <p className="text-sm text-red-600">{formError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function ReceiptSummary({
  title,
  receiptBooklet,
  receiptNumber,
  paymentMethod,
  discountAmount,
  amountPaid,
  totalAmount,
  lines,
}: {
  title: string;
  receiptBooklet: string;
  receiptNumber: string;
  paymentMethod: string;
  discountAmount: number;
  amountPaid: number;
  totalAmount: number;
  lines: Array<{ itemCode: string; name?: string; quantity: number; unitPrice: number }>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-slate-50 px-3 py-2">
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 text-sm">
        <div><dt className="text-xs text-slate-500">Booklet</dt><dd>{receiptBooklet || "None"}</dd></div>
        <div><dt className="text-xs text-slate-500">Receipt number</dt><dd>{receiptNumber}</dd></div>
        <div><dt className="text-xs text-slate-500">Payment method</dt><dd>{paymentMethod.replaceAll("_", " ")}</dd></div>
        <div><dt className="text-xs text-slate-500">Discount</dt><dd>{formatPeso(discountAmount)}</dd></div>
        <div><dt className="text-xs text-slate-500">Amount paid</dt><dd>{formatPeso(amountPaid)}</dd></div>
        <div><dt className="text-xs text-slate-500">Total</dt><dd className="font-semibold">{formatPeso(totalAmount)}</dd></div>
      </dl>
      <div className="divide-y border-t">
        {lines.map((line, index) => (
          <div key={`${line.itemCode}-${index}`} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-medium">{line.name ?? line.itemCode}</p>
              <p className="text-xs text-slate-500">
                {line.name ? `${line.itemCode} • ` : ""}Qty {line.quantity} at {formatPeso(line.unitPrice)}
              </p>
            </div>
            <p className="font-medium">{formatPeso(line.quantity * line.unitPrice)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MismatchDetails({
  differences,
}: {
  differences: ComparisonDifference[];
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Mismatch details</p>
      <div className="mt-2 space-y-2">
        {differences.map((difference) => (
          <div
            key={`${difference.label}-${difference.encodedValue}-${difference.reportedValue}`}
            className="rounded-md bg-white/70 px-3 py-2"
          >
            <p className="font-medium">{difference.label}</p>
            <p className="text-xs text-amber-800">
              Encoded: {difference.encodedValue} → Reported:{" "}
              {difference.reportedValue}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewBadge({ status }: { status: Sale["reviewStatus"] }) {
  if (status === "VERIFIED")
    return <Badge className="bg-emerald-100 text-emerald-700">Verified</Badge>;
  if (status === "MISMATCH_REPORTED")
    return <Badge className="bg-rose-100 text-rose-700">Mismatch</Badge>;
  return <Badge variant="outline">Unverified</Badge>;
}

function SaleStatusBadge({ status }: { status: Sale["status"] }) {
  return status === "POSTED" ? (
    <Badge variant="outline">Posted</Badge>
  ) : (
    <Badge className="bg-slate-200 text-slate-700">Voided</Badge>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "rose" | "emerald";
}) {
  const styles = {
    amber: "border-amber-200 bg-amber-50/70 text-amber-900",
    rose: "border-rose-200 bg-rose-50/70 text-rose-900",
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
  } as const;
  return (
    <Card className={styles[tone]}>
      <CardContent className="p-4">
        <p className="text-sm opacity-80">{label}</p>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
