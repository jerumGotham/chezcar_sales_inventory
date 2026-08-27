"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";
import type { StylesConfig } from "react-select";

import { PageShell } from "@/components/page-shell";
import { useShellAccess } from "@/components/shell-access-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import CustomerHistoryTabs from "./CustomerHistoryTabs";

type CustomerRow = {
  id: string;
  name: string;
  mobile: string;
  city: string;
  status: string;
  lastTransaction: string;
  email?: string;
  branch?: string;
  totalSpend?: number | string;
  vehicle?: string;
  pendingOrders?: number;
  activeJobOrders?: number;
  source?: string | null;
  notes?: string | null;
};

type CustomerFormState = {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  address: string;
  source: string;
  notes: string;
};

const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  firstName: "",
  lastName: "",
  mobile: "",
  email: "",
  address: "",
  source: "",
  notes: "",
};

type CustomersApiResponse = {
  data: CustomerRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalCustomers: number;
    activeCustomers: number;
    customersWithPendingOrders: number;
    activeJobOrders: number;
  };
};

type SelectOption = {
  value: string;
  label: string;
};

const BRANCH_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Branches" },
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const MOCK_CUSTOMERS: CustomerRow[] = [
  {
    id: "CUST-1001",
    name: "Mark Reyes",
    mobile: "0917-111-2233",
    city: "Quezon City",
    status: "Active",
    lastTransaction: "2026-03-29",
    email: "mark.reyes@gmail.com",
    branch: "QC Main",
    totalSpend: "₱18,500",
    vehicle: "Toyota Rush 2022",
    pendingOrders: 1,
    activeJobOrders: 0,
  },
  {
    id: "CUST-1002",
    name: "Paolo Santos",
    mobile: "0918-210-4412",
    city: "Makati",
    status: "Active",
    lastTransaction: "2026-03-30",
    email: "paolo.santos@gmail.com",
    branch: "Makati",
    totalSpend: "₱42,800",
    vehicle: "Mitsubishi Montero 2021",
    pendingOrders: 0,
    activeJobOrders: 1,
  },
  {
    id: "CUST-1003",
    name: "Gina Lopez",
    mobile: "0922-774-1932",
    city: "Pasig",
    status: "Active",
    lastTransaction: "2026-03-27",
    email: "gina.lopez@gmail.com",
    branch: "Pasig",
    totalSpend: "₱11,200",
    vehicle: "Honda City 2020",
    pendingOrders: 1,
    activeJobOrders: 0,
  },
  {
    id: "CUST-1004",
    name: "Kevin Cruz",
    mobile: "0917-555-1111",
    city: "Quezon City",
    status: "Inactive",
    lastTransaction: "2026-03-21",
    email: "kevin.cruz@gmail.com",
    branch: "QC Main",
    totalSpend: "₱7,200",
    vehicle: "Toyota Vios 2021",
    pendingOrders: 0,
    activeJobOrders: 0,
  },
  {
    id: "CUST-1005",
    name: "Anna Garcia",
    mobile: "0919-101-2020",
    city: "Makati",
    status: "Active",
    lastTransaction: "2026-03-25",
    email: "anna.garcia@gmail.com",
    branch: "Makati",
    totalSpend: "₱65,000",
    vehicle: "Ford Ranger 2023",
    pendingOrders: 0,
    activeJobOrders: 2,
  },
  {
    id: "CUST-1006",
    name: "Leo Mendoza",
    mobile: "0920-888-1000",
    city: "Pasig",
    status: "Active",
    lastTransaction: "2026-03-20",
    email: "leo.mendoza@gmail.com",
    branch: "Pasig",
    totalSpend: "₱23,400",
    vehicle: "Toyota Hilux 2022",
    pendingOrders: 2,
    activeJobOrders: 0,
  },
  {
    id: "CUST-1007",
    name: "Maria Torres",
    mobile: "0917-333-9090",
    city: "Quezon City",
    status: "Active",
    lastTransaction: "2026-03-18",
    email: "maria.torres@gmail.com",
    branch: "QC Main",
    totalSpend: "₱31,900",
    vehicle: "Honda BR-V 2021",
    pendingOrders: 0,
    activeJobOrders: 1,
  },
  {
    id: "CUST-1008",
    name: "John Villanueva",
    mobile: "0916-888-2211",
    city: "Makati",
    status: "Inactive",
    lastTransaction: "2026-03-15",
    email: "john.v@gmail.com",
    branch: "Makati",
    totalSpend: "₱12,000",
    vehicle: "Suzuki Ertiga 2020",
    pendingOrders: 0,
    activeJobOrders: 0,
  },
  {
    id: "CUST-1009",
    name: "Patricia Lim",
    mobile: "0917-990-1212",
    city: "Pasig",
    status: "Active",
    lastTransaction: "2026-03-26",
    email: "patricia.lim@gmail.com",
    branch: "Pasig",
    totalSpend: "₱27,600",
    vehicle: "Nissan Terra 2022",
    pendingOrders: 1,
    activeJobOrders: 0,
  },
  {
    id: "CUST-1010",
    name: "Alden Flores",
    mobile: "0921-110-8877",
    city: "Quezon City",
    status: "Active",
    lastTransaction: "2026-03-24",
    email: "alden.flores@gmail.com",
    branch: "QC Main",
    totalSpend: "₱19,300",
    vehicle: "Toyota Innova 2023",
    pendingOrders: 0,
    activeJobOrders: 1,
  },
  {
    id: "CUST-1011",
    name: "Rose Bautista",
    mobile: "0918-600-4455",
    city: "Makati",
    status: "Active",
    lastTransaction: "2026-03-23",
    email: "rose.bautista@gmail.com",
    branch: "Makati",
    totalSpend: "₱44,900",
    vehicle: "Mazda CX-5 2022",
    pendingOrders: 0,
    activeJobOrders: 0,
  },
  {
    id: "CUST-1012",
    name: "Nico Ramos",
    mobile: "0917-200-3000",
    city: "Pasig",
    status: "Active",
    lastTransaction: "2026-03-19",
    email: "nico.ramos@gmail.com",
    branch: "Pasig",
    totalSpend: "₱15,400",
    vehicle: "Toyota Wigo 2021",
    pendingOrders: 1,
    activeJobOrders: 0,
  },
];

