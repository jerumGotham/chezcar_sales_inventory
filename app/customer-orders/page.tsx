"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShoppingBag,
  Clock3,
  CheckCircle2,
  Wallet,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

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
  id: string;
  orderNo: string;
  customer: string;
  itemSummary: string;
  totalItems: number;
  status: OrderStatus;
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

const ORDER_STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Statuses" },
  { value: "Reserved", label: "Reserved" },
  { value: "Pending", label: "Pending" },
  { value: "For Release", label: "For Release" },
  { value: "Released", label: "Released" },
  { value: "Cancelled", label: "Cancelled" },
];

const PAYMENT_STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Payment Statuses" },
  { value: "Unpaid", label: "Unpaid" },
  { value: "Partial", label: "Partial" },
  { value: "Paid", label: "Paid" },
];

const MOCK_ORDERS: CustomerOrderRow[] = [
  {
    id: "ORD-1001",
    orderNo: "CO-2026-0001",
    customer: "Juan Dela Cruz",
    itemSummary: "3M Tint Medium Black, Seat Cover Set",
    totalItems: 2,
    status: "Reserved",
    paymentStatus: "Partial",
    downpayment: 3000,
    totalAmount: 14500,
    balance: 11500,
    orderDate: "2026-04-01",
    releaseDate: "2026-04-10",
  },
  {
    id: "ORD-1002",
    orderNo: "CO-2026-0002",
    customer: "Maria Santos",
    itemSummary: "Android Head Unit 9in",
    totalItems: 1,
    status: "Pending",
    paymentStatus: "Unpaid",
    downpayment: 0,
    totalAmount: 12500,
    balance: 12500,
    orderDate: "2026-04-02",
    releaseDate: "2026-04-12",
  },
  {
    id: "ORD-1003",
    orderNo: "CO-2026-0003",
    customer: "Paolo Reyes",
    itemSummary: "LED Fog Lamp Set, LED Headlight Bulb",
    totalItems: 2,
    status: "For Release",
    paymentStatus: "Partial",
    downpayment: 5000,
    totalAmount: 5700,
    balance: 700,
    orderDate: "2026-04-03",
    releaseDate: "2026-04-08",
  },
  {
    id: "ORD-1004",
    orderNo: "CO-2026-0004",
    customer: "Angela Villanueva",
    itemSummary: "Nano Ceramic Tint",
    totalItems: 1,
    status: "Released",
    paymentStatus: "Paid",
    downpayment: 14500,
    totalAmount: 14500,
    balance: 0,
    orderDate: "2026-03-29",
    releaseDate: "2026-04-03",
  },
  {
    id: "ORD-1005",
    orderNo: "CO-2026-0005",
    customer: "Mark Bautista",
    itemSummary: "Premium Seat Cover Beige, Rear Spoiler",
    totalItems: 2,
    status: "Pending",
    paymentStatus: "Partial",
    downpayment: 4000,
    totalAmount: 14000,
    balance: 10000,
    orderDate: "2026-04-04",
    releaseDate: "2026-04-14",
  },
];

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH")}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getOrderStatusBadgeClass(status: OrderStatus) {
  switch (status) {
    case "Reserved":
      return "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50";
    case "Pending":
      return "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
    case "For Release":
      return "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50";
    case "Released":
      return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
    case "Cancelled":
      return "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50";
    default:
      return "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100";
  }
}

function getPaymentStatusBadgeClass(status: PaymentStatus) {
  switch (status) {
    case "Unpaid":
      return "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50";
    case "Partial":
      return "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
    case "Paid":
      return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
    default:
      return "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100";
  }
}

async function mockFetchCustomerOrders(params: {
  page: number;
  pageSize: number;
  orderNo: string;
  customer: string;
  orderStatus: string;
  paymentStatus: string;
}): Promise<CustomerOrdersApiResponse> {
  const { page, pageSize, orderNo, customer, orderStatus, paymentStatus } =
    params;

  await new Promise((resolve) => setTimeout(resolve, 400));

  let filtered = [...MOCK_ORDERS];

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
      totalOrders: MOCK_ORDERS.length,
      pendingOrders: MOCK_ORDERS.filter(
        (item) => item.status === "Pending" || item.status === "Reserved",
      ).length,
      forReleaseOrders: MOCK_ORDERS.filter(
        (item) => item.status === "For Release",
      ).length,
      releasedOrders: MOCK_ORDERS.filter((item) => item.status === "Released")
        .length,
      totalDownpayments: MOCK_ORDERS.reduce(
        (sum, item) => sum + item.downpayment,
        0,
      ),
    },
  };
}

const reactSelectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    minHeight: "40px",
    borderRadius: "0.75rem",
    borderColor: state.isFocused ? "#10b981" : "#e2e8f0",
    boxShadow: "none",
    "&:hover": {
      borderColor: "#10b981",
    },
  }),
  valueContainer: (base: any) => ({
    ...base,
    paddingLeft: "10px",
    paddingRight: "10px",
  }),
  input: (base: any) => ({
    ...base,
    color: "#0f172a",
  }),
  placeholder: (base: any) => ({
    ...base,
    color: "#94a3b8",
    fontSize: "14px",
  }),
  menu: (base: any) => ({
    ...base,
    borderRadius: "0.75rem",
    overflow: "hidden",
    zIndex: 50,
  }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#10b981"
      : state.isFocused
        ? "#ecfdf5"
        : "#ffffff",
    color: state.isSelected ? "#ffffff" : "#0f172a",
    cursor: "pointer",
  }),
};

