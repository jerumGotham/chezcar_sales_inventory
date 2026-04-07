"use client";

import { useMemo, useState } from "react";
import Select from "react-select";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackageCheck,
  Truck,
  Clock3,
  ClipboardList,
  Plus,
  Trash2,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SelectOption = {
  value: string;
  label: string;
};

type TransferStatus =
  | "Pending"
  | "Approved"
  | "In Transit"
  | "Received"
  | "Rejected";

type TransferRow = {
  id: string;
  transferNo: string;
  from: string;
  to: string;
  item: string;
  qty: number;
  requestedBy: string;
  approvedBy?: string;
  requestedDate: string;
  status: TransferStatus;
};

type TransferItemForm = {
  item: string;
  qty: number;
};

const BRANCH_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Branches" },
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

const REQUEST_BRANCH_OPTIONS: SelectOption[] = [
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Status" },
  { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" },
  { value: "In Transit", label: "In Transit" },
  { value: "Received", label: "Received" },
  { value: "Rejected", label: "Rejected" },
];

const PRODUCT_OPTIONS: SelectOption[] = [
  { value: "3M Tint Medium Black", label: "3M Tint Medium Black" },
  { value: "Ceramic Tint Full Set", label: "Ceramic Tint Full Set" },
  { value: "Seat Cover Premium", label: "Seat Cover Premium" },
  { value: "Dashcam Set", label: "Dashcam Set" },
  { value: "Matting Set", label: "Matting Set" },
  { value: "Pioneer Head Unit", label: "Pioneer Head Unit" },
  { value: "Reverse Camera", label: "Reverse Camera" },
  { value: "Horn Set", label: "Horn Set" },
  { value: "Roof Insulation Kit", label: "Roof Insulation Kit" },
  { value: "Amplifier 4CH", label: "Amplifier 4CH" },
];

const INITIAL_TRANSFERS: TransferRow[] = [
  {
    id: "TR-1001",
    transferNo: "ST-2026-001",
    from: "QC Main",
    to: "Makati",
    item: "3M Tint Medium Black",
    qty: 12,
    requestedBy: "Mark Reyes",
    approvedBy: "Admin QC",
    requestedDate: "2026-04-01",
    status: "Approved",
  },
  {
    id: "TR-1002",
    transferNo: "ST-2026-002",
    from: "Pasig",
    to: "QC Main",
    item: "Ceramic Tint Full Set",
    qty: 6,
    requestedBy: "Leo Mendoza",
    requestedDate: "2026-04-02",
    status: "Pending",
  },
  {
    id: "TR-1003",
    transferNo: "ST-2026-003",
    from: "Makati",
    to: "Pasig",
    item: "Seat Cover Premium",
    qty: 4,
    requestedBy: "Paolo Santos",
    approvedBy: "Admin Makati",
    requestedDate: "2026-04-02",
    status: "In Transit",
  },
  {
    id: "TR-1004",
    transferNo: "ST-2026-004",
    from: "QC Main",
    to: "Pasig",
    item: "Dashcam Set",
    qty: 8,
    requestedBy: "Anna Garcia",
    approvedBy: "Admin QC",
    requestedDate: "2026-04-03",
    status: "Received",
  },
  {
    id: "TR-1005",
    transferNo: "ST-2026-005",
    from: "Pasig",
    to: "Makati",
    item: "Matting Set",
    qty: 10,
    requestedBy: "Patricia Lim",
    requestedDate: "2026-04-04",
    status: "Rejected",
  },
  {
    id: "TR-1006",
    transferNo: "ST-2026-006",
    from: "QC Main",
    to: "Makati",
    item: "Pioneer Head Unit",
    qty: 3,
    requestedBy: "Maria Torres",
    approvedBy: "Admin QC",
    requestedDate: "2026-04-05",
    status: "Pending",
  },
  {
    id: "TR-1007",
    transferNo: "ST-2026-007",
    from: "Makati",
    to: "QC Main",
    item: "Reverse Camera",
    qty: 5,
    requestedBy: "Rose Bautista",
    approvedBy: "Admin Makati",
    requestedDate: "2026-04-06",
    status: "Approved",
  },
  {
    id: "TR-1008",
    transferNo: "ST-2026-008",
    from: "Pasig",
    to: "QC Main",
    item: "Horn Set",
    qty: 7,
    requestedBy: "Nico Ramos",
    requestedDate: "2026-04-06",
    status: "Pending",
  },
  {
    id: "TR-1009",
    transferNo: "ST-2026-009",
    from: "QC Main",
    to: "Pasig",
    item: "Roof Insulation Kit",
    qty: 9,
    requestedBy: "Alden Flores",
    approvedBy: "Admin QC",
    requestedDate: "2026-04-07",
    status: "In Transit",
  },
  {
    id: "TR-1010",
    transferNo: "ST-2026-010",
    from: "Makati",
    to: "Pasig",
    item: "Amplifier 4CH",
    qty: 2,
    requestedBy: "John Villanueva",
    approvedBy: "Admin Makati",
    requestedDate: "2026-04-07",
    status: "Received",
  },
];

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
    zIndex: 60,
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

function getStatusBadgeClass(status: TransferStatus) {
  switch (status) {
    case "Pending":
      return "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
    case "Approved":
      return "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50";
    case "In Transit":
      return "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50";
    case "Received":
      return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
    case "Rejected":
      return "border border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50";
  }
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function createTransferNumber(count: number) {
  return `ST-2026-${String(count).padStart(3, "0")}`;
}

export default function StockTransfersPage() {
  const [transfers, setTransfers] = useState<TransferRow[]>(INITIAL_TRANSFERS);

  const [activeTab, setActiveTab] = useState("requestor");

  const [keyword, setKeyword] = useState("");
  const [branch, setBranch] = useState<SelectOption>(BRANCH_OPTIONS[0]);
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);

  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [appliedBranch, setAppliedBranch] = useState("all");
  const [appliedStatus, setAppliedStatus] = useState("all");

  const [page, setPage] = useState(1);
  const pageSize = 8;
  const isLoading = false;

  const [selectedTransfer, setSelectedTransfer] = useState<TransferRow | null>(
    null,
  );

  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isTransitOpen, setIsTransitOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);

  const [requestFrom, setRequestFrom] = useState<SelectOption>(
    REQUEST_BRANCH_OPTIONS[0],
  );
  const [requestTo, setRequestTo] = useState<SelectOption>(
    REQUEST_BRANCH_OPTIONS[1],
  );
  const [requestItems, setRequestItems] = useState<TransferItemForm[]>([
    { item: PRODUCT_OPTIONS[0].value, qty: 1 },
  ]);

  const filteredTransfers = useMemo(() => {
    let rows = [...transfers];

    if (activeTab === "approval") {
      rows = rows.filter((item) =>
        ["Pending", "Approved", "In Transit"].includes(item.status),
      );
    }

    if (appliedKeyword.trim()) {
      const query = appliedKeyword.toLowerCase();
      rows = rows.filter(
        (item) =>
          item.transferNo.toLowerCase().includes(query) ||
          item.item.toLowerCase().includes(query) ||
          item.from.toLowerCase().includes(query) ||
          item.to.toLowerCase().includes(query),
      );
    }

    if (appliedBranch !== "all") {
      rows = rows.filter(
        (item) => item.from === appliedBranch || item.to === appliedBranch,
      );
    }

    if (appliedStatus !== "all") {
      rows = rows.filter((item) => item.status === appliedStatus);
    }

    return rows;
  }, [transfers, activeTab, appliedKeyword, appliedBranch, appliedStatus]);

  const summary = useMemo(() => {
    return {
      totalRequests: transfers.length,
      pending: transfers.filter((item) => item.status === "Pending").length,
      inTransit: transfers.filter((item) => item.status === "In Transit")
        .length,
      received: transfers.filter((item) => item.status === "Received").length,
    };
  }, [transfers]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTransfers.length / pageSize),
  );
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedRows = filteredTransfers.slice(
    startIndex,
    startIndex + pageSize,
  );

  const showingFrom = filteredTransfers.length === 0 ? 0 : startIndex + 1;
  const showingTo =
    filteredTransfers.length === 0
      ? 0
      : Math.min(startIndex + pageSize, filteredTransfers.length);

  const handleApplyFilters = () => {
    setAppliedKeyword(keyword);
    setAppliedBranch(branch.value);
    setAppliedStatus(status.value);
    setPage(1);
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

  const resetRequestForm = () => {
    setRequestFrom(REQUEST_BRANCH_OPTIONS[0]);
    setRequestTo(REQUEST_BRANCH_OPTIONS[1]);
    setRequestItems([{ item: PRODUCT_OPTIONS[0].value, qty: 1 }]);
  };

  const openCreateModal = () => {
    resetRequestForm();
    setIsCreateOpen(true);
  };

  const openEditModal = (transfer: TransferRow) => {
    setSelectedTransfer(transfer);
    setRequestFrom(
      REQUEST_BRANCH_OPTIONS.find((option) => option.value === transfer.from) ??
        REQUEST_BRANCH_OPTIONS[0],
    );
    setRequestTo(
      REQUEST_BRANCH_OPTIONS.find((option) => option.value === transfer.to) ??
        REQUEST_BRANCH_OPTIONS[1],
    );
    setRequestItems([{ item: transfer.item, qty: transfer.qty }]);
    setIsEditOpen(true);
  };

  const handleAddItemRow = () => {
    setRequestItems((prev) => [
      ...prev,
      { item: PRODUCT_OPTIONS[0].value, qty: 1 },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    setRequestItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (
    index: number,
    key: keyof TransferItemForm,
    value: string | number,
  ) => {
    setRequestItems((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              [key]: key === "qty" ? Number(value) || 1 : value,
            }
          : row,
      ),
    );
  };

  const handleCreateTransfer = () => {
    if (requestFrom.value === requestTo.value) return;
    if (!requestItems.length) return;

    const firstItem = requestItems[0];
    const nextCount = transfers.length + 1;

    const newTransfer: TransferRow = {
      id: `TR-${1000 + nextCount}`,
      transferNo: createTransferNumber(nextCount),
      from: requestFrom.value,
      to: requestTo.value,
      item:
        requestItems.length > 1
          ? `${firstItem.item} +${requestItems.length - 1} more`
          : firstItem.item,
      qty: requestItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
      requestedBy: "Current User",
      requestedDate: todayString(),
      status: "Pending",
    };

    setTransfers((prev) => [newTransfer, ...prev]);
    setIsCreateOpen(false);
    resetRequestForm();
  };

  const handleSaveEdit = () => {
    if (!selectedTransfer) return;
    if (requestFrom.value === requestTo.value) return;
    if (!requestItems.length) return;

    const firstItem = requestItems[0];

    setTransfers((prev) =>
      prev.map((transfer) =>
        transfer.id === selectedTransfer.id
          ? {
              ...transfer,
              from: requestFrom.value,
              to: requestTo.value,
              item:
                requestItems.length > 1
                  ? `${firstItem.item} +${requestItems.length - 1} more`
                  : firstItem.item,
              qty: requestItems.reduce(
                (sum, item) => sum + (Number(item.qty) || 0),
                0,
              ),
            }
          : transfer,
      ),
    );

    setIsEditOpen(false);
    setSelectedTransfer(null);
    resetRequestForm();
  };

  const updateTransferStatus = (
    transferId: string,
    nextStatus: TransferStatus,
    approvedBy?: string,
  ) => {
    setTransfers((prev) =>
      prev.map((transfer) =>
        transfer.id === transferId
          ? {
              ...transfer,
              status: nextStatus,
              approvedBy:
                approvedBy !== undefined ? approvedBy : transfer.approvedBy,
            }
          : transfer,
      ),
    );
  };

  return (
    <>
      <PageShell
        title="Stock Transfers"
        subtitle="Request, approve, dispatch, and monitor branch-to-branch stock transfers."
        actions={
          <>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={openCreateModal}
            >
              Create Transfer Request
            </Button>
            <Button variant="outline">Transfer History</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Requests</p>
                  <h3 className="mt-3 text-3xl font-bold text-foreground">
                    {summary.totalRequests}
                  </h3>
                  <p className="mt-2 text-sm text-sky-600">
                    All recorded stock transfers
                  </p>
                </div>
                <ClipboardList className="h-8 w-8 text-sky-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Pending Approval</p>
                  <h3 className="mt-3 text-3xl font-bold text-foreground">
                    {summary.pending}
                  </h3>
                  <p className="mt-2 text-sm text-amber-600">
                    Waiting for review and approval
                  </p>
                </div>
                <Clock3 className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">In Transit</p>
                  <h3 className="mt-3 text-3xl font-bold text-foreground">
                    {summary.inTransit}
                  </h3>
                  <p className="mt-2 text-sm text-violet-600">
                    Approved and currently moving
                  </p>
                </div>
                <Truck className="h-8 w-8 text-violet-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Received</p>
                  <h3 className="mt-3 text-3xl font-bold text-foreground">
                    {summary.received}
                  </h3>
                  <p className="mt-2 text-sm text-emerald-600">
                    Successfully received by destination
                  </p>
                </div>
                <PackageCheck className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value);
            setPage(1);
          }}
          className="mt-6"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="requestor">Requestor</TabsTrigger>
            <TabsTrigger value="approval">Approval / Receiving</TabsTrigger>
          </TabsList>

          <TabsContent value="requestor" className="mt-6 space-y-6">
            <Card>
              <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
                <Input
                  placeholder="Search transfer no. or item"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />

                <div className="w-full">
                  <Select
                    instanceId="branch-filter-requestor"
                    options={BRANCH_OPTIONS}
                    value={branch}
                    onChange={(option) =>
                      setBranch(option ?? BRANCH_OPTIONS[0])
                    }
                    isSearchable
                    placeholder="Select branch"
                    styles={reactSelectStyles}
                  />
                </div>

                <div className="w-full">
                  <Select
                    instanceId="status-filter-requestor"
                    options={STATUS_OPTIONS}
                    value={status}
                    onChange={(option) =>
                      setStatus(option ?? STATUS_OPTIONS[0])
                    }
                    isSearchable
                    placeholder="Select status"
                    styles={reactSelectStyles}
                  />
                </div>

                <Button
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
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

            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Transfer Requests
                    </h3>
                    <p className="text-sm text-slate-500">
                      Showing {showingFrom} to {showingTo} of{" "}
                      {filteredTransfers.length} requests
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px]">
                    <thead className="bg-slate-50">
                      <tr className="border-b">
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Transfer No.
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          From
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          To
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Item
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Qty
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Requested By
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Request Date
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Status
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan={9} className="px-5 py-16 text-center">
                            <div className="flex items-center justify-center gap-2 text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading transfers...
                            </div>
                          </td>
                        </tr>
                      ) : paginatedRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-5 py-16 text-center text-slate-500"
                          >
                            No transfer requests found.
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((transfer) => (
                          <tr
                            key={transfer.id}
                            className="border-b transition-colors hover:bg-slate-50"
                          >
                            <td className="px-5 py-4 text-sm font-medium text-slate-700">
                              {transfer.transferNo}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.from}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.to}
                            </td>
                            <td className="px-5 py-4 text-sm text-foreground">
                              {transfer.item}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.qty}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.requestedBy}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.requestedDate}
                            </td>
                            <td className="px-5 py-4 text-sm">
                              <Badge
                                className={getStatusBadgeClass(transfer.status)}
                              >
                                {transfer.status}
                              </Badge>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                                  onClick={() => {
                                    setSelectedTransfer(transfer);
                                    setIsViewOpen(true);
                                  }}
                                >
                                  View
                                </Button>

                                {transfer.status === "Pending" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                                    onClick={() => openEditModal(transfer)}
                                  >
                                    Edit
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

                <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">
                    Page {safePage} of {totalPages}
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                      disabled={safePage <= 1}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={safePage >= totalPages}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approval" className="mt-6 space-y-6">
            <Card>
              <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
                <Input
                  placeholder="Search transfer no. or item"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />

                <div className="w-full">
                  <Select
                    instanceId="branch-filter-approval"
                    options={BRANCH_OPTIONS}
                    value={branch}
                    onChange={(option) =>
                      setBranch(option ?? BRANCH_OPTIONS[0])
                    }
                    isSearchable
                    placeholder="Select branch"
                    styles={reactSelectStyles}
                  />
                </div>

                <div className="w-full">
                  <Select
                    instanceId="status-filter-approval"
                    options={STATUS_OPTIONS}
                    value={status}
                    onChange={(option) =>
                      setStatus(option ?? STATUS_OPTIONS[0])
                    }
                    isSearchable
                    placeholder="Select status"
                    styles={reactSelectStyles}
                  />
                </div>

                <Button
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
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

            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Approval / Receiving Queue
                    </h3>
                    <p className="text-sm text-slate-500">
                      Showing {showingFrom} to {showingTo} of{" "}
                      {filteredTransfers.length} requests
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px]">
                    <thead className="bg-slate-50">
                      <tr className="border-b">
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Transfer No.
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          From
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          To
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Item
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Qty
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Requested By
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Approved By
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Status
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan={9} className="px-5 py-16 text-center">
                            <div className="flex items-center justify-center gap-2 text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading approvals...
                            </div>
                          </td>
                        </tr>
                      ) : paginatedRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-5 py-16 text-center text-slate-500"
                          >
                            No approval items found.
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((transfer) => (
                          <tr
                            key={transfer.id}
                            className="border-b transition-colors hover:bg-slate-50"
                          >
                            <td className="px-5 py-4 text-sm font-medium text-slate-700">
                              {transfer.transferNo}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.from}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.to}
                            </td>
                            <td className="px-5 py-4 text-sm text-foreground">
                              {transfer.item}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.qty}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.requestedBy}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {transfer.approvedBy ?? "-"}
                            </td>
                            <td className="px-5 py-4 text-sm">
                              <Badge
                                className={getStatusBadgeClass(transfer.status)}
                              >
                                {transfer.status}
                              </Badge>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                                  onClick={() => {
                                    setSelectedTransfer(transfer);
                                    setIsViewOpen(true);
                                  }}
                                >
                                  View
                                </Button>

                                {transfer.status === "Pending" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                      onClick={() => {
                                        setSelectedTransfer(transfer);
                                        setIsApproveOpen(true);
                                      }}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                                      onClick={() => {
                                        setSelectedTransfer(transfer);
                                        setIsRejectOpen(true);
                                      }}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}

                                {transfer.status === "Approved" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                                    onClick={() => {
                                      setSelectedTransfer(transfer);
                                      setIsTransitOpen(true);
                                    }}
                                  >
                                    Mark In Transit
                                  </Button>
                                )}

                                {transfer.status === "In Transit" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                    onClick={() => {
                                      setSelectedTransfer(transfer);
                                      setIsReceiveOpen(true);
                                    }}
                                  >
                                    Mark Received
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

                <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">
                    Page {safePage} of {totalPages}
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                      disabled={safePage <= 1}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((prev) => Math.min(prev + 1, totalPages))
                      }
                      disabled={safePage >= totalPages}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageShell>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Transfer Request</DialogTitle>
            <DialogDescription>
              Create a stock transfer request with one or more items.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>From Branch</Label>
                <Select
                  instanceId="create-transfer-from"
                  options={REQUEST_BRANCH_OPTIONS}
                  value={requestFrom}
                  onChange={(option) =>
                    setRequestFrom(option ?? REQUEST_BRANCH_OPTIONS[0])
                  }
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>To Branch</Label>
                <Select
                  instanceId="create-transfer-to"
                  options={REQUEST_BRANCH_OPTIONS}
                  value={requestTo}
                  onChange={(option) =>
                    setRequestTo(option ?? REQUEST_BRANCH_OPTIONS[1])
                  }
                  styles={reactSelectStyles}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  Transfer Items
                </h3>
                <Button variant="outline" size="sm" onClick={handleAddItemRow}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {requestItems.map((row, index) => (
                  <div
                    key={`create-item-${index}`}
                    className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_140px_80px]"
                  >
                    <div className="space-y-2">
                      <Label>Product</Label>
                      <Select
                        instanceId={`create-transfer-item-${index}`}
                        options={PRODUCT_OPTIONS}
                        value={
                          PRODUCT_OPTIONS.find(
                            (option) => option.value === row.item,
                          ) ?? PRODUCT_OPTIONS[0]
                        }
                        onChange={(option) =>
                          handleItemChange(
                            index,
                            "item",
                            option?.value ?? PRODUCT_OPTIONS[0].value,
                          )
                        }
                        styles={reactSelectStyles}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) =>
                          handleItemChange(index, "qty", e.target.value)
                        }
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={requestItems.length === 1}
                        onClick={() => handleRemoveItemRow(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {requestFrom.value === requestTo.value && (
              <p className="text-sm text-red-600">
                From branch and To branch must be different.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleCreateTransfer}
              disabled={requestFrom.value === requestTo.value}
            >
              Save Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setSelectedTransfer(null);
            resetRequestForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Transfer Request</DialogTitle>
            <DialogDescription>
              Update pending transfer request details.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>From Branch</Label>
                <Select
                  instanceId="edit-transfer-from"
                  options={REQUEST_BRANCH_OPTIONS}
                  value={requestFrom}
                  onChange={(option) =>
                    setRequestFrom(option ?? REQUEST_BRANCH_OPTIONS[0])
                  }
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>To Branch</Label>
                <Select
                  instanceId="edit-transfer-to"
                  options={REQUEST_BRANCH_OPTIONS}
                  value={requestTo}
                  onChange={(option) =>
                    setRequestTo(option ?? REQUEST_BRANCH_OPTIONS[1])
                  }
                  styles={reactSelectStyles}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  Transfer Items
                </h3>
                <Button variant="outline" size="sm" onClick={handleAddItemRow}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {requestItems.map((row, index) => (
                  <div
                    key={`edit-item-${index}`}
                    className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_140px_80px]"
                  >
                    <div className="space-y-2">
                      <Label>Product</Label>
                      <Select
                        instanceId={`edit-transfer-item-${index}`}
                        options={PRODUCT_OPTIONS}
                        value={
                          PRODUCT_OPTIONS.find(
                            (option) => option.value === row.item,
                          ) ?? PRODUCT_OPTIONS[0]
                        }
                        onChange={(option) =>
                          handleItemChange(
                            index,
                            "item",
                            option?.value ?? PRODUCT_OPTIONS[0].value,
                          )
                        }
                        styles={reactSelectStyles}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) =>
                          handleItemChange(index, "qty", e.target.value)
                        }
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={requestItems.length === 1}
                        onClick={() => handleRemoveItemRow(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {requestFrom.value === requestTo.value && (
              <p className="text-sm text-red-600">
                From branch and To branch must be different.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleSaveEdit}
              disabled={requestFrom.value === requestTo.value}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isViewOpen}
        onOpenChange={(open) => {
          setIsViewOpen(open);
          if (!open) setSelectedTransfer(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Transfer Details</DialogTitle>
            <DialogDescription>
              View transfer request information and current status.
            </DialogDescription>
          </DialogHeader>

          {selectedTransfer && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Transfer No.</p>
                  <p className="font-medium text-slate-900">
                    {selectedTransfer.transferNo}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Status</p>
                  <Badge
                    className={getStatusBadgeClass(selectedTransfer.status)}
                  >
                    {selectedTransfer.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-slate-500">From</p>
                  <p className="font-medium text-slate-900">
                    {selectedTransfer.from}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">To</p>
                  <p className="font-medium text-slate-900">
                    {selectedTransfer.to}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Item</p>
                  <p className="font-medium text-slate-900">
                    {selectedTransfer.item}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Qty</p>
                  <p className="font-medium text-slate-900">
                    {selectedTransfer.qty}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Requested By</p>
                  <p className="font-medium text-slate-900">
                    {selectedTransfer.requestedBy}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Approved By</p>
                  <p className="font-medium text-slate-900">
                    {selectedTransfer.approvedBy ?? "-"}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-slate-500">Request Date</p>
                  <p className="font-medium text-slate-900">
                    {selectedTransfer.requestedDate}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Transfer</DialogTitle>
            <DialogDescription>
              Approve this transfer request and move it to Approved status.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                if (!selectedTransfer) return;
                updateTransferStatus(
                  selectedTransfer.id,
                  "Approved",
                  "Current Admin",
                );
                setIsApproveOpen(false);
                setSelectedTransfer(null);
              }}
            >
              Confirm Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Transfer</DialogTitle>
            <DialogDescription>
              Reject this transfer request. This action will update the status
              to Rejected.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedTransfer) return;
                updateTransferStatus(selectedTransfer.id, "Rejected");
                setIsRejectOpen(false);
                setSelectedTransfer(null);
              }}
            >
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTransitOpen} onOpenChange={setIsTransitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark In Transit</DialogTitle>
            <DialogDescription>
              Confirm that this approved transfer has already been dispatched.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransitOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => {
                if (!selectedTransfer) return;
                updateTransferStatus(selectedTransfer.id, "In Transit");
                setIsTransitOpen(false);
                setSelectedTransfer(null);
              }}
            >
              Confirm Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReceiveOpen} onOpenChange={setIsReceiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Received</DialogTitle>
            <DialogDescription>
              Confirm that the destination branch already received this
              transfer.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReceiveOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                if (!selectedTransfer) return;
                updateTransferStatus(selectedTransfer.id, "Received");
                setIsReceiveOpen(false);
                setSelectedTransfer(null);
              }}
            >
              Confirm Receive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
