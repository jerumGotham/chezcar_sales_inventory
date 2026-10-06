"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";
import {
  RotateCcw,
  FileText,
  Loader2,
  ShoppingBag,
  Clock3,
  CheckCircle2,
  Eye,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { PageShell } from "@/components/page-shell";
import { TablePagination } from "@/components/table-pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useShellAccess } from "@/components/shell-access-context";
import { getCustomerOrderActions, type CustomerOrderStatusCode } from "@/lib/customer-order-actions";
import { hasCapability } from "@/lib/permissions";
import type {
  SaleRefundSummaryDto,
  SaleCorrectionRequestDto,
  SaleCorrectionRequestReasonDto,
} from "@/lib/contracts/sales";
import { cn } from "@/lib/utils";
import { reactSelectStyles } from "@/lib/select-styles";
import { SaleRefundDialog } from "@/components/sale-refund-dialog";
import { StatusBanner } from "@/components/status-banner";
import {
  CANCELLATION_SETTLEMENT_OPTIONS,
  type CancellationSettlementDto,
} from "@/lib/contracts/refunds";

type SelectOption = {
  value: string;
  label: string;
};

type OrderStatus =
  | "Reserved"
  | "Pending"
  | "For Release"
  | "Released"
  | "Cancelled";

type PaymentStatus = "Unpaid" | "Partial" | "Paid";

type CustomerOrderRow = {
  salesperson: { personnelId: string; name: string; branch: { id: string; code: string; name: string } } | null;
  id: string;
  orderNo: string;
  customer: string;
  itemSummary: string;
  totalItems: number;
  status: OrderStatus;
  statusCode: CustomerOrderStatusCode;
  paymentStatus: PaymentStatus;
  downpayment: number;
  totalAmount: number;
  balance: number;
  orderDate: string;
  releaseDate: string;
};

type CustomerOrdersApiResponse = {
  data: CustomerOrderRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalOrders: number;
    pendingOrders: number;
    forReleaseOrders: number;
    releasedOrders: number;
    totalDownpayments: number;
  };
};

type DirectSaleRow = {
  salesperson: { personnelId: string; name: string; branch: { id: string; code: string; name: string } } | null;
  id: string;
  reference: string;
  source: "Customer Order" | "Direct Sale";
  manualReceiptNumber: string;
  branch: string;
  branchId: string;
  soldAt: string;
  customer: string;
  totalAmount: number;
  discountAmount: number;
  amountPaid: number;
  paymentMethod: string;
  status: string;
  postedAt: string;
  postedBy: string;
  reviewStatus: string;
  correctionRequest: SaleCorrectionRequestDto | null;
  refundedAmount: number;
  refunds: SaleRefundSummaryDto[];
  lines: Array<{
    productId: string;
    itemCode: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
};

const SALE_CORRECTION_REASON_OPTIONS: Array<{
  value: SaleCorrectionRequestReasonDto;
  label: string;
}> = [
  { value: "ACCIDENTAL_SUBMISSION", label: "Accidental submission" },
  { value: "DUPLICATE_SUBMISSION", label: "Duplicate submission" },
  { value: "WRONG_INFORMATION", label: "Wrong sale information" },
  { value: "SALE_DID_NOT_HAPPEN", label: "Sale did not happen" },
  { value: "OTHER", label: "Other" },
];

function saleCorrectionReasonLabel(reason: SaleCorrectionRequestReasonDto) {
  return SALE_CORRECTION_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? reason;
}

const ORDER_STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Statuses" },
  { value: "Reserved", label: "Reserved" },
  { value: "Pending", label: "Pending" },
  { value: "For Release", label: "For Release" },
  { value: "Released", label: "Released" },
  { value: "Cancelled", label: "Cancelled" },
];

const PAYMENT_METHOD_OPTIONS: SelectOption[] = [
  { value: "CASH", label: "Cash" },
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "SPLIT", label: "Split Payment" },
];

const PAYMENT_STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Payment Statuses" },
  { value: "Unpaid", label: "Unpaid" },
  { value: "Partial", label: "Partial" },
  { value: "Paid", label: "Paid" },
];

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH")}`;
}

function formatDate(value: string) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getOrderStatusBadgeClass(status: OrderStatus) {
  switch (status) {
    case "Reserved":
      return "border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:bg-violet-950/40";
    case "Pending":
      return "border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:bg-amber-950/40";
    case "For Release":
      return "border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:bg-sky-950/40";
    case "Released":
      return "border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:bg-emerald-950/40";
    case "Cancelled":
      return "border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:bg-rose-950/40";
    default:
      return "border border-border bg-muted text-foreground hover:bg-muted";
  }
}

function getPaymentStatusBadgeClass(status: PaymentStatus) {
  switch (status) {
    case "Unpaid":
      return "border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:bg-rose-950/40";
    case "Partial":
      return "border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:bg-amber-950/40";
    case "Paid":
      return "border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:bg-emerald-950/40";
    default:
      return "border border-border bg-muted text-foreground hover:bg-muted";
  }
}

async function fetchCustomerOrders(params: {
  page: number;
  pageSize: number;
  orderNo: string;
  customer: string;
  orderStatus: string;
  paymentStatus: string;
}): Promise<CustomerOrdersApiResponse> {
  const { page, pageSize, orderNo, customer, orderStatus, paymentStatus } =
    params;

  const response = await fetch("/api/customer-orders", { credentials: "same-origin" });
  const payload = (await response.json()) as { data?: CustomerOrderRow[]; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Unable to load customer orders");
  const orders = payload.data ?? [];
  let filtered = [...orders];

  if (orderNo.trim()) {
    const keyword = orderNo.trim().toLowerCase();
    filtered = filtered.filter((order) =>
      order.orderNo.toLowerCase().includes(keyword),
    );
  }

  if (customer.trim()) {
    const keyword = customer.trim().toLowerCase();
    filtered = filtered.filter((order) =>
      order.customer.toLowerCase().includes(keyword),
    );
  }

  if (orderStatus !== "all") {
    filtered = filtered.filter((order) => order.status === orderStatus);
  }

  if (paymentStatus !== "all") {
    filtered = filtered.filter(
      (order) => order.paymentStatus === paymentStatus,
    );
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginated = filtered.slice(startIndex, endIndex);

  return {
    data: paginated,
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    summary: {
      totalOrders: orders.length,
      pendingOrders: orders.filter(
        (item) => item.status === "Pending" || item.status === "Reserved",
      ).length,
      forReleaseOrders: orders.filter(
        (item) => item.status === "For Release",
      ).length,
      releasedOrders: orders.filter((item) => item.status === "Released")
        .length,
      totalDownpayments: orders.reduce(
        (sum, item) => sum + item.downpayment,
        0,
      ),
    },
  };
}

type SalesFilterBranch = { id: string; code: string; name: string };

const SALES_PERIOD_OPTIONS: SelectOption[] = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "last7Days", label: "Last 7 Days" },
  { value: "monthToDate", label: "Month to Date" },
];