export default function CustomerOrdersPage() {
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

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, isFetching } = useQuery({
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
      mockFetchCustomerOrders({
        page,
        pageSize,
        orderNo: appliedOrderNo,
        customer: appliedCustomer,
        orderStatus: appliedOrderStatus,
        paymentStatus: appliedPaymentStatus,
      }),
    placeholderData: (previousData) => previousData,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  };
  const summary = data?.summary ?? {
    totalOrders: 0,
    pendingOrders: 0,
    forReleaseOrders: 0,
    releasedOrders: 0,
    totalDownpayments: 0,
  };

  const showingFrom = useMemo(() => {
    if (meta.total === 0) return 0;
    return (meta.page - 1) * meta.pageSize + 1;
  }, [meta]);

  const showingTo = useMemo(() => {
    if (meta.total === 0) return 0;
    return Math.min(meta.page * meta.pageSize, meta.total);
  }, [meta]);

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
          <Link href="/customer-orders/create">
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
              Create Order
            </Button>
          </Link>
          <Button variant="outline">Export</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-slate-500">Total Orders</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.totalOrders}
              </h3>
              <p className="mt-2 text-sm text-sky-600">
                Customer reservation records
              </p>
            </div>
            <div className="rounded-full bg-sky-50 p-2">
              <ShoppingBag className="h-5 w-5 text-sky-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-slate-500">Pending / Reserved</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.pendingOrders}
              </h3>
              <p className="mt-2 text-sm text-amber-600">
                Waiting for stock or fulfillment
              </p>
            </div>
            <div className="rounded-full bg-amber-50 p-2">
              <Clock3 className="h-5 w-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-slate-500">For Release</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.forReleaseOrders}
              </h3>
              <p className="mt-2 text-sm text-sky-600">
                Ready for pickup or installation
              </p>
            </div>
            <div className="rounded-full bg-sky-50 p-2">
              <Clock3 className="h-5 w-5 text-sky-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-slate-500">Released</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.releasedOrders}
              </h3>
              <p className="mt-2 text-sm text-emerald-600">
                Completed and released orders
              </p>
            </div>
            <div className="rounded-full bg-emerald-50 p-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-slate-500">Total Downpayments</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {formatPeso(summary.totalDownpayments)}
              </h3>
              <p className="mt-2 text-sm text-emerald-600">
                Collected partial payments
              </p>
            </div>
            <div className="rounded-full bg-emerald-50 p-2">
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
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
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

      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Customer Order List
              </h3>
              <p className="text-sm text-slate-500">
                Showing {showingFrom} to {showingTo} of {meta.total} orders
                {isFetching && !isLoading ? " • Updating..." : ""}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px]">
              <thead className="bg-slate-50">
                <tr className="border-b">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order No.
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Items
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total Items
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Payment
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Downpayment
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Balance
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Release Date
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-5 py-16 text-center">
                      <div className="flex items-center justify-center gap-2 text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading customer orders...
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-5 py-16 text-center text-slate-500"
                    >
                      No customer orders found.
                    </td>
                  </tr>
                ) : (
                  rows.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b transition-colors hover:bg-slate-50"
                    >
                      <td className="px-5 py-4 text-sm font-medium text-foreground">
                        {order.orderNo}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {order.customer}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        <span className="line-clamp-1">
                          {order.itemSummary}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
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
                      <td className="px-5 py-4 text-sm font-medium text-slate-700">
                        {formatPeso(order.downpayment)}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-700">
                        {formatPeso(order.balance)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {formatDate(order.releaseDate)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/customer-orders/${order.id}` as any}>
                            <Button size="sm" variant="outline">
                              View / Edit
                            </Button>
                          </Link>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                            onClick={() => {
                              setSelectedOrder(order);
                              setIsDownpaymentOpen(true);
                            }}
                          >
                            Downpayment
                          </Button>

                          {order.status !== "Released" && (
                            <Link
                              href={
                                `/customer-orders/${order.id}/release` as any
                              }
                            >
                              <Button size="sm" variant="secondary">
                                Release
                              </Button>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Page {meta.page} of {Math.max(meta.totalPages, 1)}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={meta.page <= 1 || isFetching}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((prev) => Math.min(prev + 1, meta.totalPages || 1))
                }
                disabled={meta.page >= meta.totalPages || isFetching}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isDownpaymentOpen}
        onOpenChange={(open) => {
          setIsDownpaymentOpen(open);
          if (!open) setSelectedOrder(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Downpayment</DialogTitle>
            <DialogDescription>
              Add payment for this customer order.
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
              <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
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
                <p className="text-xs text-slate-500">Total Amount</p>
                <p className="text-sm font-semibold">
                  ₱{selectedOrder?.totalAmount?.toLocaleString("en-PH")}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-500">Remaining Balance</p>
                <p className="text-sm font-semibold text-amber-600">
                  ₱{selectedOrder?.balance?.toLocaleString("en-PH")}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Downpayment Amount</Label>
              <Input type="number" placeholder="0" />
            </div>

            <div className="space-y-2">
              <Label>Reference / Notes</Label>
              <Input placeholder="Receipt, bank transfer, etc." />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDownpaymentOpen(false)}
            >
              Cancel
            </Button>

            <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
