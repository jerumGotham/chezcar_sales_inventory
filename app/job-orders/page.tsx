"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";
import Link from "next/link";
import {
  Eye,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { reactSelectStyles } from "@/lib/select-styles";

type SelectOption = {
  value: string;
  label: string;
};

type JobOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type JobOrderRow = {
  id: string;
  joNo: string;
  customer: string;
  vehicle: string;
  branch: string;
  service: string;
  status: string;
  serviceFee: number;
  partsTotal: number;
  totalAmount: number;
  notes?: string;
  createdAt: string;
  items: JobOrderItem[];
};

type JobOrdersApiResponse = {
  data: JobOrderRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalJobOrders: number;
    inProgress: number;
    readyForRelease: number;
    completed: number;
  };
};

const BRANCH_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Branches" },
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "in-progress", label: "In Progress" },
  { value: "ready-for-release", label: "Ready for Release" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const MOCK_JOB_ORDERS: JobOrderRow[] = [
  {
    id: "JO-1001",
    joNo: "JO-1001",
    customer: "Mark Reyes",
    vehicle: "Toyota Rush 2022",
    branch: "QC Main",
    service:
      "Full tint installation with medium black shade. Check side alignment and rear glass finish.",
    status: "In Progress",
    serviceFee: 2500,
    partsTotal: 8500,
    totalAmount: 11000,
    notes: "Priority unit. Customer waiting.",
    createdAt: "2026-04-02",
    items: [
      {
        productId: "PROD-001",
        productName: "3M Tint Full Set",
        quantity: 1,
        unitPrice: 8500,
      },
    ],
  },
  {
    id: "JO-1002",
    joNo: "JO-1002",
    customer: "Paolo Santos",
    vehicle: "Montero 2021",
    branch: "Makati",
    service:
      "Install reverse camera and route wiring cleanly through stock harness path.",
    status: "Ready for Release",
    serviceFee: 1800,
    partsTotal: 3500,
    totalAmount: 5300,
    notes: "Hide wiring neatly.",
    createdAt: "2026-04-03",
    items: [
      {
        productId: "PROD-003",
        productName: "Reverse Camera",
        quantity: 1,
        unitPrice: 3500,
      },
    ],
  },
  {
    id: "JO-1003",
    joNo: "JO-1003",
    customer: "Gina Lopez",
    vehicle: "Honda City 2020",
    branch: "Pasig",
    service:
      "Electrical inspection only. Customer reported intermittent power issue on accessory socket.",
    status: "Completed",
    serviceFee: 1200,
    partsTotal: 0,
    totalAmount: 1200,
    notes: "Service only. No parts used.",
    createdAt: "2026-04-01",
    items: [],
  },
  {
    id: "JO-1004",
    joNo: "JO-1004",
    customer: "Anna Garcia",
    vehicle: "Ford Ranger 2023",
    branch: "Makati",
    service:
      "Install Android head unit and test steering wheel controls and reverse trigger.",
    status: "Pending",
    serviceFee: 2200,
    partsTotal: 15000,
    totalAmount: 17200,
    notes: "Schedule after lunch.",
    createdAt: "2026-04-04",
    items: [
      {
        productId: "PROD-004",
        productName: "Android Head Unit",
        quantity: 1,
        unitPrice: 15000,
      },
    ],
  },
  {
    id: "JO-1005",
    joNo: "JO-1005",
    customer: "Leo Mendoza",
    vehicle: "Toyota Hilux 2022",
    branch: "Pasig",
    service:
      "Install dash cam and horn set. Test relay and front/rear recording before release.",
    status: "In Progress",
    serviceFee: 3000,
    partsTotal: 7000,
    totalAmount: 10000,
    notes: "Customer may add more accessories.",
    createdAt: "2026-04-05",
    items: [
      {
        productId: "PROD-005",
        productName: "Dash Cam",
        quantity: 1,
        unitPrice: 4800,
      },
      {
        productId: "PROD-006",
        productName: "Bosch Horn Set",
        quantity: 1,
        unitPrice: 2200,
      },
    ],
  },
];

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function getStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("completed") || normalized.includes("ready")) {
    return "border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:bg-emerald-950/40";
  }

  if (normalized.includes("progress") || normalized.includes("pending")) {
    return "border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:bg-amber-950/40";
  }

  if (normalized.includes("cancel")) {
    return "border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-50 dark:bg-red-950/40";
  }

  return "border border-border bg-muted text-foreground hover:bg-muted";
}

