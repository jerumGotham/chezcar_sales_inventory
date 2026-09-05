"use client";

import { Suspense, useEffect, useEffectEvent, useMemo, useRef, useState, type FormEvent } from "react";
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

import { useCan } from "@/components/shell-access-context";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  receiptComparisonSchema,
  type AccountingResolutionActionDto,
  type BranchMismatchResponseDto,
  type ReceiptComparison,
  type SaleCorrectionRequestDto,
} from "@/lib/contracts/sales";
import { cn } from "@/lib/utils";

type NewBranchFinding = Extract<
  BranchMismatchResponseDto,
  "WRONG_RECEIPT_PHOTO" | "SALE_ENCODED_INCORRECT"
>;

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
  branchResponse: BranchMismatchResponseDto | null;
  branchResponseNote: string | null;
  branchReplacementReceiptNumber: string | null;
  branchRespondedAt: string | null;
  receiptPhotoUrl: string | null;
  receiptOcrStatus: "PENDING" | "COMPLETE" | "FAILED" | null;
  receiptOcrError: string | null;
  receiptOcrAt: string | null;
  receiptOcrDraft: {
    rawText: string;
    confidence: number;
    detectedReceiptNumber: string | null;
    detectedTotalAmount: number | null;
    receiptNumberMatches: boolean;
    totalAmountMatches: boolean;
    lines: Array<{
      itemCode: string;
      name: string;
      quantity: number;
      unitPrice: number;
      itemDetected: boolean;
      quantityDetected: boolean;
      priceDetected: boolean;
    }>;
  } | null;
  correctionOfId: string | null;
  resolutionAction: AccountingResolutionActionDto | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  correctionRequest: SaleCorrectionRequestDto | null;
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
    missingEvidence: number;
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