type DirectSalesApiResponse = {
  data: DirectSaleRow[];
  summary: {
    totalSales: number;
    totalAmount: number;
    totalDiscounts: number;
    totalAmountPaid: number;
    /** Handed back on these sales; the two totals above are already net of it. */
    totalRefunded: number;
  };
  /** What the list was narrowed to, when it came from the dashboard. */
  appliedFilter: { periodLabel: string; branchLabel: string } | null;
  /** Empty for anyone who may not filter, which is how the controls decide. */
  filterBranches: SalesFilterBranch[];
};

async function fetchDirectSales(
  source: "direct" | "all",
  salesPeriod: string,
  salesBranchId: string,
): Promise<DirectSalesApiResponse> {
  const params = new URLSearchParams({ source });
  if (salesPeriod) params.set("salesPeriod", salesPeriod);
  if (salesBranchId) params.set("salesBranchId", salesBranchId);
  const response = await fetch(`/api/sales?${params}`, { credentials: "same-origin" });
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message ?? "Unable to load direct sales");
  }
  return (await response.json()) as DirectSalesApiResponse;
}


export default function CustomerOrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useShellAccess();
  const capabilities = access.authenticated ? access.capabilities : [];
  const canViewOrders = hasCapability(capabilities, "customer-orders:view");
  const canViewSales = hasCapability(capabilities, "sales:view");
  const canRequestSaleCorrection = hasCapability(capabilities, "sales:correction:request");
  const canCorrectSalesperson = hasCapability(capabilities, "sales:salesperson:update");
  const canRefundSale = hasCapability(capabilities, "sales:refund");
  const canAttachReceipt = hasCapability(capabilities, "sales:evidence:upload");
  // Carried from the dashboard, so a figure clicked there opens the sales
  // behind it rather than everything.
  const salesPeriodFilter = searchParams.get("salesPeriod") ?? "";
  const salesBranchFilter = searchParams.get("salesBranchId") ?? "";
  /*
   * Which sales the tab lists. "all" includes the sales written when a customer
   * order is released, which is what the dashboard's Sales card totals; the
   * Direct Sales tab leaves them out, as it always has.
   */
  const salesSource = searchParams.get("source") === "all" ? "all" : "direct";
  const activeView = searchParams.get("view") === "orders" && canViewOrders
    ? "orders"
    : canViewSales ? "sales" : canViewOrders ? "orders" : null;
  const [orderNo, setOrderNo] = useState("");
  const [customer, setCustomer] = useState("");
  const [orderStatus, setOrderStatus] = useState<SelectOption>(
    ORDER_STATUS_OPTIONS[0],
  );
  const [paymentStatus, setPaymentStatus] = useState<SelectOption>(
    PAYMENT_STATUS_OPTIONS[0],
  );

  const [appliedOrderNo, setAppliedOrderNo] = useState("");
  const [appliedCustomer, setAppliedCustomer] = useState("");
  const [appliedOrderStatus, setAppliedOrderStatus] = useState("all");
  const [appliedPaymentStatus, setAppliedPaymentStatus] = useState("all");

  const [isDownpaymentOpen, setIsDownpaymentOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrderRow | null>(
    null,
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  /*
   * Optional. The branch usually has the paper in hand while recording the
   * money; attaching it here saves the trip to Accounting's queue, and leaving
   * it empty is still a perfectly good payment.
   */
  const [paymentPhoto, setPaymentPhoto] = useState<File | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<SelectOption>(PAYMENT_METHOD_OPTIONS[0]);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  // What just happened, said once in the place the reader is already looking.
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancellationNote, setCancellationNote] = useState("");
  const [settlement, setSettlement] = useState<CancellationSettlementDto>("FORFEITED");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundAcknowledgement, setRefundAcknowledgement] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [saleSearch, setSaleSearch] = useState("");
  const [salePage, setSalePage] = useState(1);
  const [selectedSale, setSelectedSale] = useState<DirectSaleRow | null>(null);
  const [correctionSale, setCorrectionSale] = useState<DirectSaleRow | null>(null);
  const [correctionReason, setCorrectionReason] = useState<SaleCorrectionRequestReasonDto>("ACCIDENTAL_SUBMISSION");
  const [correctionNote, setCorrectionNote] = useState("");

  const { data, isLoading, isFetching, error: ordersError } = useQuery({
    queryKey: [
      "customer-orders-list",
      {
        page,
        pageSize,
        orderNo: appliedOrderNo,
        customer: appliedCustomer,
        orderStatus: appliedOrderStatus,
        paymentStatus: appliedPaymentStatus,
      },
    ],
    queryFn: () =>
      fetchCustomerOrders({
        page,
        pageSize,
        orderNo: appliedOrderNo,
        customer: appliedCustomer,
        orderStatus: appliedOrderStatus,
        paymentStatus: appliedPaymentStatus,
      }),
    enabled: canViewOrders,
    placeholderData: (previousData) => previousData,
  });

  const directSalesQuery = useQuery({
    queryKey: ["customer-direct-sales-list", "overview", salesSource, salesPeriodFilter, salesBranchFilter],
    queryFn: () => fetchDirectSales(salesSource, salesPeriodFilter, salesBranchFilter),
    enabled: activeView === "sales" && canViewSales,
  });
  const saleCorrectionMutation = useMutation({
    mutationFn: async () => {
      if (!correctionSale) throw new Error("Select a direct sale first.");
      const response = await fetch(
        `/api/sales/${encodeURIComponent(correctionSale.id)}/correction-request`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: correctionReason, note: correctionNote }),
        },
      );
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Unable to submit the correction request");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-direct-sales-list"] }),
        queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["accounting-receipt-linked"] }),
      ]);
      setCorrectionSale(null);
      setCorrectionReason("ACCIDENTAL_SUBMISSION");
      setCorrectionNote("");
    },
  });
  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) throw new Error("Select an order first.");
      const response = await fetch(
        `/api/customer-orders/${selectedOrder.id}/payment`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(paymentAmount),
            reference: paymentReference.trim(),
            method: paymentMethod.value,
          }),
        },
      );
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message ?? "Unable to save payment");
      }
      const saved = json.data as CustomerOrderRow & { paymentId: string | null };
      if (paymentPhoto && canAttachReceipt && saved.paymentId) {
        const body = new FormData();
        body.set("photo", paymentPhoto);
        // The money is already recorded, so a failed upload is a warning, not
        // a reason to report the payment as not saved.
        const attached = await fetch(
          `/api/accounting/payments/${encodeURIComponent(saved.paymentId)}/photo`,
          { method: "POST", credentials: "same-origin", body },
        ).catch(() => null);
        if (!attached?.ok) {
          throw new Error("Payment saved, but the receipt photo did not attach. Attach it from Receipt Verification.");
        }
      }
      return saved;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-orders-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order", selectedOrder?.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
      ]);
      setIsDownpaymentOpen(false);
      setSelectedOrder(null);
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentPhoto(null);
      setPaymentMethod(PAYMENT_METHOD_OPTIONS[0]);
    },
  });
  // Keyed by sale, so opening another sale falls back to that sale's own
  // salesperson instead of carrying the previous pending choice over.
  const [salespersonEdit, setSalespersonEdit] = useState<{ saleId: string; salespersonId: string; reason: string; error: string } | null>(null);
  const salespersonForm =
    selectedSale && salespersonEdit?.saleId === selectedSale.id
      ? salespersonEdit
      : {
          saleId: selectedSale?.id ?? "",
          salespersonId: selectedSale?.salesperson?.personnelId ?? "",
          reason: "",
          error: "",
        };
  const patchSalespersonForm = (patch: Partial<typeof salespersonForm>) =>
    setSalespersonEdit({ ...salespersonForm, ...patch });
  // Only the branch that made the sale can supply its eligible salespersons.
  const saleSalespersonOptionsQuery = useQuery({
    queryKey: ["customer-order-options", selectedSale?.branchId ?? null, "salespersons"],
    enabled: Boolean(canCorrectSalesperson && selectedSale?.branchId),
    queryFn: async () => {
      const response = await fetch(`/api/customer-orders/options?locationId=${encodeURIComponent(selectedSale!.branchId)}`, { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to load salespersons");
      return (json.data?.salespersons ?? []) as Array<{ id: string; fullName: string }>;
    },
  });
  const saleSalespersonMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSale) throw new Error("Select a sale first.");
      const response = await fetch(`/api/sales/${selectedSale.id}/salesperson`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salespersonId: salespersonForm.salespersonId, reason: salespersonForm.reason.trim() || undefined }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to change the salesperson");
      return json.data as DirectSaleRow;
    },
    onSuccess: async (sale) => {
      setSelectedSale(sale);
      setSalespersonEdit(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-direct-sales-list"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
    },
    onError: (error: Error) => patchSalespersonForm({ error: error.message }),
  });
  const reserveMutation = useMutation({
    mutationFn: async (order: CustomerOrderRow) => {
      const response = await fetch(`/api/customer-orders/${order.id}/reserve`, { method: "POST", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to reserve order");
      return json.data as CustomerOrderRow;
    },
    onSuccess: async (order) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-orders-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order", order.id] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order-options"] }),
        queryClient.invalidateQueries({ queryKey: ["pos-options"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
      ]);
    },
  });
  // The money already collected, so whoever is handing it back can see every
  // receipt before choosing an amount.
  const cancelPaymentsQuery = useQuery({
    queryKey: ["order-payment-history", selectedOrder?.id],
    enabled: isCancelOpen && Boolean(selectedOrder?.id),
    queryFn: async () => {
      const response = await fetch(`/api/customer-orders/${selectedOrder!.id}/payments`, { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to load the payment history");
      return json.data as {
        collected: number;
        refunded: number;
        refundable: number;
        payments: Array<{ id: string; kind: string; amount: number; method: string; receiptNumber: string; collectedAt: string; collectedBy: string; reviewStatus: string }>;
      };
    },
  });

  const collectedOnOrder = cancelPaymentsQuery.data?.collected ?? selectedOrder?.downpayment ?? 0;
  // A refund always needs its reason; a forfeited downpayment already did.
  const needsCancellationNote = settlement === "REFUNDED" || collectedOnOrder > 0;
  const parsedRefund = Number(refundAmount);
  const canSubmitCancellation =
    (!needsCancellationNote || Boolean(cancellationNote.trim())) &&
    (settlement !== "REFUNDED" ||
      (Number.isFinite(parsedRefund) &&
        parsedRefund > 0 &&
        parsedRefund <= (cancelPaymentsQuery.data?.refundable ?? 0) &&
        Boolean(refundAcknowledgement.trim())));

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) throw new Error("Select an order first.");
      const response = await fetch(`/api/customer-orders/${selectedOrder.id}/cancel`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          settlement === "REFUNDED"
            ? {
                note: cancellationNote.trim() || undefined,
                settlement,
                refundAmount: Number(refundAmount),
                refundMethod: "CASH",
                acknowledgementNumber: refundAcknowledgement.trim(),
              }
            : { note: cancellationNote.trim() || undefined, settlement },
        ),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to cancel order");
      return json.data as CustomerOrderRow;
    },
    onSuccess: async (order) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-orders-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order", order.id] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order-options"] }),
        queryClient.invalidateQueries({ queryKey: ["pos-options"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
      ]);
      setIsCancelOpen(false);
      setActionNotice(
        settlement === "REFUNDED"
          ? `${order.orderNo} cancelled. ${Number(refundAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} handed back and deducted from sales, dated today.`
          : `${order.orderNo} cancelled. The money already collected stays as sales.`,
      );
      setSelectedOrder(null);
      setCancellationNote("");
    },
  });

  const rows = data?.data ?? [];
  const meta = useMemo(
    () => data?.meta ?? {
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
    },
    [data?.meta, pageSize],
  );
  const summary = data?.summary ?? {
    totalOrders: 0,
    pendingOrders: 0,
    forReleaseOrders: 0,
    releasedOrders: 0,
    totalDownpayments: 0,
  };

  const filteredSales = useMemo(() => {
    const keyword = saleSearch.trim().toLowerCase();
    if (!keyword) return directSalesQuery.data?.data ?? [];
    return (directSalesQuery.data?.data ?? []).filter((sale) =>
      [sale.reference, sale.manualReceiptNumber, sale.customer, sale.branch, sale.salesperson?.name ?? ""]
        .some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [directSalesQuery.data, saleSearch]);
  const salesSummary = directSalesQuery.isError ? undefined : directSalesQuery.data?.summary;
  /*
   * Held as a draft until Apply, the way the Customer Orders filter beside it
   * works, then written to the URL rather than to state: a reload keeps the
   * filter, a link carries it, and the dashboard's link is just this page with
   * the parameters already set rather than a second mechanism.
   */
  const [salesPeriodDraft, setSalesPeriodDraft] = useState(salesPeriodFilter);
  const [salesBranchDraft, setSalesBranchDraft] = useState(salesBranchFilter || "all");
  /*
   * Arriving from a dashboard card changes the URL under the draft, so the
   * controls follow it rather than showing the previous choice. Adjusted during
   * render, not in an effect: an effect would paint the stale draft once and
   * then correct it.
   */
  const urlFilterKey = `${salesPeriodFilter}|${salesBranchFilter}`;
  const [lastUrlFilterKey, setLastUrlFilterKey] = useState(urlFilterKey);
  if (lastUrlFilterKey !== urlFilterKey) {
    setLastUrlFilterKey(urlFilterKey);
    setSalesPeriodDraft(salesPeriodFilter);
    setSalesBranchDraft(salesBranchFilter || "all");
  }

  const writeSalesFilter = (period: string, branchId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "sales");
    for (const [key, value] of [["salesPeriod", period], ["salesBranchId", branchId]] as const) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSalePage(1);
    router.replace(`/customer-orders?${params}` as Route);
  };
  const applySalesFilter = () =>
    writeSalesFilter(salesPeriodDraft, salesBranchDraft === "all" ? "" : salesBranchDraft);
  const resetSalesFilter = () => {
    setSalesPeriodDraft("");
    setSalesBranchDraft("all");
    writeSalesFilter("", "");
  };
  const salesBranchOptions: SelectOption[] = [
    { value: "all", label: "All Branches" },
    ...(directSalesQuery.data?.filterBranches ?? []).map((branch) => ({
      value: branch.id,
      label: `${branch.code} - ${branch.name}`,
    })),
  ];

  const saleTotalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const safeSalePage = Math.min(salePage, saleTotalPages);
  const paginatedSales = filteredSales.slice(
    (safeSalePage - 1) * pageSize,
    safeSalePage * pageSize,
  );

  const showingFrom = useMemo(() => {
    if (meta.total === 0) return 0;
    return (meta.page - 1) * meta.pageSize + 1;
  }, [meta]);

  const showingTo = useMemo(() => {
    if (meta.total === 0) return 0;
    return Math.min(meta.page * meta.pageSize, meta.total);
  }, [meta]);

  // PDF copies follow the applied filters and cover every matching row, not
  // the 200-row recent window the screen paginates.
  const orderExportParams = useMemo(() => {
    const params = new URLSearchParams({ format: "pdf" });
    if (appliedOrderNo.trim()) params.set("orderNo", appliedOrderNo.trim());
    if (appliedCustomer.trim()) params.set("customer", appliedCustomer.trim());
    if (appliedOrderStatus !== "all") params.set("orderStatus", appliedOrderStatus);
    if (appliedPaymentStatus !== "all") params.set("paymentStatus", appliedPaymentStatus);
    return params.toString();
  }, [appliedOrderNo, appliedCustomer, appliedOrderStatus, appliedPaymentStatus]);

  const salesExportParams = useMemo(() => {
    const params = new URLSearchParams({ format: "pdf" });
    if (saleSearch.trim()) params.set("search", saleSearch.trim());
    return params.toString();
  }, [saleSearch]);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedOrderNo(orderNo);
    setAppliedCustomer(customer);
    setAppliedOrderStatus(orderStatus.value);
    setAppliedPaymentStatus(paymentStatus.value);
  };

  const handleResetFilters = () => {
    setOrderNo("");
    setCustomer("");
    setOrderStatus(ORDER_STATUS_OPTIONS[0]);
    setPaymentStatus(PAYMENT_STATUS_OPTIONS[0]);

    setAppliedOrderNo("");
    setAppliedCustomer("");
    setAppliedOrderStatus("all");
    setAppliedPaymentStatus("all");
    setPage(1);
  };

  return (
    <PageShell
      title="Customer Orders"
      subtitle="Handle reservations, special orders, downpayments, and release status."
      actions={
        <>
          {hasCapability(capabilities, "customer-orders:create") ? <Link href="/customer-orders/create" className={buttonVariants()}>
            Create Order
          </Link> : null}
          {activeView === "sales" && canViewSales ? (
            <a href={`/api/sales?${salesExportParams}`} className={buttonVariants({ variant: "outline" })}>
              <FileText aria-hidden="true" />
              Export PDF
            </a>
          ) : null}
          {activeView === "orders" && canViewOrders ? (
            <a href={`/api/customer-orders?${orderExportParams}`} className={buttonVariants({ variant: "outline" })}>
              <FileText aria-hidden="true" />
              Export PDF
            </a>
          ) : null}
        </>
      }
    >
      {actionNotice ? (
        <div className="mb-6">
          <StatusBanner tone="success" onDismiss={() => setActionNotice(null)}>
            {actionNotice}
          </StatusBanner>
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2 rounded-xl border bg-muted/50 p-2">
{/* All Sales leads: it is what the dashboard's Sales card opens and
            what its figure counts. Direct Sales is the narrower view beside it. */}
        {canViewSales ? <Link
          href="/customer-orders?view=sales&source=all"
          className={buttonVariants({ variant: activeView === "sales" && salesSource === "all" ? "default" : "ghost" })}
          aria-current={activeView === "sales" && salesSource === "all" ? "page" : undefined}
          onClick={() => setSalePage(1)}
        >
          All Sales
        </Link> : null}
        {canViewSales ? <Link
          href="/customer-orders?view=sales"
          className={buttonVariants({ variant: activeView === "sales" && salesSource === "direct" ? "default" : "ghost" })}
          aria-current={activeView === "sales" && salesSource === "direct" ? "page" : undefined}
          onClick={() => setSalePage(1)}
        >
          Direct Sales
        </Link> : null}
        {canViewOrders ? <Link
          href="/customer-orders?view=orders"
          className={buttonVariants({ variant: activeView === "orders" ? "default" : "ghost" })}
          aria-current={activeView === "orders" ? "page" : undefined}
          onClick={() => setPage(1)}
        >
          Customer Orders
        </Link> : null}
      </div>

      {activeView === "orders" ? (
        <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.totalOrders}
              </h3>
              <p className="mt-2 text-sm text-sky-600">
                Customer reservation records
              </p>
            </div>
            <div className="rounded-full bg-sky-50 dark:bg-sky-950/40 p-2">
              <ShoppingBag className="h-5 w-5 text-sky-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Pending / Reserved</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.pendingOrders}
              </h3>
              <p className="mt-2 text-sm text-amber-600">
                Waiting for stock or fulfillment
              </p>
            </div>
            <div className="rounded-full bg-amber-50 dark:bg-amber-950/40 p-2">
              <Clock3 className="h-5 w-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">For Release</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.forReleaseOrders}
              </h3>
              <p className="mt-2 text-sm text-sky-600">
                Ready for pickup or installation
              </p>
            </div>
            <div className="rounded-full bg-sky-50 dark:bg-sky-950/40 p-2">
              <Clock3 className="h-5 w-5 text-sky-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Released</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.releasedOrders}
              </h3>
              <p className="mt-2 text-sm text-emerald-600">
                Completed and released orders
              </p>
            </div>
            <div className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 p-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Total Downpayments</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {formatPeso(summary.totalDownpayments)}
              </h3>
              <p className="mt-2 text-sm text-emerald-600">
                Collected partial payments
              </p>
            </div>
            <div className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 p-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
          <Input
            placeholder="Order No."
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
          />

          <Input
            placeholder="Search customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />

          <div className="w-full">
            <Select
              instanceId="customer-orders-status-filter"
              options={ORDER_STATUS_OPTIONS}
              value={orderStatus}
              onChange={(option) =>
                setOrderStatus(option ?? ORDER_STATUS_OPTIONS[0])
              }
              isSearchable
              placeholder="Select order status"
              styles={reactSelectStyles}
            />
          </div>

          <div className="w-full">
            <Select
              instanceId="customer-orders-payment-filter"
              options={PAYMENT_STATUS_OPTIONS}
              value={paymentStatus}
              onChange={(option) =>
                setPaymentStatus(option ?? PAYMENT_STATUS_OPTIONS[0])
              }
              isSearchable
              placeholder="Select payment status"
              styles={reactSelectStyles}
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleApplyFilters}
            >
              Apply Filters
            </Button>

            <Button
              variant="outline"
              className="flex-1"
              onClick={handleResetFilters}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {reserveMutation.error ? <p className="mt-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">{(reserveMutation.error as Error).message}</p> : null}

      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Customer Order List
              </h3>
              <p className="text-sm text-muted-foreground">
                Showing {showingFrom} to {showingTo} of {meta.total} orders
                {isFetching && !isLoading ? " • Updating..." : ""}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1550px]">
              <thead className="bg-muted">
                <tr className="border-b">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Order No.
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Customer
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salesperson</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Items
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Total Items
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Order Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Downpayment
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Balance
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Release Date
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-5 py-16 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading customer orders...
                      </div>
                    </td>
                  </tr>
                ) : ordersError ? (
                  <tr>
                    <td colSpan={11} className="px-5 py-16 text-center text-red-600">
                      {(ordersError as Error).message}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-5 py-16 text-center text-muted-foreground"
                    >
                      No customer orders found.
                    </td>
                  </tr>
                ) : (
                  rows.map((order) => {
                    const actions = getCustomerOrderActions({ capabilities, statusCode: order.statusCode, downpayment: order.downpayment, balance: order.balance });
                    return (
                    <tr
                      key={order.id}
                      className="border-b transition-colors hover:bg-muted"
                    >
                      <td className="px-5 py-4 text-sm font-medium text-foreground">
                        {order.orderNo}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {order.customer}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{order.salesperson?.name ?? "Not recorded (legacy)"}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        <span className="line-clamp-1">
                          {order.itemSummary}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {order.totalItems}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <Badge
                          className={getOrderStatusBadgeClass(order.status)}
                        >
                          {order.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <Badge
                          className={getPaymentStatusBadgeClass(
                            order.paymentStatus,
                          )}
                        >
                          {order.paymentStatus}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-foreground">
                        {formatPeso(order.downpayment)}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-foreground">
                        {formatPeso(order.balance)}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {formatDate(order.releaseDate)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/customer-orders/${order.id}` as Route}
                            className={buttonVariants({ variant: "view", size: "sm" })}
                          >
                            View / Edit
                          </Link>
                        </div>

                        <div className="flex flex-wrap gap-2">
                           {actions.canCancel ? <Button
                             size="sm"
                             variant="destructive"
                             onClick={() => {
                               setSelectedOrder(order);
                               setCancellationNote("");
                               setIsCancelOpen(true);
                             }}
                           >
                             Cancel
                           </Button> : null}

                           {actions.canRecordPayment ? <Button
                             size="sm"
                             onClick={() => {
                              setSelectedOrder(order);
                              setPaymentAmount("");
                              setPaymentReference("");
                              setIsDownpaymentOpen(true);
                            }}
                           >
                             {order.downpayment > 0 ? "Add Payment" : "Downpayment"}
                           </Button> : null}

                           {actions.canReserve ? <Button
                             size="sm"
                             variant="workflow"
                             onClick={() => reserveMutation.mutate(order)}
                             disabled={reserveMutation.isPending}
                           >
                             {reserveMutation.isPending && reserveMutation.variables?.id === order.id ? "Reserving..." : "Reserve Stock"}
                           </Button> : null}

                           {actions.canRelease && (
                            <Link
                              href={
                                `/customer-orders/${order.id}/release` as Route
                              }
                              className={buttonVariants({ variant: "workflow", size: "sm" })}
                            >
                              Release
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t px-5 py-3">
            <TablePagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} busy={isFetching} />
          </div>

        </CardContent>
      </Card>

      <Dialog
        open={isDownpaymentOpen}
        onOpenChange={(open) => {
          setIsDownpaymentOpen(open);
          if (!open && !paymentMutation.isPending) {
            setSelectedOrder(null);
            setPaymentAmount("");
            setPaymentReference("");
            setPaymentMethod(PAYMENT_METHOD_OPTIONS[0]);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedOrder?.downpayment
                ? "Add Customer Payment"
                : "Record Downpayment"}
            </DialogTitle>
            <DialogDescription>
              {selectedOrder?.downpayment
                ? "Add this payment to the order's existing downpayment."
                : "Record the customer's first payment for this order."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Order No.</Label>
              <Input value={selectedOrder?.orderNo ?? ""} readOnly />
            </div>

            <div className="space-y-2">
              <Label>Customer</Label>
              <Input value={selectedOrder?.customer ?? ""} readOnly />
            </div>

            {/* ✅ ITEMS SUMMARY */}
            <div className="space-y-2">
              <Label>Items</Label>
              <div className="rounded-lg border bg-muted p-3 text-sm text-foreground">
                <ul className="list-disc space-y-1 pl-5">
                  {selectedOrder?.itemSummary?.split(",").map((item, index) => {
                    const parts = item.split("×").map((str) => str.trim());

                    const name = parts[0];
                    const qty = parts[1] ?? "1"; // ✅ default qty = 1

                    return (
                      <li key={index}>
                        {name} × {qty}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* ✅ OPTIONAL (HIGHLY RECOMMENDED) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="text-sm font-semibold">
                  ₱{selectedOrder?.totalAmount?.toLocaleString("en-PH")}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Current Downpayment</p>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  ₱{selectedOrder?.downpayment?.toLocaleString("en-PH")}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Remaining Balance</p>
                <p className="text-sm font-semibold text-amber-600">
                  ₱{selectedOrder?.balance?.toLocaleString("en-PH")}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-payment-amount">Payment Amount</Label>
              <Input
                id="order-payment-amount"
                type="number"
                min="0.01"
                max={selectedOrder?.balance}
                step="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-payment-reference">
                Receipt Number (required)
              </Label>
              <Input
                id="order-payment-reference"
                placeholder="OR-000123"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                Accounting verifies this receipt against its photo, so every payment needs its own number.
              </p>
            </div>

            {canAttachReceipt ? (
              <div className="space-y-2">
                <Label htmlFor="order-payment-photo">Receipt Photo (optional)</Label>
                <Input
                  id="order-payment-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setPaymentPhoto(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  Attach it now if you have the receipt, or leave it and attach it later in Receipt Verification.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="order-payment-method">Payment Method</Label>
              <Select
                inputId="order-payment-method"
                instanceId="customer-orders-payment-method"
                options={PAYMENT_METHOD_OPTIONS}
                value={paymentMethod}
                onChange={(option) => setPaymentMethod(option ?? PAYMENT_METHOD_OPTIONS[0])}
                isSearchable
                placeholder="Select payment method"
                styles={reactSelectStyles}
              />
            </div>
            {paymentMutation.error ? (
              <p className="text-sm text-red-600">
                {(paymentMutation.error as Error).message}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDownpaymentOpen(false)}
              disabled={paymentMutation.isPending}
            >
              Cancel
            </Button>

            <Button
              onClick={() => paymentMutation.mutate()}
              disabled={
                paymentMutation.isPending ||
                Number(paymentAmount) <= 0 ||
                Number(paymentAmount) > (selectedOrder?.balance ?? 0) ||
                !paymentReference.trim()
              }
            >
              {paymentMutation.isPending ? "Saving..." : "Save Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isCancelOpen}
        onOpenChange={(open) => {
          if (cancelMutation.isPending) return;
          setIsCancelOpen(open);
          if (!open) {
            setSelectedOrder(null);
            setCancellationNote("");
            setSettlement("FORFEITED");
            setRefundAmount("");
            setRefundAcknowledgement("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel customer order?</DialogTitle>
            <DialogDescription>
              This changes {selectedOrder?.orderNo ?? "the order"} to Cancelled and releases any reserved stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Only an order that actually took money has anything to settle. */}
            {collectedOnOrder > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="cancel-settlement">Money already collected</Label>
                <Select
                  inputId="cancel-settlement"
                  instanceId="cancel-settlement"
                  options={CANCELLATION_SETTLEMENT_OPTIONS}
                  value={CANCELLATION_SETTLEMENT_OPTIONS.find((option) => option.value === settlement) ?? null}
                  onChange={(option) => {
                    const next = option?.value ?? "FORFEITED";
                    setSettlement(next);
                    if (next === "REFUNDED" && !refundAmount) {
                      setRefundAmount(String(cancelPaymentsQuery.data?.refundable ?? ""));
                    }
                  }}
                  isSearchable={false}
                  styles={reactSelectStyles as never}
                />
                <p className="text-xs text-muted-foreground">
                  {CANCELLATION_SETTLEMENT_OPTIONS.find((option) => option.value === settlement)?.description}
                </p>
              </div>
            ) : null}

            {settlement === "REFUNDED" ? (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <p className="text-sm font-semibold text-foreground">Payment history</p>
                {cancelPaymentsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading receipts...</p>
                ) : cancelPaymentsQuery.data?.payments.length ? (
                  <div className="space-y-1">
                    {cancelPaymentsQuery.data.payments.map((payment) => (
                      <div key={payment.id} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">
                          {payment.collectedAt.slice(0, 10)} · {payment.receiptNumber} · {payment.method}
                        </span>
                        <span className="font-medium text-foreground">
                          {payment.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2 text-sm">
                      <span className="text-muted-foreground">Can be handed back</span>
                      <span className="font-semibold text-foreground">
                        {(cancelPaymentsQuery.data.refundable ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No receipts recorded on this order.</p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cancel-refund-amount">Amount handed back</Label>
                    <Input
                      id="cancel-refund-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={cancelPaymentsQuery.data?.refundable}
                      value={refundAmount}
                      onChange={(event) => setRefundAmount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cancel-refund-ack">Acknowledgement slip no.</Label>
                    <Input
                      id="cancel-refund-ack"
                      value={refundAcknowledgement}
                      maxLength={100}
                      onChange={(event) => setRefundAcknowledgement(event.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sales are reduced by this amount, dated today. Earlier periods are left as they were reported.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="list-cancellation-note">Cancellation note{needsCancellationNote ? " (required)" : ""}</Label>
              <Textarea
                id="list-cancellation-note"
                value={cancellationNote}
                onChange={(event) => setCancellationNote(event.target.value)}
                maxLength={1_000}
                placeholder="Reason for cancelling this order"
                rows={3}
              />
            </div>
            {cancelMutation.error ? <p className="text-sm text-red-600">{(cancelMutation.error as Error).message}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelOpen(false)} disabled={cancelMutation.isPending}>Keep Order</Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || !canSubmitCancellation}
            >
              {cancelMutation.isPending ? "Cancelling..." : settlement === "REFUNDED" ? "Cancel and Refund" : "Cancel Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      ) : activeView === "sales" ? (
        <>
        {/* Same shape and colours as the Customer Orders cards beside them, so
            the two tabs of this screen do not read as two different products.
            Five across on a wide screen, as there. */}
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-busy={directSalesQuery.isFetching}>
          {[
            { label: salesSource === "all" ? "Total Sales" : "Total Direct Sales", value: salesSummary?.totalSales.toLocaleString("en-PH"), hint: salesSource === "all" ? "Posted sales, including order releases" : "Posted direct-sale records", icon: ShoppingBag, text: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40" },
            { label: "Sales Total", value: salesSummary && formatPeso(salesSummary.totalAmount), hint: salesSummary?.totalRefunded ? `After discounts, less ${formatPeso(salesSummary.totalRefunded)} refunded` : "After sale discounts", icon: Wallet, text: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
            { label: "Total Discounts", value: salesSummary && formatPeso(salesSummary.totalDiscounts), hint: "Discounts on posted direct sales", icon: CheckCircle2, text: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40" },
            { label: "Refunded", value: salesSummary && formatPeso(salesSummary.totalRefunded ?? 0), hint: "Handed back to customers", icon: RotateCcw, text: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40" },
            { label: "Amount Paid", value: salesSummary && formatPeso(salesSummary.totalAmountPaid), hint: "Payments kept, after refunds", icon: Wallet, text: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
          ].map(({ label, value, hint, icon: Icon, text, bg }) => (
            <Card key={label}>
              <CardContent className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <h3 className="mt-3 break-words text-3xl font-bold text-foreground">{value ?? (directSalesQuery.isError ? "Unavailable" : "Loading...")}</h3>
                  <p className={cn("mt-2 text-sm", text)}>{hint}</p>
                </div>
                <div className={cn("shrink-0 rounded-full p-2", bg)}>
                  <Icon className={cn("h-5 w-5", text)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* The same card, grid, selects and Apply/Reset pair the Customer Orders
            tab uses, in the same place below the figures, so the three tabs of
            one screen do not each filter differently. Shown only where it can
            be used: the service refuses these parameters from anyone else, and
            filterBranches comes back empty for them. */}
        {(directSalesQuery.data?.filterBranches.length ?? 0) > 0 ? (
          <Card className="mb-6">
            <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              <div className="w-full">
                <Select
                  inputId="sales-period-filter"
                  instanceId="sales-period-filter"
                  options={SALES_PERIOD_OPTIONS}
                  value={SALES_PERIOD_OPTIONS.find((option) => option.value === salesPeriodDraft) ?? SALES_PERIOD_OPTIONS[0]}
                  onChange={(option) => setSalesPeriodDraft(option?.value ?? "")}
                  isSearchable
                  placeholder="Select period"
                  styles={reactSelectStyles}
                />
              </div>

              <div className="w-full">
                <Select
                  inputId="sales-branch-filter"
                  instanceId="sales-branch-filter"
                  options={salesBranchOptions}
                  value={salesBranchOptions.find((option) => option.value === salesBranchDraft) ?? salesBranchOptions[0]}
                  onChange={(option) => setSalesBranchDraft(option?.value ?? "all")}
                  isSearchable
                  placeholder="Select branch"
                  styles={reactSelectStyles}
                />
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={applySalesFilter}>
                  Apply Filters
                </Button>
                <Button variant="outline" className="flex-1" onClick={resetSalesFilter}>
                  Reset
                </Button>
              </div>

              {directSalesQuery.data?.appliedFilter ? (
                <p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-3">
                  Showing {directSalesQuery.data.appliedFilter.periodLabel.toLowerCase()} in{" "}
                  {directSalesQuery.data.appliedFilter.branchLabel}. The dashboard&rsquo;s Sales card links here with its own filter.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        <p className="mb-4 text-sm text-muted-foreground">
          {salesSource === "all"
            ? "Posted sales in your authorized locations, including the sales written when a Customer Order is released, and excluding voided sales. This is what the dashboard's Sales card totals. Summary totals are independent of the list search."
            : "Posted direct sales in your authorized locations, excluding Customer Order releases and voided sales. Summary totals are independent of the list search."}
        </p>
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">{salesSource === "all" ? "All Sales List" : "Direct Sales List"}</h3>
                <p className="text-sm text-muted-foreground">Latest 200 posted direct sales. Search and pagination apply to this recent list only; Export PDF covers every sale matching the search.</p>
              </div>
              <Input
                className="sm:max-w-xs"
                placeholder="Search receipt or customer"
                value={saleSearch}
                onChange={(event) => {
                  setSaleSearch(event.target.value);
                  setSalePage(1);
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
              <p className="text-sm text-muted-foreground">Showing {filteredSales.length === 0 ? 0 : (safeSalePage - 1) * pageSize + 1} to {Math.min(safeSalePage * pageSize, filteredSales.length)} of {filteredSales.length} sales</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px]">
                <thead className="bg-muted">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receipt</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branch</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salesperson</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discount</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posted</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {directSalesQuery.isLoading ? (
                    <tr><td colSpan={10} className="px-5 py-16 text-center text-muted-foreground">Loading direct sales...</td></tr>
                  ) : directSalesQuery.isError ? (
                    <tr><td colSpan={10} className="px-5 py-16 text-center text-rose-600">Unable to load direct sales.</td></tr>
                  ) : paginatedSales.length === 0 ? (
                    <tr><td colSpan={10} className="px-5 py-16 text-center text-muted-foreground">{salesSource === "all" ? "No sales found." : "No direct sales found."}</td></tr>
                  ) : (
                    paginatedSales.map((sale) => (
                      <tr key={sale.id} className="border-b transition-colors hover:bg-muted">
                        <td className="px-5 py-4 text-sm font-medium text-foreground">
                          <p>{sale.manualReceiptNumber}</p>
                          <p className="text-xs text-muted-foreground">{sale.reference}</p>
                          {/* Only where both kinds are listed, or it is noise. */}
                          {salesSource === "all" && sale.source === "Customer Order" ? (
                            <Badge variant="outline" className="mt-1">Order release</Badge>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">{sale.customer}</td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">{sale.branch}</td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">{sale.salesperson?.name ?? "Not recorded (legacy)"}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                          {formatPeso(sale.totalAmount)}
                          {/* A sale that gave money back no longer reads as its
                              total alone; the net is what the branch kept. */}
                          {sale.refundedAmount > 0 ? (
                            <>
                              <span className="block text-xs font-medium text-amber-700 dark:text-amber-300">
                                -{formatPeso(sale.refundedAmount)} refunded
                              </span>
                              <span className="block text-xs font-normal text-muted-foreground">
                                net {formatPeso(sale.totalAmount - sale.refundedAmount)}
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">{formatPeso(sale.discountAmount)}</td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">{sale.paymentMethod}</td>
                        <td className="px-5 py-4 text-sm">
                          <div className="flex flex-col items-start gap-1">
                            <Badge className={sale.reviewStatus === "VERIFIED" ? getPaymentStatusBadgeClass("Paid") : getPaymentStatusBadgeClass("Partial")}>{sale.reviewStatus}</Badge>
                            {sale.correctionRequest?.status === "PENDING" ? (
                              <Badge className="border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:bg-rose-950/40">
                                Correction requested
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">{formatDate(sale.postedAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="view" onClick={() => setSelectedSale(sale)}>
                              <Eye className="mr-2 h-4 w-4" /> View
                            </Button>
                            {/* Only a live sale can give money back; a voided one
                                already reversed itself, and a sale that has been
                                refunded in full has nothing left to give, so the
                                action is not offered rather than offered and
                                refused. */}
                            {canRefundSale && sale.status === "POSTED" && sale.refundedAmount < sale.amountPaid ? (
                              <Button size="sm" variant="outline" onClick={() => setRefundSaleId(sale.id)}>
                                Refund
                              </Button>
                            ) : canRefundSale && sale.status === "POSTED" ? (
                              <span className="text-xs font-medium text-muted-foreground">Fully refunded</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t px-5 py-3">
              <TablePagination page={safeSalePage} totalPages={saleTotalPages} onPageChange={setSalePage} busy={directSalesQuery.isFetching} />
            </div>

          </CardContent>
        </Card>
        <SaleRefundDialog
          saleId={refundSaleId}
          open={Boolean(refundSaleId)}
          onOpenChange={(open) => { if (!open) setRefundSaleId(null); }}
          canChooseBranch={hasCapability(capabilities, "locations:all")}
          onRefunded={(message) => setActionNotice(message)}
        />
        <Dialog open={Boolean(selectedSale)} onOpenChange={(open) => !open && setSelectedSale(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Direct Sale Details</DialogTitle>
              <DialogDescription>
                Receipt, payment, and purchased-item details for this sale.
              </DialogDescription>
            </DialogHeader>
            {selectedSale ? (
              <div className="space-y-5">
                <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
                  <div><p className="text-muted-foreground">Receipt</p><p className="font-medium">{selectedSale.manualReceiptNumber}</p></div>
                  <div><p className="text-muted-foreground">Reference</p><p className="font-medium">{selectedSale.reference}</p></div>
                  <div><p className="text-muted-foreground">Customer</p><p className="font-medium">{selectedSale.customer}</p></div>
                  <div><p className="text-muted-foreground">Branch</p><p className="font-medium">{selectedSale.branch}</p></div>
                  <div><p className="text-muted-foreground">Salesperson</p><p className="font-medium">{selectedSale.salesperson?.name ?? "Not recorded (legacy)"}</p></div>
                  <div><p className="text-muted-foreground">Payment</p><p className="font-medium">{selectedSale.paymentMethod}</p></div>
                  <div><p className="text-muted-foreground">Sold on</p><p className="font-medium">{formatDate(selectedSale.soldAt)}</p></div>
                  <div><p className="text-muted-foreground">Encoded by</p><p className="font-medium">{formatDate(selectedSale.postedAt)} by {selectedSale.postedBy}</p></div>
                </div>

                {/* Money handed back on this sale. Without it the detail
                    reads as though the customer paid and kept everything. */}
                {selectedSale.refundedAmount > 0 ? (
                  <div className="space-y-3 rounded-lg border border-amber-200 p-4 dark:border-amber-900">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">Refunds on this sale</p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Paid {formatPeso(selectedSale.amountPaid)} · </span>
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          -{formatPeso(selectedSale.refundedAmount)} refunded
                        </span>
                        <span className="text-muted-foreground">
                          {" "}· net {formatPeso(selectedSale.amountPaid - selectedSale.refundedAmount)}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-3">
                      {selectedSale.refunds.map((refund) => (
                        <div key={refund.id} className="rounded-md border p-3 text-sm">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="font-medium text-foreground">
                              {formatPeso(refund.amount)}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                slip {refund.acknowledgementNumber}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(refund.refundedAt)} by {refund.refundedBy}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{refund.reason}</p>
                          {refund.lines.length ? (
                            <ul className="mt-2 space-y-0.5">
                              {refund.lines.map((line) => (
                                <li key={`${refund.id}-${line.itemCode}`} className="text-xs text-muted-foreground">
                                  {line.quantity} x {line.itemCode} {line.name}
                                  {" — "}
                                  {line.disposition === "QUARANTINED" ? "quarantined for checking" : "back to sellable stock"}
                                  {refund.stockBranch ? ` at ${refund.stockBranch}` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs text-muted-foreground">No goods came back.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {canCorrectSalesperson && selectedSale.status === "POSTED" ? (
                  <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/60 p-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Correct the salesperson</p>
                      <p className="text-xs text-muted-foreground">
                        Only who gets credit changes. The amount, the receipt and the stock stay as posted, and the
                        previous name is kept in the audit trail.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="sale-salesperson">Credit this sale to</Label>
                        <select
                          id="sale-salesperson"
                          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={salespersonForm.salespersonId}
                          onChange={(event) => patchSalespersonForm({ salespersonId: event.target.value, error: "" })}
                          disabled={saleSalespersonOptionsQuery.isLoading || saleSalespersonMutation.isPending}
                        >
                          <option value="">Select a salesperson</option>
                          {(saleSalespersonOptionsQuery.data ?? []).map((person) => (
                            <option key={person.id} value={person.id}>{person.fullName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="sale-salesperson-reason">Reason (optional)</Label>
                        <Input
                          id="sale-salesperson-reason"
                          value={salespersonForm.reason}
                          onChange={(event) => patchSalespersonForm({ reason: event.target.value })}
                          placeholder="Why the credit is moving"
                          disabled={saleSalespersonMutation.isPending}
                        />
                      </div>
                    </div>
                    {saleSalespersonOptionsQuery.isError ? (
                      <p className="text-xs font-medium text-red-600">Unable to load the salespersons for this branch.</p>
                    ) : null}
                    {salespersonForm.error ? <p className="text-xs font-medium text-red-600">{salespersonForm.error}</p> : null}
                    <Button
                      size="sm"
                      onClick={() => { patchSalespersonForm({ error: "" }); saleSalespersonMutation.mutate(); }}
                      disabled={
                        !salespersonForm.salespersonId ||
                        salespersonForm.salespersonId === selectedSale.salesperson?.personnelId ||
                        saleSalespersonMutation.isPending
                      }
                    >
                      {saleSalespersonMutation.isPending ? "Saving..." : "Save salesperson"}
                    </Button>
                  </div>
                ) : null}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[620px]">
                    <thead className="bg-muted">
                      <tr className="border-b">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Item</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Quantity</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Unit Price</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.lines.map((line) => (
                        <tr key={`${line.productId}-${line.itemCode}`} className="border-b last:border-b-0">
                          <td className="px-4 py-3 text-sm"><p className="font-medium">{line.name}</p><p className="text-xs text-muted-foreground">{line.itemCode}</p></td>
                          <td className="px-4 py-3 text-right text-sm">{line.quantity}</td>
                          <td className="px-4 py-3 text-right text-sm">{formatPeso(line.unitPrice)}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium">{formatPeso(line.quantity * line.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ml-auto max-w-sm space-y-2 rounded-lg bg-muted p-4 text-sm">
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Discount</span><span>{formatPeso(selectedSale.discountAmount)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Amount paid</span><span>{formatPeso(selectedSale.amountPaid)}</span></div>
                  <div className="flex justify-between gap-4 border-t pt-2 font-semibold"><span>Total</span><span>{formatPeso(selectedSale.totalAmount)}</span></div>
                </div>
                {selectedSale.correctionRequest ? (
                  <div className={selectedSale.correctionRequest.status === "PENDING"
                    ? "rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    : "rounded-lg border bg-muted/40 p-4 text-sm text-foreground"}
                  >
                    <p className="font-semibold">
                      {selectedSale.correctionRequest.status === "PENDING"
                        ? "Correction requested"
                        : `Correction request ${selectedSale.correctionRequest.resolution === "KEPT" ? "dismissed" : "approved"}`}
                    </p>
                    <p className="mt-1">
                      {saleCorrectionReasonLabel(selectedSale.correctionRequest.reason)}: {selectedSale.correctionRequest.note}
                    </p>
                    <p className="mt-2 text-xs opacity-80">
                      Reported by {selectedSale.correctionRequest.requestedBy} on {formatDate(selectedSale.correctionRequest.requestedAt)}.
                    </p>
                    {selectedSale.correctionRequest.resolutionNote ? (
                      <p className="mt-2 border-t pt-2">
                        Admin resolution: {selectedSale.correctionRequest.resolutionNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedSale(null)}>Close</Button>
              {selectedSale &&
              selectedSale.source === "Direct Sale" &&
              selectedSale.correctionRequest?.status !== "PENDING" &&
              canRequestSaleCorrection ? (
                <Button
                  variant="warning"
                  onClick={() => {
                    setCorrectionSale(selectedSale);
                    setSelectedSale(null);
                    setCorrectionReason("ACCIDENTAL_SUBMISSION");
                    setCorrectionNote("");
                    saleCorrectionMutation.reset();
                  }}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Report wrong submission
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(correctionSale)}
          onOpenChange={(open) => {
            if (saleCorrectionMutation.isPending) return;
            if (!open) {
              setCorrectionSale(null);
              setCorrectionNote("");
              saleCorrectionMutation.reset();
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Report wrong sale submission?</DialogTitle>
              <DialogDescription>
                This sends an auditable request to Admin. It does not edit the sale, delete it, or restore inventory.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Receipt {correctionSale?.manualReceiptNumber}</p>
                <p className="mt-1 text-muted-foreground">{correctionSale?.reference} · {correctionSale?.branch}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale-correction-reason">What went wrong?</Label>
                <select
                  id="sale-correction-reason"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value as SaleCorrectionRequestReasonDto)}
                  disabled={saleCorrectionMutation.isPending}
                >
                  {SALE_CORRECTION_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale-correction-note">Explanation</Label>
                <Textarea
                  id="sale-correction-note"
                  value={correctionNote}
                  onChange={(event) => setCorrectionNote(event.target.value)}
                  placeholder="Explain exactly why this sale should be checked by Admin"
                  maxLength={5_000}
                  rows={4}
                  disabled={saleCorrectionMutation.isPending}
                />
              </div>
              <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Stock remains deducted while this request is pending. Only Admin approval can reverse it.
              </p>
              {saleCorrectionMutation.error ? (
                <p className="text-sm text-red-600">{(saleCorrectionMutation.error as Error).message}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCorrectionSale(null)}
                disabled={saleCorrectionMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="warning"
                onClick={() => saleCorrectionMutation.mutate()}
                disabled={saleCorrectionMutation.isPending || !correctionNote.trim()}
              >
                {saleCorrectionMutation.isPending ? "Submitting..." : "Submit correction request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
      ) : <p className="text-sm text-muted-foreground">You do not have permission to view customer orders or direct sales.</p>}
    </PageShell>
  );
}
