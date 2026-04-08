"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type BranchRow = {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  contactNumber: string;
  manager: string;
  status: "Active" | "Inactive";
  totalCustomers?: number;
  totalProducts?: number;
  totalInventoryItems?: number;
};

type BranchesApiResponse = {
  data: BranchRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalBranches: number;
    activeBranches: number;
    inactiveBranches: number;
    totalManagedCustomers: number;
  };
};

type SelectOption = {
  value: string;
  label: string;
};

const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const MOCK_BRANCHES: BranchRow[] = [
  {
    id: "BR-001",
    code: "MNL",
    name: "Manila Branch",
    address: "123 Taft Avenue, Ermita",
    city: "Manila",
    contactNumber: "0917-111-1111",
    manager: "Juan Dela Cruz",
    status: "Active",
    totalCustomers: 154,
    totalProducts: 320,
    totalInventoryItems: 845,
  },
  {
    id: "BR-002",
    code: "QC",
    name: "Quezon City Branch",
    address: "45 Commonwealth Ave, Quezon City",
    city: "Quezon City",
    contactNumber: "0917-222-2222",
    manager: "Maria Santos",
    status: "Active",
    totalCustomers: 201,
    totalProducts: 355,
    totalInventoryItems: 920,
  },
  {
    id: "BR-003",
    code: "MKT",
    name: "Makati Branch",
    address: "678 Ayala Avenue, Makati",
    city: "Makati",
    contactNumber: "0917-333-3333",
    manager: "Paolo Reyes",
    status: "Active",
    totalCustomers: 173,
    totalProducts: 298,
    totalInventoryItems: 760,
  },
  {
    id: "BR-004",
    code: "PSG",
    name: "Pasig Branch",
    address: "90 Shaw Blvd, Pasig",
    city: "Pasig",
    contactNumber: "0917-444-4444",
    manager: "Anna Garcia",
    status: "Inactive",
    totalCustomers: 88,
    totalProducts: 210,
    totalInventoryItems: 420,
  },
  {
    id: "BR-005",
    code: "LU",
    name: "La Union Branch",
    address: "National Highway, San Fernando",
    city: "La Union",
    contactNumber: "0917-555-5555",
    manager: "Ana Reyes",
    status: "Inactive",
    totalCustomers: 64,
    totalProducts: 180,
    totalInventoryItems: 310,
  },
  {
    id: "BR-006",
    code: "CAV",
    name: "Cavite Branch",
    address: "Governor's Drive, Dasmariñas",
    city: "Cavite",
    contactNumber: "0917-666-6666",
    manager: "Leo Mendoza",
    status: "Active",
    totalCustomers: 140,
    totalProducts: 260,
    totalInventoryItems: 610,
  },
];

function getStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("active")) {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  if (normalized.includes("inactive")) {
    return "border border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50";
}

async function mockFetchBranches(params: {
  page: number;
  pageSize: number;
  name: string;
  status: string;
}): Promise<BranchesApiResponse> {
  const { page, pageSize, name, status } = params;

  await new Promise((resolve) => setTimeout(resolve, 500));

  let filtered = [...MOCK_BRANCHES];

  if (name.trim()) {
    const keyword = name.trim().toLowerCase();
    filtered = filtered.filter(
      (branch) =>
        branch.name.toLowerCase().includes(keyword) ||
        branch.code.toLowerCase().includes(keyword) ||
        branch.city.toLowerCase().includes(keyword) ||
        branch.manager.toLowerCase().includes(keyword),
    );
  }

  if (status !== "all") {
    filtered = filtered.filter(
      (branch) => branch.status.toLowerCase() === status,
    );
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const paginated = filtered.slice(startIndex, endIndex);

  const summary = {
    totalBranches: MOCK_BRANCHES.length,
    activeBranches: MOCK_BRANCHES.filter(
      (item) => item.status.toLowerCase() === "active",
    ).length,
    inactiveBranches: MOCK_BRANCHES.filter(
      (item) => item.status.toLowerCase() === "inactive",
    ).length,
    totalManagedCustomers: MOCK_BRANCHES.reduce(
      (sum, item) => sum + (item.totalCustomers ?? 0),
      0,
    ),
  };

  return {
    data: paginated,
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    summary,
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

export default function BranchesPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);

  const [appliedName, setAppliedName] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedBranch, setSelectedBranch] = useState<BranchRow | null>(null);
  const [isAddBranchOpen, setIsAddBranchOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "branches",
      {
        page,
        pageSize,
        name: appliedName,
        status: appliedStatus,
      },
    ],
    queryFn: () =>
      mockFetchBranches({
        page,
        pageSize,
        name: appliedName,
        status: appliedStatus,
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
    totalBranches: 0,
    activeBranches: 0,
    inactiveBranches: 0,
    totalManagedCustomers: 0,
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
    setAppliedName(name);
    setAppliedStatus(status.value);
  };

  const handleResetFilters = () => {
    setName("");
    setStatus(STATUS_OPTIONS[0]);
    setAppliedName("");
    setAppliedStatus("all");
    setPage(1);
  };

  return (
    <>
      <PageShell
        title="Branches"
        subtitle="Manage business branches used across inventory, sales, transfers, reports, and user assignment."
        actions={
          <>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                setSelectedBranch(null);
                setIsAddBranchOpen(true);
              }}
            >
              Add Branch
            </Button>
            <Button variant="outline">Export List</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Total Branches</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.totalBranches}
              </h3>
              <p className="mt-2 text-sm text-sky-600">
                All configured branch records
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Active Branches</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.activeBranches}
              </h3>
              <p className="mt-2 text-sm text-emerald-600">
                Ready for operations and sales
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Inactive Branches</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.inactiveBranches}
              </h3>
              <p className="mt-2 text-sm text-red-600">
                Not currently operating
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Managed Customers</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.totalManagedCustomers}
              </h3>
              <p className="mt-2 text-sm text-amber-600">
                Total customers across all branches
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Input
              placeholder="Search branch name, code, city, or manager"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="w-full">
              <Select
                instanceId="status-filter"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(option) => setStatus(option ?? STATUS_OPTIONS[0])}
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

        <Card className="mt-6">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Branch List
                </h3>
                <p className="text-sm text-slate-500">
                  Showing {showingFrom} to {showingTo} of {meta.total} branches
                  {isFetching && !isLoading ? " • Updating..." : ""}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-slate-50">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Branch ID
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Code
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Branch Name
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Manager
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Contact
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      City
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Customers
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Inventory
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
                          Loading branches...
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-5 py-16 text-center text-slate-500"
                      >
                        No branches found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((branch) => (
                      <tr
                        key={branch.id}
                        className="border-b transition-colors hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 text-sm font-medium text-slate-700">
                          {branch.id}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {branch.code}
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground">
                          {branch.name}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {branch.manager || "-"}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {branch.contactNumber || "-"}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {branch.city}
                        </td>
                        <td className="px-5 py-4 text-sm">
                          <Badge className={getStatusBadgeClass(branch.status)}>
                            {branch.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {branch.totalCustomers ?? 0}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {branch.totalInventoryItems ?? 0}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                              onClick={() => {
                                setSelectedBranch(branch);
                                setIsDetailsOpen(true);
                              }}
                            >
                              View
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                              onClick={() => {
                                setSelectedBranch(branch);
                                setIsAddBranchOpen(true);
                              }}
                            >
                              Edit
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                              onClick={() => {
                                setSelectedBranch(branch);
                                setIsAddBranchOpen(true);
                              }}
                            >
                              Delete
                            </Button>
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
      </PageShell>

      <Dialog
        open={isAddBranchOpen}
        onOpenChange={(open) => {
          setIsAddBranchOpen(open);
          if (!open) setSelectedBranch(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedBranch ? "Edit Branch" : "Add Branch"}
            </DialogTitle>
            <DialogDescription>
              Save branch details for inventory, sales, transfers, and staff
              assignment.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branchCode">Branch Code</Label>
                <Input
                  id="branchCode"
                  defaultValue={selectedBranch?.code ?? ""}
                  placeholder="MNL"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branchName">Branch Name</Label>
                <Input
                  id="branchName"
                  defaultValue={selectedBranch?.name ?? ""}
                  placeholder="Manila Branch"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branchContact">Contact Number</Label>
                <Input
                  id="branchContact"
                  defaultValue={selectedBranch?.contactNumber ?? ""}
                  placeholder="0917-000-0000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branchManager">Branch Manager</Label>
                <Input
                  id="branchManager"
                  defaultValue={selectedBranch?.manager ?? ""}
                  placeholder="Manager name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branchCity">City</Label>
                <Input
                  id="branchCity"
                  defaultValue={selectedBranch?.city ?? ""}
                  placeholder="Quezon City"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branchStatus">Status</Label>
                <Input
                  id="branchStatus"
                  defaultValue={selectedBranch?.status ?? "Active"}
                  placeholder="Active"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="branchAddress">Address</Label>
                <Textarea
                  id="branchAddress"
                  defaultValue={selectedBranch?.address ?? ""}
                  placeholder="Complete branch address"
                />
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Operations Notes
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="warehouseCode">Warehouse Code</Label>
                  <Input id="warehouseCode" placeholder="WH-MNL-01" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="branchEmail">Branch Email</Label>
                  <Input id="branchEmail" placeholder="manila@chezcar.com" />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="branchNotes">Notes</Label>
                  <Textarea
                    id="branchNotes"
                    placeholder="Operating hours, assignment rules, delivery notes, internal reminders, etc."
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddBranchOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setIsAddBranchOpen(false)}
            >
              {selectedBranch ? "Save Changes" : "Create Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setSelectedBranch(null);
        }}
      >
        <SheetContent
          side="right"
          className="
            !w-[100vw]
            !max-w-[100vw]
            sm:!max-w-[95vw]
            lg:!max-w-[88vw]
            xl:!max-w-[80vw]
            2xl:!max-w-[72vw]
            h-screen
            overflow-hidden
            p-0
          "
        >
          <div className="flex h-full flex-col bg-slate-50">
            <SheetHeader className="shrink-0 border-b bg-white px-6 py-5 text-left">
              <SheetTitle className="text-xl font-bold text-slate-900">
                {selectedBranch?.name ?? "Branch Details"}
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-500">
                View branch profile, manager details, and operational summary.
              </SheetDescription>
            </SheetHeader>

            {selectedBranch && (
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="rounded-2xl border-slate-200 shadow-sm">
                      <CardContent className="p-5">
                        <p className="text-sm text-slate-500">
                          Total Customers
                        </p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                          {selectedBranch.totalCustomers ?? 0}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 shadow-sm">
                      <CardContent className="p-5">
                        <p className="text-sm text-slate-500">Products</p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                          {selectedBranch.totalProducts ?? 0}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 shadow-sm">
                      <CardContent className="p-5">
                        <p className="text-sm text-slate-500">
                          Inventory Items
                        </p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                          {selectedBranch.totalInventoryItems ?? 0}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="space-y-6">
                      <Card className="rounded-2xl border-slate-200 shadow-sm">
                        <CardContent className="grid gap-4 p-5">
                          <div>
                            <p className="text-sm text-slate-500">Branch ID</p>
                            <p className="font-medium text-slate-900">
                              {selectedBranch.id}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">Code</p>
                            <p className="font-medium text-slate-900">
                              {selectedBranch.code}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">Manager</p>
                            <p className="font-medium text-slate-900">
                              {selectedBranch.manager || "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">Contact</p>
                            <p className="font-medium text-slate-900">
                              {selectedBranch.contactNumber || "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">City</p>
                            <p className="font-medium text-slate-900">
                              {selectedBranch.city || "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">Status</p>
                            <Badge
                              className={getStatusBadgeClass(
                                selectedBranch.status,
                              )}
                            >
                              {selectedBranch.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="min-w-0">
                      <Card className="rounded-2xl border-slate-200 shadow-sm">
                        <CardContent className="space-y-5 p-5">
                          <div>
                            <p className="text-sm text-slate-500">Address</p>
                            <p className="mt-1 font-medium text-slate-900">
                              {selectedBranch.address}
                            </p>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 p-4">
                              <p className="text-sm text-slate-500">
                                Assigned Customers
                              </p>
                              <p className="mt-2 text-2xl font-bold text-slate-900">
                                {selectedBranch.totalCustomers ?? 0}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-slate-200 p-4">
                              <p className="text-sm text-slate-500">
                                Tracked Products
                              </p>
                              <p className="mt-2 text-2xl font-bold text-slate-900">
                                {selectedBranch.totalProducts ?? 0}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 p-4">
                            <p className="text-sm font-semibold text-slate-900">
                              Branch Notes
                            </p>
                            <p className="mt-3 text-sm leading-6 text-slate-500">
                              This branch is used for daily sales, customer
                              orders, inventory monitoring, and stock transfers.
                              You can later extend this sheet to include
                              employees, schedules, stock movement history, and
                              branch-specific reports.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