async function mockFetchJobOrders(params: {
  page: number;
  pageSize: number;
  keyword: string;
  branch: string;
  status: string;
}): Promise<JobOrdersApiResponse> {
  const { page, pageSize, keyword, branch, status } = params;

  await new Promise((resolve) => setTimeout(resolve, 400));

  let filtered = [...MOCK_JOB_ORDERS];

  if (keyword.trim()) {
    const search = keyword.trim().toLowerCase();
    filtered = filtered.filter(
      (job) =>
        job.joNo.toLowerCase().includes(search) ||
        job.customer.toLowerCase().includes(search) ||
        job.service.toLowerCase().includes(search) ||
        job.vehicle.toLowerCase().includes(search),
    );
  }

  if (branch !== "all") {
    filtered = filtered.filter((job) => job.branch === branch);
  }

  if (status !== "all") {
    filtered = filtered.filter(
      (job) => job.status.toLowerCase().replace(/\s+/g, "-") === status,
    );
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: filtered.slice(start, end),
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    summary: {
      totalJobOrders: MOCK_JOB_ORDERS.length,
      inProgress: MOCK_JOB_ORDERS.filter((j) => j.status === "In Progress")
        .length,
      readyForRelease: MOCK_JOB_ORDERS.filter(
        (j) => j.status === "Ready for Release",
      ).length,
      completed: MOCK_JOB_ORDERS.filter((j) => j.status === "Completed").length,
    },
  };
}