function branchFindingSummary(sale: Sale) {
  switch (sale.branchResponse) {
    case "ORIGINAL_ENCODING_CORRECT":
      return "Branch confirmed the original encoding is correct.";
    case "RECEIPT_CORRECTION_NEEDED":
      return `Branch confirmed a correction is needed. Replacement receipt: ${sale.branchReplacementReceiptNumber ?? "Not recorded"}`;
    case "WRONG_RECEIPT_PHOTO":
      return "Branch found that the wrong receipt photo was uploaded and submitted a replacement for Accounting re-review. Stock is unchanged.";
    case "SALE_ENCODED_INCORRECT":
      return "Branch found that the sale was encoded incorrectly. It is waiting for Admin to void the sale and restore the original stock quantities.";
    default:
      return "Waiting for the branch to double-check this mismatch.";
  }
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
    { credentials: "same-origin", cache: "no-store" },
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
  file: File,
  purpose?: "branch-finding-replacement",
) {
  const formData = new FormData();
  formData.set("photo", file);
  if (purpose) formData.set("purpose", purpose);
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
  const canReview = useCan("sales:verify");
  const canResolve = useCan("sales:resolve");
  const canVoidReplace = useCan("sales:void-replace");
  const canRespond = useCan("sales:mismatch:respond");
  const canViewEvidence = useCan("sales:evidence:view");
  const canUploadEvidence = useCan("sales:evidence:upload");
  const canDeleteEvidence = useCan("sales:evidence:delete");
  const searchParams = useSearchParams();
  const linkedSaleId = searchParams.get("saleId") ?? "";
  const handledLinkedSaleIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [reviewStatusDraft, setReviewStatusDraft] =
    useState<ReceiptFilters["reviewStatus"]>("all");
  const [saleStatusDraft, setSaleStatusDraft] =
    useState<ReceiptFilters["saleStatus"]>("all");
  const [locationDraft, setLocationDraft] = useState("");
  const [dateFromDraft, setDateFromDraft] = useState("");
  const [dateToDraft, setDateToDraft] = useState("");
  const [filters, setFilters] = useState<ReceiptFilters>({
    page: 1,
    pageSize: 10,
    search: "",
    reviewStatus: "all",
    saleStatus: "all",
    locationId: "",
    dateFrom: "",
    dateTo: "",
    saleId: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("PRICE_MISMATCH");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
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
  const [correctionResolutionNote, setCorrectionResolutionNote] = useState("");
  const [branchResponse, setBranchResponse] = useState<NewBranchFinding | null>(null);
  const [branchResponseNote, setBranchResponseNote] = useState("");
  const [branchReplacementPhotoFile, setBranchReplacementPhotoFile] =
    useState<File | null>(null);
  const [branchReplacementPhotoPreview, setBranchReplacementPhotoPreview] =
    useState<string | null>(null);
  const [branchReplacementEvidenceKey, setBranchReplacementEvidenceKey] =
    useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  function clearSelectedPhoto() {
    setPhotoFile(null);
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function clearBranchReplacementPhoto() {
    setBranchReplacementEvidenceKey(null);
    setBranchReplacementPhotoFile(null);
    setBranchReplacementPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["accounting-receipts", filters],
    queryFn: () => fetchReceipts(filters),
    placeholderData: (previousData) => previousData,
  });
  const linkedReceiptQuery = useQuery({
    queryKey: ["accounting-receipt-linked", linkedSaleId],
    queryFn: () => fetchReceipts({
      page: 1,
      pageSize: 5,
      search: "",
      reviewStatus: "all",
      saleStatus: "all",
      locationId: "",
      dateFrom: "",
      dateTo: "",
      saleId: linkedSaleId,
    }),
    enabled: Boolean(linkedSaleId),
  });
  const sales = useMemo(() => data?.data ?? [], [data?.data]);
  const linkedSale = linkedReceiptQuery.data?.data[0] ?? null;
  const meta = data?.meta ?? {
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
    unverified: 0,
    verified: 0,
    mismatches: 0,
    missingEvidence: 0,
  };
  const branches = data?.branches ?? [];

  const reviewMutation = useMutation({
    mutationFn: async (status: "VERIFIED" | "MISMATCH_REPORTED") => {
      if (!canReview) throw new Error("You do not have permission to review receipts.");
      if (!selectedId) throw new Error("Select a receipt first.");
      if (canUploadEvidence && photoFile) await uploadPhoto(selectedId, photoFile);
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
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const resolveMutation = useMutation({
    mutationFn: async (action: AccountingResolutionActionDto) => {
      if (
        (action === "CONFIRMED_CORRECT" && !canResolve) ||
        (action !== "CONFIRMED_CORRECT" && !canVoidReplace)
      ) {
        throw new Error("You do not have permission to resolve this receipt mismatch.");
      }
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
      if (action === "VOIDED_REPLACED" && canUploadEvidence && photoFile) {
        await uploadPhoto(selectedId, photoFile);
      }
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
    onSuccess: (_, action) => {
      if (action === "CONFIRMED_CORRECT") {
        queryClient.setQueriesData<ReceiptListResponse>(
          { queryKey: ["accounting-receipts"] },
          (current) => {
            if (!current) return current;
            const resolvedSale = current.data.find((sale) => sale.id === selectedId);
            if (!resolvedSale) return current;
            return {
              ...current,
              data: current.data.map((sale) => sale.id === selectedId
                ? {
                    ...sale,
                    reviewStatus: "VERIFIED",
                    resolutionAction: "CONFIRMED_CORRECT",
                    resolutionNote: resolutionNote.trim(),
                  }
                : sale),
              meta: {
                ...current.meta,
                verified: current.meta.verified + (resolvedSale.reviewStatus === "VERIFIED" ? 0 : 1),
                mismatches: Math.max(0, current.meta.mismatches - (resolvedSale.reviewStatus === "MISMATCH_REPORTED" ? 1 : 0)),
              },
            };
          },
        );
      }
      setSelectedId(null);
      setResolutionNote("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-receipt-linked"] });
      if (action !== "CONFIRMED_CORRECT") {
        queryClient.invalidateQueries({ queryKey: ["customer-direct-sales-list"] });
        queryClient.invalidateQueries({ queryKey: ["pos-options"] });
        queryClient.invalidateQueries({ queryKey: ["customer-order-options"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-availability"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["customer-history"] });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const branchResponseMutation = useMutation({
    mutationFn: async () => {
      if (!canRespond) throw new Error("You do not have permission to respond to receipt mismatches.");
      if (!selectedId) throw new Error("Select a receipt first.");
      if (!branchResponse) throw new Error("Select a branch finding.");
      let replacementEvidenceKey = branchReplacementEvidenceKey;
      if (branchResponse === "WRONG_RECEIPT_PHOTO") {
        if (!canUploadEvidence) {
          throw new Error("You do not have permission to upload replacement receipt evidence.");
        }
        if (!replacementEvidenceKey) {
          if (!branchReplacementPhotoFile) {
            throw new Error("Select the correct replacement receipt photo.");
          }
          replacementEvidenceKey = await uploadPhoto(
            selectedId,
            branchReplacementPhotoFile,
            "branch-finding-replacement",
          );
          setBranchReplacementEvidenceKey(replacementEvidenceKey);
        }
      }
      const response = await fetch(
        `/api/accounting/receipts/${selectedId}/branch-response`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: branchResponse,
            note: branchResponseNote,
            replacementEvidenceKey:
              branchResponse === "WRONG_RECEIPT_PHOTO"
                ? replacementEvidenceKey
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
      clearBranchReplacementPhoto();
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-receipt-linked"] });
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const correctionResolutionMutation = useMutation({
    mutationFn: async (action: "KEEP_SALE" | "VOID_SALE") => {
      if (!canVoidReplace) throw new Error("You do not have permission to resolve sale correction requests.");
      if (!selectedId) throw new Error("Select a sale first.");
      if (!selectedSale?.correctionRequest?.id) throw new Error("The pending correction request is unavailable. Reload and try again.");
      if (!correctionResolutionNote.trim()) throw new Error("Admin resolution note is required.");
      const response = await fetch(
        `/api/sales/${encodeURIComponent(selectedId)}/correction-request`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correctionRequestId: selectedSale?.correctionRequest?.id,
            action,
            note: correctionResolutionNote,
          }),
        },
      );
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Unable to resolve the correction request");
      }
    },
    onSuccess: async () => {
      setSelectedId(null);
      setCorrectionResolutionNote("");
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["accounting-receipt-linked"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-direct-sales-list"] }),
        queryClient.invalidateQueries({ queryKey: ["pos-options"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const selectedSale =
    sales.find((sale) => sale.id === selectedId) ??
    (linkedSale?.id === selectedId ? linkedSale : null);
  const evidenceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !photoFile) throw new Error("Select a receipt photo first.");
      return uploadPhoto(selectedId, photoFile);
    },
    onSuccess: () => {
      clearSelectedPhoto();
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });
  const deleteEvidenceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a receipt first.");
      const response = await fetch(`/api/accounting/receipts/${encodeURIComponent(selectedId)}/photo`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Unable to delete receipt photo");
    },
    onSuccess: () => {
      clearSelectedPhoto();
      setFormError(null);
      queryClient.setQueriesData<ReceiptListResponse>(
        { queryKey: ["accounting-receipts"] },
        (current) => current
          ? {
              ...current,
              data: current.data.map((sale) => sale.id === selectedId
                ? {
                    ...sale,
                    receiptPhotoUrl: null,
                    receiptOcrStatus: null,
                    receiptOcrDraft: null,
                    receiptOcrError: null,
                    receiptOcrAt: null,
                  }
                : sale),
            }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

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
    filters.saleStatus !== "all" ||
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
    setSaleStatusDraft("all");
    setLocationDraft("");
    setDateFromDraft("");
    setDateToDraft("");
    setFilters({
      page: 1,
      pageSize: 10,
      search: "",
      reviewStatus: "all",
      saleStatus: "all",
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
    setCorrectionResolutionNote("");
    setBranchResponse(
      sale.branchResponse === "WRONG_RECEIPT_PHOTO" ||
        sale.branchResponse === "SALE_ENCODED_INCORRECT"
        ? sale.branchResponse
        : null,
    );
    setBranchResponseNote(sale.branchResponseNote ?? "");
    clearSelectedPhoto();
    clearBranchReplacementPhoto();
  };

  const selectLinkedSale = useEffectEvent(selectSale);

  useEffect(() => {
    if (!linkedSaleId || handledLinkedSaleIdRef.current === linkedSaleId) return;
    if (!linkedSale || linkedSale.id !== linkedSaleId) return;
    handledLinkedSaleIdRef.current = linkedSaleId;
    // Initialize the selected transaction after its linked notification query loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    selectLinkedSale(linkedSale);
  }, [linkedSale, linkedSaleId]);

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
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const handleBranchReplacementPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Receipt evidence must be an image file.");
      return;
    }
    if (file.size > 6_000_000) {
      setFormError("Receipt image must be 6 MB or smaller.");
      return;
    }
    setBranchReplacementEvidenceKey(null);
    setBranchReplacementPhotoFile(file);
    setBranchReplacementPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
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
    selectedSale.correctionRequest?.status !== "PENDING" &&
    ((canReview && selectedSale.reviewStatus === "UNVERIFIED") ||
      (canVoidReplace &&
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
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Evidence pending" value={meta.missingEvidence} tone="amber" />
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
              <option value="all">All sale statuses</option>
              <option value="POSTED">Posted sales</option>
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
                <table className="w-full min-w-[840px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3">Receipt</th>
                      <th className="px-3 py-3">Branch</th>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Total</th>
                      <th className="px-3 py-3">Evidence</th>
                       <th className="px-3 py-3">Status</th>
                       <th className="px-3 py-3">Resolution note</th>
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
                          {sale.status === "VOIDED" ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            <Badge variant={sale.receiptPhotoUrl ? "secondary" : "outline"}>
                              {sale.receiptPhotoUrl ? "Attached" : "Pending"}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-col items-start gap-1">
                            {sale.status === "VOIDED" ? (
                              <SaleStatusBadge status={sale.status} />
                            ) : (
                              <ReviewBadge status={sale.reviewStatus} />
                            )}
                            {sale.correctionRequest?.status === "PENDING" ? (
                              <Badge className="border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
                                Correction requested
                              </Badge>
                            ) : null}
                          </div>
                         </td>
                         <td className="max-w-56 px-3 py-4 text-xs text-slate-600">
                           <span className="line-clamp-2">{sale.resolutionNote ?? sale.correctionRequest?.resolutionNote ?? "-"}</span>
                         </td>
                        <td className="px-3 py-4 text-right">
                          <Button
                            size="sm"
                            variant="view"
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
                    {selectedSale.status === "POSTED" ? (
                      <ReviewBadge status={selectedSale.reviewStatus} />
                    ) : null}
                  </div>
                </div>
                {selectedSale.correctionRequest ? (
                  <div className={selectedSale.correctionRequest.status === "PENDING"
                    ? "space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    : "space-y-2 rounded-xl border bg-muted/40 p-4 text-sm text-foreground"}
                  >
                    <div>
                      <p className="font-semibold">
                        {selectedSale.correctionRequest.status === "PENDING"
                          ? "Branch correction request pending"
                          : `Branch correction request ${selectedSale.correctionRequest.resolution === "VOIDED" ? "approved" : "dismissed"}`}
                      </p>
                      <p className="mt-1">
                        {selectedSale.correctionRequest.reason.toLowerCase().replaceAll("_", " ")}: {selectedSale.correctionRequest.note}
                      </p>
                      <p className="mt-2 text-xs opacity-80">
                        Reported by {selectedSale.correctionRequest.requestedBy} on {new Date(selectedSale.correctionRequest.requestedAt).toLocaleString("en-PH")}.
                      </p>
                      {selectedSale.correctionRequest.resolutionNote ? (
                        <p className="mt-2 border-t pt-2">
                          Admin resolution: {selectedSale.correctionRequest.resolutionNote}
                        </p>
                      ) : null}
                    </div>
                    {selectedSale.correctionRequest.status === "PENDING" && canVoidReplace && selectedSale.status === "POSTED" ? (
                      <div className="space-y-3 border-t border-amber-200 pt-3">
                        <div className="space-y-2">
                          <Label htmlFor="correction-resolution-note">Admin resolution note</Label>
                          <Textarea
                            id="correction-resolution-note"
                            value={correctionResolutionNote}
                            onChange={(event) => setCorrectionResolutionNote(event.target.value)}
                            placeholder="Explain why the sale stays posted or why its stock deduction must be reversed"
                            maxLength={5_000}
                            rows={3}
                            disabled={correctionResolutionMutation.isPending}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => correctionResolutionMutation.mutate("KEEP_SALE")}
                            disabled={correctionResolutionMutation.isPending || !correctionResolutionNote.trim()}
                          >
                            Keep sale posted
                          </Button>
                          {["ACCIDENTAL_SUBMISSION", "DUPLICATE_SUBMISSION", "SALE_DID_NOT_HAPPEN"].includes(selectedSale.correctionRequest.reason) ? (
                            <Button
                              variant="destructive"
                              onClick={() => {
                                if (window.confirm("Approve this request and reverse the original inventory deduction?")) {
                                  correctionResolutionMutation.mutate("VOID_SALE");
                                }
                              }}
                              disabled={correctionResolutionMutation.isPending || !correctionResolutionNote.trim()}
                            >
                              {correctionResolutionMutation.isPending ? "Resolving..." : "Approve and void sale"}
                            </Button>
                          ) : null}
                        </div>
                        {!["ACCIDENTAL_SUBMISSION", "DUPLICATE_SUBMISSION", "SALE_DID_NOT_HAPPEN"].includes(selectedSale.correctionRequest.reason) ? (
                          <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                            If a real sale occurred with wrong information, keep this sale posted and use receipt mismatch plus void-and-replace after evidence review.
                          </p>
                        ) : null}
                        <p className="text-xs">
                          Inventory changes only when Approve and void sale succeeds. Keeping the sale creates no stock movement.
                        </p>
                      </div>
                    ) : selectedSale.correctionRequest.status === "PENDING" ? (
                      <p className="border-t border-amber-200 pt-3 text-xs">
                        Inventory remains deducted while this request waits for Admin resolution.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid items-start gap-4 xl:grid-cols-2">
                  <ReceiptSummary
                    title="System sale input"
                    receiptBooklet={selectedSale.receiptBooklet}
                    receiptNumber={selectedSale.manualReceiptNumber}
                    paymentMethod={selectedSale.paymentMethod}
                    discountAmount={selectedSale.discountAmount}
                    amountPaid={selectedSale.amountPaid}
                    totalAmount={selectedSale.totalAmount}
                    lines={selectedSale.lines}
                  />
                  <div className="space-y-4 rounded-xl border p-4">
                    <div>
                      <p className="font-semibold">1. Uploaded receipt photo</p>
                      <p className="mt-1 text-xs text-slate-500">This is the receipt Accounting must verify.</p>
                    </div>
                    {canViewEvidence && selectedSale.receiptPhotoUrl ? (
                      <Image
                        src={selectedSale.receiptPhotoUrl}
                        alt="Uploaded handwritten receipt"
                        width={800}
                        height={1000}
                        unoptimized
                        className="max-h-[32rem] w-full rounded-xl border bg-slate-50 object-contain"
                      />
                    ) : (
                      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No receipt image uploaded.</p>
                    )}
                    {canDeleteEvidence &&
                    selectedSale.receiptPhotoUrl &&
                    selectedSale.status === "POSTED" &&
                    selectedSale.reviewStatus === "UNVERIFIED" ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deleteEvidenceMutation.isPending || evidenceMutation.isPending || reviewMutation.isPending}
                        onClick={() => {
                          if (window.confirm("Delete this receipt photo and its OCR result?")) {
                            deleteEvidenceMutation.mutate();
                          }
                        }}
                      >
                        <Trash2 className="mr-2 size-4" />
                        {deleteEvidenceMutation.isPending ? "Deleting..." : "Delete receipt photo"}
                      </Button>
                    ) : null}
                    {selectedSale.receiptOcrStatus === "PENDING" && <p className="text-sm text-sky-700">Reading receipt...</p>}
                    {selectedSale.receiptOcrStatus === "FAILED" && <p className="text-sm text-red-700">{selectedSale.receiptOcrError}</p>}
                    {selectedSale.receiptOcrDraft && (
                      <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-sm">
                        <div>
                          <p className="font-semibold text-sky-950">2. Details read by OCR</p>
                          <p className="mt-1 text-xs text-sky-800">Computer-read draft only. Compare these results with the receipt photo before confirming.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">OCR confidence {selectedSale.receiptOcrDraft.confidence}%</Badge>
                          <Badge variant={selectedSale.receiptOcrDraft.receiptNumberMatches ? "secondary" : "outline"} className={selectedSale.receiptOcrDraft.receiptNumberMatches ? undefined : "border-red-200 bg-red-50 text-red-700"}>Receipt number {selectedSale.receiptOcrDraft.receiptNumberMatches ? "found" : "not matched"}</Badge>
                          <Badge variant={selectedSale.receiptOcrDraft.totalAmountMatches ? "secondary" : "outline"} className={selectedSale.receiptOcrDraft.totalAmountMatches ? undefined : "border-red-200 bg-red-50 text-red-700"}>Total {selectedSale.receiptOcrDraft.totalAmountMatches ? "matched" : "not matched"}</Badge>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-slate-500">Detected receipt number</p>
                            <p className="mt-1 font-semibold">{selectedSale.receiptOcrDraft.detectedReceiptNumber ?? "Not detected"}</p>
                          </div>
                          <div className="rounded-lg border bg-background p-3">
                            <p className="text-xs text-slate-500">Detected total</p>
                            <p className="mt-1 font-semibold">{selectedSale.receiptOcrDraft.detectedTotalAmount === null ? "Not detected" : formatPeso(selectedSale.receiptOcrDraft.detectedTotalAmount)}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {selectedSale.receiptOcrDraft.lines.map((line) => (
                            <div key={line.itemCode} className="rounded-lg border bg-background p-3">
                              <p className="font-medium">{line.itemCode} - {line.name}</p>
                              <p className="mt-1 text-xs text-slate-500">Expected from system: Qty {line.quantity} at {formatPeso(line.unitPrice)}</p>
                              <p className="mt-1 text-xs">OCR check: Item {line.itemDetected ? "found" : "not found"} · Qty {line.quantityDetected ? "found" : "not found"} · Price {line.priceDetected ? "found" : "not found"}</p>
                            </div>
                          ))}
                        </div>
                        <details>
                          <summary className="cursor-pointer font-medium">Show all text read by OCR</summary>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{selectedSale.receiptOcrDraft.rawText || "No text recognized."}</pre>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
                {selectedSale.reportedComparison && (
                  <ReceiptSummary
                    title="Persisted reported receipt"
                    {...selectedSale.reportedComparison}
                  />
                )}
                {selectedSale.status === "VOIDED" && (
                  <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                    <p className="font-medium">This sale is voided and excluded from active sales.</p>
                    {selectedSale.resolutionNote ? (
                      <p className="mt-1">Resolution note: {selectedSale.resolutionNote}</p>
                    ) : null}
                  </div>
                )}
                {selectedSale.reviewStatus === "VERIFIED" && selectedSale.resolutionNote && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    <p className="font-medium">Original encoding confirmed</p>
                    <p className="mt-1">Resolution note: {selectedSale.resolutionNote}</p>
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
                        {branchFindingSummary(selectedSale)}
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
                {selectedSale.branchResponse === "WRONG_RECEIPT_PHOTO" &&
                selectedSale.reviewStatus !== "MISMATCH_REPORTED" && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                    <p className="font-medium">Replacement photo submitted for Accounting re-review</p>
                    <p className="mt-1">
                      The previous mismatch was reopened as unverified. This photo correction did not change the sale or create any stock movement.
                    </p>
                    {selectedSale.branchResponseNote ? (
                      <p className="mt-2 border-t border-sky-200 pt-2 dark:border-sky-800">
                        Branch note: {selectedSale.branchResponseNote}
                      </p>
                    ) : null}
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
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Branch finding</legend>
                        <label
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-xl border bg-background p-4",
                            branchResponse === "WRONG_RECEIPT_PHOTO" &&
                              "border-sky-500 ring-2 ring-sky-200 dark:ring-sky-900",
                          )}
                        >
                          <input
                            type="radio"
                            name="branch-finding"
                            value="WRONG_RECEIPT_PHOTO"
                            checked={branchResponse === "WRONG_RECEIPT_PHOTO"}
                            onChange={() => setBranchResponse("WRONG_RECEIPT_PHOTO")}
                            className="mt-1 size-4"
                          />
                          <span>
                            <span className="block font-medium">Wrong receipt photo uploaded.</span>
                            <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">
                              Upload the correct replacement photo below. Accounting will re-review it, and no stock quantity changes.
                            </span>
                          </span>
                        </label>
                        <label
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-xl border bg-background p-4",
                            branchResponse === "SALE_ENCODED_INCORRECT" &&
                              "border-sky-500 ring-2 ring-sky-200 dark:ring-sky-900",
                          )}
                        >
                          <input
                            type="radio"
                            name="branch-finding"
                            value="SALE_ENCODED_INCORRECT"
                            checked={branchResponse === "SALE_ENCODED_INCORRECT"}
                            onChange={() => setBranchResponse("SALE_ENCODED_INCORRECT")}
                            className="mt-1 size-4"
                          />
                          <span>
                            <span className="block font-medium">Sale was encoded incorrectly.</span>
                            <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">
                              Add a note for Admin. If Admin voids the sale, the original stock quantities will be restored.
                            </span>
                          </span>
                        </label>
                      </fieldset>
                      {branchResponse === "WRONG_RECEIPT_PHOTO" && (
                        <div className="space-y-3 rounded-xl border border-sky-200 bg-background p-4 dark:border-sky-800">
                          <div>
                            <Label htmlFor="branch-replacement-photo">Correct replacement receipt photo</Label>
                            <p className="mt-1 text-xs text-slate-500">
                              This image is uploaded first. The mismatch stays open if the finding cannot be submitted, so you can retry.
                            </p>
                          </div>
                          <Input
                            id="branch-replacement-photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            disabled={!canUploadEvidence || branchResponseMutation.isPending}
                            onChange={(event) => handleBranchReplacementPhoto(event.target.files?.[0])}
                          />
                          {branchReplacementPhotoPreview ? (
                            <Image
                              src={branchReplacementPhotoPreview}
                              alt="Replacement receipt preview"
                              width={800}
                              height={600}
                              unoptimized
                              className="max-h-48 w-full rounded-xl border object-contain"
                            />
                          ) : null}
                          {branchReplacementEvidenceKey ? (
                            <p className="text-xs text-sky-700 dark:text-sky-300">
                              Replacement photo uploaded. Submit again to retry the branch finding.
                            </p>
                          ) : null}
                          {!canUploadEvidence ? (
                            <p className="text-xs text-red-600">You do not have permission to upload the required replacement photo.</p>
                          ) : null}
                        </div>
                      )}
                      {branchResponse === "SALE_ENCODED_INCORRECT" && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          No replacement photo or receipt number is needed. Stock remains unchanged until Admin approves the void.
                        </p>
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
                        variant="workflow"
                        onClick={() => branchResponseMutation.mutate()}
                        disabled={
                          branchResponseMutation.isPending ||
                          !branchResponse ||
                          !branchResponseNote.trim() ||
                          (branchResponse === "WRONG_RECEIPT_PHOTO" &&
                            (!canUploadEvidence ||
                              (!branchReplacementPhotoFile && !branchReplacementEvidenceKey)))
                        }
                      >
                        {selectedSale.branchResponse
                          ? "Update branch response"
                          : "Submit branch response"}
                      </Button>
                    </div>
                  )}
                {selectedSale.status === "POSTED" && !selectedSale.receiptPhotoUrl && !photoPreview ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Receipt evidence is pending. Attach the handwritten receipt photo before confirming the sale or reporting a mismatch.
                  </div>
                ) : null}
                {canUploadEvidence &&
                selectedSale.status === "POSTED" &&
                (selectedSale.reviewStatus === "UNVERIFIED" ||
                  selectedSale.branchResponse === "RECEIPT_CORRECTION_NEEDED") ? (
                  <div className="space-y-3 rounded-xl border p-4">
                    <div>
                      <Label htmlFor="receipt-photo">
                        {selectedSale.receiptPhotoUrl ? "Replace receipt photo" : "Attach receipt photo"}
                      </Label>
                      <p className="mt-1 text-xs text-slate-500">
                        Choose a file only when the receipt is missing or the current photo is unreadable. Uploading a replacement runs OCR again.
                      </p>
                    </div>
                    <Input
                      id="receipt-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={(event) => handlePhoto(event.target.files?.[0])}
                    />
                    {photoPreview ? (
                      <Image
                        src={photoPreview}
                        alt="Receipt preview"
                        width={800}
                        height={600}
                        unoptimized
                        className="max-h-40 w-full rounded-xl border object-contain"
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="workflow"
                        size="sm"
                        onClick={() => evidenceMutation.mutate()}
                        disabled={!photoFile || evidenceMutation.isPending}
                      >
                        <Upload className="mr-2 size-4" />
                        {evidenceMutation.isPending
                          ? "Uploading..."
                          : selectedSale.receiptPhotoUrl
                            ? "Replace receipt photo"
                            : "Attach receipt photo"}
                      </Button>
                      {photoFile ? (
                        <Button type="button" variant="outline" size="sm" onClick={clearSelectedPhoto}>
                          Clear selection
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {canEditComparison &&
                selectedSale.reviewStatus !== "VERIFIED" ? (
                  <div className="space-y-4 rounded-xl border p-4">
                    <div>
                      <p className="font-semibold">3. Accounting verification details</p>
                      <p className="mt-1 text-xs text-slate-500">
                        These editable fields start with the system sale values, not the OCR result. Compare them with the photo and OCR text, then correct only the values that differ.
                      </p>
                    </div>
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
                        <span>Item code - name</span>
                        <span>Quantity</span>
                        <span>Unit price</span>
                        <span />
                      </div>
                      <div className="mt-2 space-y-3">
                        {comparison.lines.map((line, index) => {
                          const saleLine = selectedSale.lines.find(
                            (item) => item.itemCode === line.itemCode,
                          );
                          return (
                            <div
                              key={index}
                              className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_100px_120px_40px] sm:bg-transparent sm:p-0"
                            >
                              <div className="space-y-1">
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
                                {saleLine ? (
                                  <p className="px-1 text-xs text-slate-500">
                                    {saleLine.itemCode} - {saleLine.name}
                                  </p>
                                ) : null}
                              </div>
                              <Input
                                aria-label={`Quantity ${index + 1}`}
                                placeholder="Quantity"
                                type="number"
                                min="1"
                                step="1"
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
                                variant="destructive"
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
                      selectedSale.correctionRequest?.status !== "PENDING" &&
                      selectedSale.reviewStatus === "UNVERIFIED" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="workflow"
                          onClick={() => reviewMutation.mutate("VERIFIED")}
                          disabled={
                            reviewMutation.isPending || Boolean(comparisonError) || differences.length > 0 || (!selectedSale.receiptPhotoUrl && !photoFile)
                          }
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Confirm correct
                        </Button>
                        <span className="self-center text-xs text-slate-500">
                          Correct all comparison fields and attach receipt evidence before confirming.
                        </span>
                      </div>
                    )}
                    {canReview &&
                      selectedSale.correctionRequest?.status !== "PENDING" &&
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
                    {canReview &&
                      selectedSale.correctionRequest?.status !== "PENDING" &&
                      selectedSale.reviewStatus === "UNVERIFIED" && (
                      <Button
                        variant="warning"
                        onClick={() => {
                          if (!notes.trim()) {
                            setFormError(
                              "Notes are required when reporting a mismatch.",
                            );
                            return;
                          }
                          reviewMutation.mutate("MISMATCH_REPORTED");
                        }}
                        disabled={
                          reviewMutation.isPending ||
                          Boolean(comparisonError) ||
                          (!selectedSale.receiptPhotoUrl && !photoFile)
                        }
                      >
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Report mismatch
                      </Button>
                    )}
                  </div>
                ) : null}
                {(canResolve || canVoidReplace) &&
                  selectedSale.reviewStatus === "MISMATCH_REPORTED" &&
                  !selectedSale.branchResponse && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Final resolution is available after the branch submits its
                      double-check response.
                    </div>
                  )}
                {(canResolve || canVoidReplace) &&
                  selectedSale.reviewStatus === "MISMATCH_REPORTED" &&
                  ((selectedSale.branchResponse === "ORIGINAL_ENCODING_CORRECT" && canResolve) ||
                    ((selectedSale.branchResponse === "RECEIPT_CORRECTION_NEEDED" ||
                      selectedSale.branchResponse === "SALE_ENCODED_INCORRECT") &&
                      canVoidReplace)) && (
                    <div className="space-y-4 border-t pt-4">
                      {selectedSale.branchResponse === "SALE_ENCODED_INCORRECT" ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          Voiding restores every original sale line to branch inventory, records reversal movements, and creates no replacement sale.
                        </p>
                      ) : null}
                      <div className="grid gap-2">
                        <Label htmlFor="resolution-note">
                          {selectedSale.branchResponse === "SALE_ENCODED_INCORRECT"
                            ? "Admin void note"
                            : "Resolution note"}
                        </Label>
                        <Textarea
                          id="resolution-note"
                          value={resolutionNote}
                          onChange={(event) =>
                            setResolutionNote(event.target.value)
                          }
                          placeholder={selectedSale.branchResponse === "SALE_ENCODED_INCORRECT"
                            ? "Explain why this incorrectly encoded sale must be voided"
                            : "Explain why this mismatch is being resolved"}
                        />
                      </div>
                      {selectedSale.branchResponse ===
                        "ORIGINAL_ENCODING_CORRECT" && canResolve && (
                        <Button
                          variant="workflow"
                          onClick={() =>
                            resolveMutation.mutate("CONFIRMED_CORRECT")
                          }
                          disabled={
                            resolveMutation.isPending ||
                            !resolutionNote.trim() ||
                            Boolean(comparisonError)
                          }
                        >
                          Confirm original encoding
                        </Button>
                      )}
                      {selectedSale.branchResponse ===
                        "RECEIPT_CORRECTION_NEEDED" && canVoidReplace && (
                        <Button
                          variant="destructive"
                          onClick={() =>
                            resolveMutation.mutate("VOIDED_REPLACED")
                          }
                          disabled={
                            resolveMutation.isPending ||
                            !resolutionNote.trim() ||
                            Boolean(comparisonError)
                          }
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Void and replace
                        </Button>
                      )}
                      {selectedSale.branchResponse === "SALE_ENCODED_INCORRECT" && canVoidReplace && (
                        <Button
                          variant="destructive"
                          onClick={() => {
                            if (window.confirm("Void this sale and restore its original line quantities to branch inventory? This cannot be undone.")) {
                              resolveMutation.mutate("VOIDED");
                            }
                          }}
                          disabled={resolveMutation.isPending || !resolutionNote.trim()}
                        >
                          {resolveMutation.isPending
                            ? "Voiding sale..."
                            : "Void sale and restore inventory"}
                        </Button>
                      )}
                    </div>
                  )}
                {selectedSale.reviewStatus === "MISMATCH_REPORTED" &&
                selectedSale.branchResponse === "RECEIPT_CORRECTION_NEEDED" &&
                canResolve &&
                !canVoidReplace ? (
                  <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    The branch confirmed a correction. You do not have permission to void and replace the original sale.
                  </p>
                ) : null}
                {selectedSale.reviewStatus === "MISMATCH_REPORTED" &&
                selectedSale.branchResponse === "SALE_ENCODED_INCORRECT" &&
                canResolve &&
                !canVoidReplace ? (
                  <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    This finding requires Admin permission to void the sale and restore its original inventory quantities.
                  </p>
                ) : null}
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