function getCustomerSummaryStatus(customer: CustomerRow) {
  if ((customer.pendingOrders ?? 0) > 0) return "With Pending Order";
  if ((customer.activeJobOrders ?? 0) > 0) return "With Active Job Order";
  return customer.status;
}

function getStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();

  if (
    normalized.includes("active") ||
    normalized.includes("vip") ||
    normalized.includes("ready")
  ) {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  if (
    normalized.includes("pending") ||
    normalized.includes("order") ||
    normalized.includes("job")
  ) {
    return "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  }

  if (normalized.includes("inactive") || normalized.includes("overdue")) {
    return "border border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50";
}

function parsePeso(value?: string) {
  if (!value) return 0;
  return Number(value.replace(/[₱,]/g, "")) || 0;
}

async function mockFetchCustomers(params: {
  page: number;
  pageSize: number;
  name: string;
  branch: string;
  status: string;
}): Promise<CustomersApiResponse> {
  const { page, pageSize, name, branch, status } = params;

  await new Promise((resolve) => setTimeout(resolve, 500));

  let filtered = [...MOCK_CUSTOMERS];

  if (name.trim()) {
    const keyword = name.trim().toLowerCase();
    filtered = filtered.filter(
      (customer) =>
        customer.name.toLowerCase().includes(keyword) ||
        customer.id.toLowerCase().includes(keyword) ||
        (customer.vehicle ?? "").toLowerCase().includes(keyword),
    );
  }

  if (branch !== "all") {
    filtered = filtered.filter((customer) => customer.branch === branch);
  }

  if (status !== "all") {
    filtered = filtered.filter((customer) => {
      const summaryStatus = getCustomerSummaryStatus(customer).toLowerCase();

      if (status === "active")
        return customer.status.toLowerCase() === "active";
      if (status === "inactive")
        return customer.status.toLowerCase() === "inactive";
      if (status === "with-pending-order")
        return summaryStatus === "with pending order";
      if (status === "with-active-job-order")
        return summaryStatus === "with active job order";

      return true;
    });
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const paginated = filtered.slice(startIndex, endIndex);

  const summary = {
    totalCustomers: MOCK_CUSTOMERS.length,
    activeCustomers: MOCK_CUSTOMERS.filter(
      (item) => item.status.toLowerCase() === "active",
    ).length,
    customersWithPendingOrders: MOCK_CUSTOMERS.filter(
      (item) => (item.pendingOrders ?? 0) > 0,
    ).length,
    activeJobOrders: MOCK_CUSTOMERS.filter(
      (item) => (item.activeJobOrders ?? 0) > 0,
    ).length,
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

async function fetchCustomers(params: { page: number; pageSize: number; name: string; status: string }) {
  const searchParams = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize), name: params.name, status: params.status });
  const response = await fetch(`/api/customers?${searchParams}`, { credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Unable to load customers");
  return json.data as CustomersApiResponse;
}

function formatCustomerSpend(value?: number | string) {
  if (typeof value === "number") return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  return value ?? "₱0.00";
}

const reactSelectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: "40px",
    borderRadius: "0.75rem",
    borderColor: state.isFocused ? "#10b981" : "#e2e8f0",
    boxShadow: "none",
    "&:hover": {
      borderColor: "#10b981",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    paddingLeft: "10px",
    paddingRight: "10px",
  }),
  input: (base) => ({
    ...base,
    color: "#0f172a",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#94a3b8",
    fontSize: "14px",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "0.75rem",
    overflow: "hidden",
    zIndex: 50,
  }),
  option: (base, state) => ({
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

export default function CustomersPage() {
  const access = useShellAccess();
  const canManageCustomers = access.identity?.role !== "STOCK_STAFF" && access.identity?.role !== "ACCOUNTING_STAFF";
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);

  const [appliedName, setAppliedName] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(
    null,
  );
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const openCustomerForm = (customer: CustomerRow | null) => {
    setSelectedCustomer(customer);
    setCustomerForm(customer ? {
      firstName: customer.name.split(" ")[0] ?? "",
      lastName: customer.name.split(" ").slice(1).join(" "),
      mobile: customer.mobile ?? "",
      email: customer.email ?? "",
      address: customer.city ?? "",
      source: customer.source ?? "",
      notes: customer.notes ?? "",
    } : EMPTY_CUSTOMER_FORM);
    saveCustomerMutation.reset();
    setIsAddCustomerOpen(true);
  };

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: [
      "customers",
      {
        page,
        pageSize,
        name: appliedName,
         status: appliedStatus,
      },
    ],
    queryFn: () =>
      fetchCustomers({
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
    totalCustomers: 0,
    activeCustomers: 0,
    customersWithPendingOrders: 0,
    activeJobOrders: 0,
  };

  const saveCustomerMutation = useMutation({
    mutationFn: async () => {
      const name = `${customerForm.firstName} ${customerForm.lastName}`.trim();
      if (!name) throw new Error("Customer name is required.");
      const body = { name, mobile: customerForm.mobile.trim(), email: customerForm.email.trim(), address: customerForm.address.trim(), source: customerForm.source.trim(), notes: customerForm.notes.trim() };
      const response = await fetch(selectedCustomer ? `/api/customers/${selectedCustomer.id}` : "/api/customers", {
        method: selectedCustomer ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to save customer");
      return json.data;
    },
    onSuccess: () => {
      setIsAddCustomerOpen(false);
      setSelectedCustomer(null);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/customers/${id}`, { method: "DELETE", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to deactivate customer");
      return json.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

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
        title="Customers"
        subtitle="Manage customer records and review persisted sales and customer orders."
        actions={
          canManageCustomers ? (
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                openCustomerForm(null);
              }}
            >
              Add Customer
            </Button>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Total Customers</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.totalCustomers}
              </h3>
              <p className="mt-2 text-sm text-sky-600">
                Customer master records
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Active Customers</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.activeCustomers}
              </h3>
              <p className="mt-2 text-sm text-emerald-600">
                Customers with recent activity
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">With Pending Orders</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.customersWithPendingOrders}
              </h3>
              <p className="mt-2 text-sm text-amber-600">
                For follow-up and release monitoring
              </p>
            </CardContent>
          </Card>

        </div>

        <Card className="mt-6">
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Input
              placeholder="Search customer name"
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
                  Customer List
                </h3>
                <p className="text-sm text-slate-500">
                  Showing {showingFrom} to {showingTo} of {meta.total} customers
                  {isFetching && !isLoading ? " • Updating..." : ""}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-slate-50">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Customer ID
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Name
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Mobile
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Branch
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      City
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Last Transaction
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total Spend
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
                          Loading customers...
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-16 text-center text-red-600">{(error as Error).message}</td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-5 py-16 text-center text-slate-500"
                      >
                        No customers found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((customer) => (
                      <tr
                        key={customer.id}
                        className="border-b transition-colors hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 text-sm font-medium text-slate-700">
                          {customer.id}
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground">
                          {customer.name}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.mobile}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.branch ?? "-"}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.city}
                        </td>
                        <td className="px-5 py-4 text-sm">
                          <Badge
                            className={getStatusBadgeClass(
                              getCustomerSummaryStatus(customer),
                            )}
                          >
                            {getCustomerSummaryStatus(customer)}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {customer.lastTransaction}
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-700">
                          {formatCustomerSpend(customer.totalSpend)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                              onClick={() => {
                                setSelectedCustomer(customer);
                                setIsDetailsOpen(true);
                              }}
                            >
                              View
                            </Button>

                            {canManageCustomers && <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                              onClick={() => {
                                openCustomerForm(customer);
                               }}
                            >
                              Edit
                            </Button>}

                            {canManageCustomers && <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                                 onClick={() => {
                                   if (window.confirm(`Deactivate ${customer.name}?`)) deleteCustomerMutation.mutate(customer.id);
                                 }}
                              >
                                Delete
                              </Button>
                            </div>}
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
        open={isAddCustomerOpen}
        onOpenChange={(open) => {
          setIsAddCustomerOpen(open);
          if (!open) {
            setSelectedCustomer(null);
            setCustomerForm(EMPTY_CUSTOMER_FORM);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCustomer ? "Edit Customer" : "Add Customer"}
            </DialogTitle>
            <DialogDescription>
              Save customer details used by POS, Customer Orders, and transaction history.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                 <Input id="firstName" value={customerForm.firstName} onChange={(event) => setCustomerForm((current) => ({ ...current, firstName: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                 <Input id="lastName" value={customerForm.lastName} onChange={(event) => setCustomerForm((current) => ({ ...current, lastName: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile Number</Label>
                 <Input id="mobile" value={customerForm.mobile} onChange={(event) => setCustomerForm((current) => ({ ...current, mobile: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                 <Input id="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address</Label>
                 <Input id="address" placeholder="Street, barangay, city" value={customerForm.address} onChange={(event) => setCustomerForm((current) => ({ ...current, address: event.target.value }))} />
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Business Notes
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="source">Source / Referred By</Label>
                  <Input
                    id="source"
                    placeholder="Walk-in / Facebook / Referral"
                     value={customerForm.source}
                     onChange={(event) => setCustomerForm((current) => ({ ...current, source: event.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    placeholder="Customer preferences, reminders, tint shade request, etc."
                     value={customerForm.notes}
                     onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddCustomerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => saveCustomerMutation.mutate()}
              disabled={saveCustomerMutation.isPending}
            >
              {saveCustomerMutation.isPending ? "Saving..." : selectedCustomer ? "Save Changes" : "Create Customer"}
            </Button>
          </DialogFooter>
          {saveCustomerMutation.error ? <p className="text-sm font-medium text-red-600">{(saveCustomerMutation.error as Error).message}</p> : null}
        </DialogContent>
      </Dialog>

      <Sheet
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setSelectedCustomer(null);
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
                {selectedCustomer?.name ?? "Customer Details"}
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-500">
                 View customer profile and transaction history.
              </SheetDescription>
            </SheetHeader>

            {selectedCustomer && (
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="space-y-6">
                  {/* top summary */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="rounded-2xl border-slate-200 shadow-sm">
                      <CardContent className="p-5">
                        <p className="text-sm text-slate-500">Total Spend</p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                          {selectedCustomer.totalSpend ?? "₱0"}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 shadow-sm">
                      <CardContent className="p-5">
                        <p className="text-sm text-slate-500">Pending Orders</p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                          {selectedCustomer.pendingOrders ?? 0}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 shadow-sm">
                      <CardContent className="p-5">
                        <p className="text-sm text-slate-500">
                          Active Job Orders
                        </p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                          {selectedCustomer.activeJobOrders ?? 0}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* content */}
                  <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                    {/* left */}
                    <div className="space-y-6">
                      <Card className="rounded-2xl border-slate-200 shadow-sm">
                        <CardContent className="grid gap-4 p-5">
                          <div>
                            <p className="text-sm text-slate-500">
                              Customer ID
                            </p>
                            <p className="font-medium text-slate-900">
                              {selectedCustomer.id}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">Mobile</p>
                            <p className="font-medium text-slate-900">
                              {selectedCustomer.mobile || "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">Email</p>
                            <p className="font-medium text-slate-900">
                              {selectedCustomer.email || "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">
                              Preferred Branch
                            </p>
                            <p className="font-medium text-slate-900">
                              {selectedCustomer.branch || "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-slate-500">City</p>
                            <p className="font-medium text-slate-900">
                              {selectedCustomer.city || "—"}
                            </p>
                          </div>

                        </CardContent>
                      </Card>
                    </div>

                    {/* right */}
                    <div className="min-w-0">
                      <CustomerHistoryTabs customer={selectedCustomer} />
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