export default function JobOrdersPage() {
  const [keyword, setKeyword] = useState("");
  const [branch, setBranch] = useState<SelectOption>(BRANCH_OPTIONS[0]);
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);

  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [appliedBranch, setAppliedBranch] = useState("all");
  const [appliedStatus, setAppliedStatus] = useState("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedJobOrder, setSelectedJobOrder] = useState<JobOrderRow | null>(
    null,
  );
  const [isViewOpen, setIsViewOpen] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "job-orders",
      {
        page,
        pageSize,
        keyword: appliedKeyword,
        branch: appliedBranch,
        status: appliedStatus,
      },
    ],
    queryFn: () =>
      mockFetchJobOrders({
        page,
        pageSize,
        keyword: appliedKeyword,
        branch: appliedBranch,
        status: appliedStatus,
      }),
    placeholderData: (previousData) => previousData,
  });

  const summary = data?.summary ?? {
    totalJobOrders: 0,
    inProgress: 0,
    readyForRelease: 0,
    completed: 0,
  };

  const meta = data?.meta ?? {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  };

  const rows = data?.data ?? [];

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
    setAppliedKeyword(keyword);
    setAppliedBranch(branch.value);
    setAppliedStatus(status.value);
  };

  const handleResetFilters = () => {
    setKeyword("");
    setBranch(BRANCH_OPTIONS[0]);
    setStatus(STATUS_OPTIONS[0]);
    setAppliedKeyword("");
    setAppliedBranch("all");
    setAppliedStatus("all");
    setPage(1);
  };

  const handleQuickComplete = (job: JobOrderRow) => {
    console.log("QUICK COMPLETE JOB ORDER", {
      id: job.id,
      joNo: job.joNo,
      status: "Completed",
    });
  };

  return (
    <>
      <PageShell
        title="Job Orders"
        subtitle="Manage installation and service transactions with optional items, service details, notes, and fast completion."
        actions={
          <>
            <Link href="/job-orders/create" className={buttonVariants()}>
              Create Job Order
            </Link>
            {/* <Button variant="outline">Assign Parts</Button> */}
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total Job Orders</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.totalJobOrders}
              </h3>
              <p className="mt-2 text-sm text-sky-600">
                Service and installation records
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">In Progress</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.inProgress}
              </h3>
              <p className="mt-2 text-sm text-amber-600">
                Units currently being worked on
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Ready for Release</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.readyForRelease}
              </h3>
              <p className="mt-2 text-sm text-emerald-600">
                Waiting for release and payment
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Completed</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.completed}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Finished service transactions
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
            <Input
              placeholder="Search JO no., customer, service, vehicle"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />

            <div className="w-full">
              <Select
                instanceId="job-order-branch-filter"
                options={BRANCH_OPTIONS}
                value={branch}
                onChange={(option) => setBranch(option ?? BRANCH_OPTIONS[0])}
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="w-full">
              <Select
                instanceId="job-order-status-filter"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(option) => setStatus(option ?? STATUS_OPTIONS[0])}
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleApplyFilters}
            >
              Apply Filters
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleResetFilters}
            >
              Reset
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Job Order List
                </h3>
                <p className="text-sm text-muted-foreground">
                  Showing {showingFrom} to {showingTo} of {meta.total} job
                  orders
                  {isFetching && !isLoading ? " • Updating..." : ""}
                </p>
              </div>
              <TablePagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} busy={isFetching} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px]">
                <thead className="bg-muted">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      JO No.
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Customer
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Vehicle
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Branch
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Service
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Service Fee
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Parts Total
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total Amount
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-16 text-center">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading job orders...
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-5 py-16 text-center text-muted-foreground"
                      >
                        No job orders found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((job) => (
                      <tr
                        key={job.id}
                        className="border-b transition-colors hover:bg-muted"
                      >
                        <td className="px-5 py-4 text-sm font-medium text-foreground">
                          {job.joNo}
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground">
                          {job.customer}
                        </td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {job.vehicle}
                        </td>
                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {job.branch}
                        </td>
                        <td className="max-w-[320px] px-5 py-4 text-sm text-muted-foreground">
                          <p className="line-clamp-2">{job.service}</p>
                        </td>
                        <td className="px-5 py-4 text-sm">
                          <Badge className={getStatusBadgeClass(job.status)}>
                            {job.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground">
                          {formatPeso(job.serviceFee)}
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground">
                          {formatPeso(job.partsTotal)}
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-foreground">
                          {formatPeso(job.totalAmount)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="view"
                              onClick={() => {
                                setSelectedJobOrder(job);
                                setIsViewOpen(true);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Button>

                            <Link
                              href={`/job-orders/${job.id}/edit` as const}
                              className={buttonVariants({ variant: "edit", size: "sm" })}
                            >
                              Edit
                            </Link>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                              >
                                Delete
                              </Button>
                            </div>

                            {job.status !== "Completed" && (
                              <Button
                                size="sm"
                                variant="workflow"
                                onClick={() => handleQuickComplete(job)}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Completed
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </CardContent>
        </Card>
      </PageShell>

      <Dialog
        open={isViewOpen}
        onOpenChange={(open) => {
          setIsViewOpen(open);
          if (!open) setSelectedJobOrder(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedJobOrder?.joNo ?? "Job Order Details"}
            </DialogTitle>
            <DialogDescription>
              View service details, notes, and items used for this transaction.
            </DialogDescription>
          </DialogHeader>

          {selectedJobOrder && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="grid gap-3 p-5">
                    <div>
                      <p className="text-sm text-muted-foreground">Customer</p>
                      <p className="font-medium text-foreground">
                        {selectedJobOrder.customer}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Vehicle</p>
                      <p className="font-medium text-foreground">
                        {selectedJobOrder.vehicle}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Branch</p>
                      <p className="font-medium text-foreground">
                        {selectedJobOrder.branch}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge
                        className={getStatusBadgeClass(selectedJobOrder.status)}
                      >
                        {selectedJobOrder.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="grid gap-3 p-5">
                    <div>
                      <p className="text-sm text-muted-foreground">Service Fee</p>
                      <p className="font-semibold text-foreground">
                        {formatPeso(selectedJobOrder.serviceFee)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Parts Total</p>
                      <p className="font-semibold text-foreground">
                        {formatPeso(selectedJobOrder.partsTotal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatPeso(selectedJobOrder.totalAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created At</p>
                      <p className="font-medium text-foreground">
                        {selectedJobOrder.createdAt}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="p-5">
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    Service Details
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {selectedJobOrder.service}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    Notes
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {selectedJobOrder.notes || "—"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      Items Used
                    </p>
                    <Badge variant="outline">
                      {selectedJobOrder.items.length} item(s)
                    </Badge>
                  </div>

                  {selectedJobOrder.items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
                      No items used. This is a service-only transaction.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px]">
                        <thead className="bg-muted">
                          <tr className="border-b">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Item
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Qty
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Unit Price
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedJobOrder.items.map((item, index) => (
                            <tr
                              key={`${item.productId}-${index}`}
                              className="border-b"
                            >
                              <td className="px-4 py-3 text-sm text-foreground">
                                {item.productName}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                {item.quantity}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                {formatPeso(item.unitPrice)}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-foreground">
                                {formatPeso(item.quantity * item.unitPrice)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* <DialogFooter>
            {selectedJobOrder && selectedJobOrder.status !== "Completed" && (
              <Button
                variant="outline"
                className="border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:bg-violet-950/40 hover:text-violet-800 dark:text-violet-300"
                onClick={() => handleQuickComplete(selectedJobOrder)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark as Completed
              </Button>
            )}

            {selectedJobOrder && (
              <Link href={`/job-orders/${selectedJobOrder.id}/edit` as const}>
                <Button>
                  Update Job Order
                </Button>
              </Link>
            )}
          </DialogFooter> */}
        </DialogContent>
      </Dialog>
    </>
  );
}
