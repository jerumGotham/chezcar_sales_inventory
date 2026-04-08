"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";
import { ChevronLeft, ChevronRight, Loader2, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
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
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

type SelectOption = {
  value: string;
  label: string;
};

type PermissionAction = {
  key: string;
  label: string;
};

type PermissionModule = {
  key: string;
  label: string;
  type: "simple" | "actions";
  actions?: PermissionAction[];
};

type RoleItem = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  branch: string;
  status: "Active" | "Inactive";
  lastLogin?: string;
};

type UsersApiResponse = {
  data: UserRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    totalRoles: number;
  };
};

const PERMISSION_MODULES: PermissionModule[] = [
  { key: "dashboard", label: "Dashboard", type: "simple" },
  {
    key: "customers",
    label: "Customers",
    type: "actions",
    actions: [
      { key: "add", label: "Add" },
      { key: "view", label: "View" },
      { key: "edit", label: "Edit" },
      { key: "delete", label: "Delete" },
    ],
  },
  {
    key: "products",
    label: "Products",
    type: "actions",
    actions: [
      { key: "add", label: "Add" },
      { key: "view", label: "View" },
      { key: "edit", label: "Edit" },
      { key: "delete", label: "Delete" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    type: "actions",
    actions: [
      { key: "receive_stock", label: "Receive Stock" },
      { key: "transfer_to_branch", label: "Transfer to Branch" },
      { key: "adjust_stock", label: "Adjust Stock" },
      { key: "stock_card", label: "Stock Card" },
      { key: "availability", label: "Availability" },
    ],
  },
  {
    key: "customer_orders",
    label: "Customer Orders",
    type: "actions",
    actions: [
      { key: "create", label: "Create" },
      { key: "view_edit", label: "View / Edit" },
      { key: "downpayment", label: "Downpayment" },
      { key: "release", label: "Release" },
    ],
  },
  {
    key: "job_orders",
    label: "Job Orders",
    type: "actions",
    actions: [
      { key: "create", label: "Create" },
      { key: "view", label: "View" },
      { key: "update", label: "Update" },
      { key: "completed", label: "Completed" },
    ],
  },
  {
    key: "stock_transfers",
    label: "Stock Transfers",
    type: "actions",
    actions: [
      { key: "request", label: "Create Transfer Request" },
      { key: "approval_receiving", label: "Approval / Receiving" },
      { key: "view", label: "View" },
      { key: "edit", label: "Edit" },
    ],
  },
  { key: "reports", label: "Reports", type: "simple" },
  { key: "notifications", label: "Notifications", type: "simple" },
  {
    key: "branches",
    label: "Branches",
    type: "actions",
    actions: [
      { key: "add", label: "Add" },
      { key: "view", label: "View" },
      { key: "edit", label: "Edit" },
      { key: "delete", label: "Delete" },
    ],
  },
  {
    key: "users",
    label: "Users",
    type: "actions",
    actions: [
      { key: "manage_role", label: "Manage Role" },
      { key: "add_user", label: "Add User" },
      { key: "edit", label: "Edit User Details" },
      { key: "view_permission", label: "View Permission" },
    ],
  },
  { key: "settings", label: "Settings", type: "simple" },
];

const BRANCH_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Branches" },
  { value: "All Branches", label: "All Branches" },
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Status" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

const ROLE_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Roles" },
  { value: "Super Admin", label: "Super Admin" },
  { value: "Admin", label: "Admin" },
  { value: "Branch Manager", label: "Branch Manager" },
  { value: "Cashier", label: "Cashier" },
  { value: "Inventory Staff", label: "Inventory Staff" },
];

const getPermissionKeysForModule = (module: PermissionModule) => {
  if (module.type === "simple") return [module.key];
  return (module.actions ?? []).map((action) => `${module.key}.${action.key}`);
};

const getAllPermissionKeys = () =>
  PERMISSION_MODULES.flatMap((module) => getPermissionKeysForModule(module));

const countGrantedModules = (permissions: string[]) => {
  return PERMISSION_MODULES.filter((module) => {
    const keys = getPermissionKeysForModule(module);
    return keys.some((key) => permissions.includes(key));
  }).length;
};

const MOCK_ROLES: RoleItem[] = [
  {
    id: "ROLE-1",
    name: "Super Admin",
    description: "Full access across all modules and branches.",
    permissions: getAllPermissionKeys(),
  },
  {
    id: "ROLE-2",
    name: "Admin",
    description: "Operational access except critical system setup.",
    permissions: [
      "dashboard",
      "customers.add",
      "customers.view",
      "customers.edit",
      "customers.delete",
      "products.add",
      "products.view",
      "products.edit",
      "products.delete",
      "inventory.receive_stock",
      "inventory.transfer_to_branch",
      "inventory.adjust_stock",
      "inventory.stock_card",
      "inventory.availability",
      "customer_orders.create",
      "customer_orders.view_edit",
      "customer_orders.downpayment",
      "customer_orders.release",
      "job_orders.create",
      "job_orders.view",
      "job_orders.update",
      "job_orders.completed",
      "stock_transfers.request",
      "stock_transfers.approval_receiving",
      "stock_transfers.view",
      "stock_transfers.edit",
      "reports",
      "notifications",
      "branches.add",
      "branches.view",
      "branches.edit",
      "branches.delete",
      "users.manage_role",
      "users.add_user",
      "users.edit",
      "users.view_permission",
      "settings",
    ],
  },
  {
    id: "ROLE-3",
    name: "Branch Manager",
    description: "Branch-level operational access and monitoring.",
    permissions: [
      "dashboard",
      "customers.add",
      "customers.view",
      "customers.edit",
      "products.view",
      "inventory.receive_stock",
      "inventory.transfer_to_branch",
      "inventory.stock_card",
      "inventory.availability",
      "customer_orders.create",
      "customer_orders.view_edit",
      "customer_orders.downpayment",
      "customer_orders.release",
      "job_orders.create",
      "job_orders.view",
      "job_orders.update",
      "job_orders.completed",
      "stock_transfers.request",
      "stock_transfers.approval_receiving",
      "stock_transfers.view",
      "reports",
      "notifications",
      "branches.view",
      "users.view_permission",
    ],
  },
  {
    id: "ROLE-4",
    name: "Cashier",
    description: "Handles customer orders and sales-related work.",
    permissions: [
      "dashboard",
      "customers.add",
      "customers.view",
      "customer_orders.create",
      "customer_orders.view_edit",
      "customer_orders.downpayment",
      "customer_orders.release",
      "notifications",
    ],
  },
  {
    id: "ROLE-5",
    name: "Inventory Staff",
    description: "Manages inventory and stock transfers.",
    permissions: [
      "dashboard",
      "products.view",
      "inventory.receive_stock",
      "inventory.transfer_to_branch",
      "inventory.adjust_stock",
      "inventory.stock_card",
      "inventory.availability",
      "stock_transfers.request",
      "stock_transfers.view",
      "notifications",
    ],
  },
];

const MOCK_USERS: UserRow[] = [
  {
    id: "USR-1001",
    name: "Owner Account",
    email: "owner@chezcar.local",
    role: "Super Admin",
    branch: "All Branches",
    status: "Active",
    lastLogin: "2026-04-08 08:15 AM",
  },
  {
    id: "USR-1002",
    name: "QC Manager",
    email: "qc.manager@chezcar.local",
    role: "Branch Manager",
    branch: "QC Main",
    status: "Active",
    lastLogin: "2026-04-07 06:20 PM",
  },
  {
    id: "USR-1003",
    name: "Inventory Admin",
    email: "inventory@chezcar.local",
    role: "Admin",
    branch: "QC Main",
    status: "Active",
    lastLogin: "2026-04-07 04:10 PM",
  },
  {
    id: "USR-1004",
    name: "Makati Cashier",
    email: "makati.cashier@chezcar.local",
    role: "Cashier",
    branch: "Makati",
    status: "Active",
    lastLogin: "2026-04-07 01:45 PM",
  },
  {
    id: "USR-1005",
    name: "Pasig Inventory",
    email: "pasig.inventory@chezcar.local",
    role: "Inventory Staff",
    branch: "Pasig",
    status: "Inactive",
    lastLogin: "2026-04-05 10:32 AM",
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

function getStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "active") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  if (normalized === "inactive") {
    return "border border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50";
}

function getRolePermissions(roleName: string, roles: RoleItem[]) {
  return roles.find((role) => role.name === roleName)?.permissions ?? [];
}

async function mockFetchUsers(params: {
  page: number;
  pageSize: number;
  search: string;
  branch: string;
  role: string;
  status: string;
}): Promise<UsersApiResponse> {
  const { page, pageSize, search, branch, role, status } = params;

  await new Promise((resolve) => setTimeout(resolve, 300));

  let filtered = [...MOCK_USERS];

  if (search.trim()) {
    const keyword = search.trim().toLowerCase();
    filtered = filtered.filter(
      (user) =>
        user.name.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword) ||
        user.id.toLowerCase().includes(keyword),
    );
  }

  if (branch !== "all") {
    filtered = filtered.filter((user) => user.branch === branch);
  }

  if (role !== "all") {
    filtered = filtered.filter((user) => user.role === role);
  }

  if (status !== "all") {
    filtered = filtered.filter((user) => user.status === status);
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
      totalUsers: MOCK_USERS.length,
      activeUsers: MOCK_USERS.filter((item) => item.status === "Active").length,
      inactiveUsers: MOCK_USERS.filter((item) => item.status === "Inactive")
        .length,
      totalRoles: MOCK_ROLES.length,
    },
  };
}

type RolePermissionEditorProps = {
  permissions: string[];
  onTogglePermission: (permissionKey: string) => void;
  onToggleModule: (module: PermissionModule) => void;
  title?: string;
};

function RolePermissionEditor({
  permissions,
  onTogglePermission,
  onToggleModule,
  title = "Permissions",
}: RolePermissionEditorProps) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>

      <div className="space-y-4">
        {PERMISSION_MODULES.map((module) => {
          const modulePermissionKeys = getPermissionKeysForModule(module);
          const checkedCount = modulePermissionKeys.filter((key) =>
            permissions.includes(key),
          ).length;
          const isModuleChecked = checkedCount === modulePermissionKeys.length;
          const isModulePartial =
            checkedCount > 0 && checkedCount < modulePermissionKeys.length;

          return (
            <div
              key={module.key}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="font-medium text-slate-900">{module.label}</h4>
                  <p className="text-xs text-slate-500">
                    {module.type === "simple"
                      ? "Single access permission"
                      : `${checkedCount}/${modulePermissionKeys.length} permissions selected`}
                  </p>
                </div>

                <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <Checkbox
                    checked={isModuleChecked || isModulePartial}
                    onCheckedChange={() => onToggleModule(module)}
                  />
                  <span className="text-sm font-medium text-slate-700">
                    {module.type === "simple" ? "Allow Access" : "Select All"}
                  </span>
                </label>
              </div>

              {module.type === "actions" && module.actions?.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {module.actions.map((action) => {
                    const permissionKey = `${module.key}.${action.key}`;
                    const checked = permissions.includes(permissionKey);

                    return (
                      <label
                        key={permissionKey}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition ${
                          checked
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            onTogglePermission(permissionKey)
                          }
                        />
                        <span className="text-sm text-slate-700">
                          {action.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  This module uses a single checkbox permission.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type RolePermissionViewerProps = {
  roleName: string;
  roles: RoleItem[];
};

function RolePermissionViewer({ roleName, roles }: RolePermissionViewerProps) {
  const permissions = getRolePermissions(roleName, roles);

  return (
    <div className="space-y-4">
      {PERMISSION_MODULES.map((module) => {
        const modulePermissionKeys = getPermissionKeysForModule(module);
        const grantedKeys = modulePermissionKeys.filter((key) =>
          permissions.includes(key),
        );
        const hasAccess = grantedKeys.length > 0;

        return (
          <Card key={module.key}>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {module.label}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {module.type === "simple"
                      ? hasAccess
                        ? "Access granted"
                        : "No access"
                      : `${grantedKeys.length}/${modulePermissionKeys.length} permissions granted`}
                  </p>
                </div>

                <Badge
                  className={
                    hasAccess
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                      : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50"
                  }
                >
                  {hasAccess ? "Allowed" : "Not Allowed"}
                </Badge>
              </div>

              {module.type === "actions" && module.actions?.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {module.actions.map((action) => {
                    const permissionKey = `${module.key}.${action.key}`;
                    const allowed = permissions.includes(permissionKey);

                    return (
                      <div
                        key={permissionKey}
                        className={`rounded-xl border px-4 py-3 ${
                          allowed
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <p
                          className={`text-sm font-medium ${
                            allowed ? "text-emerald-700" : "text-slate-500"
                          }`}
                        >
                          {action.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    hasAccess
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  Single access permission
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function togglePermissionState(
  currentPermissions: string[],
  permissionKey: string,
  setter: Dispatch<SetStateAction<string[]>>,
) {
  setter(
    currentPermissions.includes(permissionKey)
      ? currentPermissions.filter((item) => item !== permissionKey)
      : [...currentPermissions, permissionKey],
  );
}

function toggleModulePermissionState(
  currentPermissions: string[],
  module: PermissionModule,
  setter: Dispatch<SetStateAction<string[]>>,
) {
  const modulePermissionKeys = getPermissionKeysForModule(module);
  const allSelected = modulePermissionKeys.every((key) =>
    currentPermissions.includes(key),
  );

  if (allSelected) {
    setter(
      currentPermissions.filter((key) => !modulePermissionKeys.includes(key)),
    );
    return;
  }

  setter(Array.from(new Set([...currentPermissions, ...modulePermissionKeys])));
}

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState<SelectOption>(BRANCH_OPTIONS[0]);
  const [role, setRole] = useState<SelectOption>(ROLE_OPTIONS[0]);
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);

  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedBranch, setAppliedBranch] = useState("all");
  const [appliedRole, setAppliedRole] = useState("all");
  const [appliedStatus, setAppliedStatus] = useState("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [roles, setRoles] = useState<RoleItem[]>(MOCK_ROLES);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);

  const [userFormName, setUserFormName] = useState("");
  const [userFormEmail, setUserFormEmail] = useState("");
  const [userFormBranch, setUserFormBranch] = useState<SelectOption>(
    BRANCH_OPTIONS[2],
  );
  const [userFormStatus, setUserFormStatus] = useState<SelectOption>(
    STATUS_OPTIONS[1],
  );
  const [userFormRole, setUserFormRole] = useState<SelectOption>({
    value: "Admin",
    label: "Admin",
  });

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);

  const [selectedManageRole, setSelectedManageRole] =
    useState<SelectOption | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = useState("");
  const [editingRoleDescription, setEditingRoleDescription] = useState("");
  const [editingRolePermissions, setEditingRolePermissions] = useState<
    string[]
  >([]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "users",
      {
        page,
        pageSize,
        search: appliedSearch,
        branch: appliedBranch,
        role: appliedRole,
        status: appliedStatus,
      },
    ],
    queryFn: () =>
      mockFetchUsers({
        page,
        pageSize,
        search: appliedSearch,
        branch: appliedBranch,
        role: appliedRole,
        status: appliedStatus,
      }),
    placeholderData: (previousData) => previousData,
  });

  const roleSelectOptions = useMemo<SelectOption[]>(
    () => roles.map((item) => ({ value: item.name, label: item.name })),
    [roles],
  );

  const selectedManageRoleItem = useMemo(
    () => roles.find((item) => item.id === editingRoleId) ?? null,
    [roles, editingRoleId],
  );

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  };
  const summary = data?.summary ?? {
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    totalRoles: 0,
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
    setAppliedSearch(search);
    setAppliedBranch(branch.value);
    setAppliedRole(role.value);
    setAppliedStatus(status.value);
  };

  const handleResetFilters = () => {
    setSearch("");
    setBranch(BRANCH_OPTIONS[0]);
    setRole(ROLE_OPTIONS[0]);
    setStatus(STATUS_OPTIONS[0]);

    setAppliedSearch("");
    setAppliedBranch("all");
    setAppliedRole("all");
    setAppliedStatus("all");
    setPage(1);
  };

  const handleOpenAddUser = () => {
    setSelectedUser(null);
    setUserFormName("");
    setUserFormEmail("");
    setUserFormBranch(BRANCH_OPTIONS[2]);
    setUserFormStatus(STATUS_OPTIONS[1]);
    setUserFormRole({ value: "Admin", label: "Admin" });
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (user: UserRow) => {
    setSelectedUser(user);
    setUserFormName(user.name);
    setUserFormEmail(user.email);
    setUserFormBranch({
      value: user.branch,
      label: user.branch,
    });
    setUserFormStatus({
      value: user.status,
      label: user.status,
    });
    setUserFormRole({
      value: user.role,
      label: user.role,
    });
    setIsUserModalOpen(true);
  };

  const handleAddRole = () => {
    if (!newRoleName.trim()) return;

    const newRole: RoleItem = {
      id: `ROLE-${roles.length + 1}`,
      name: newRoleName.trim(),
      description: newRoleDescription.trim() || "Custom role",
      permissions: newRolePermissions,
    };

    setRoles((prev) => [...prev, newRole]);
    setSelectedManageRole({ value: newRole.name, label: newRole.name });
    setEditingRoleId(newRole.id);
    setEditingRoleName(newRole.name);
    setEditingRoleDescription(newRole.description);
    setEditingRolePermissions(newRole.permissions);

    setNewRoleName("");
    setNewRoleDescription("");
    setNewRolePermissions([]);
  };

  const handleSelectManageRole = (option: SelectOption | null) => {
    setSelectedManageRole(option);

    if (!option) {
      setEditingRoleId(null);
      setEditingRoleName("");
      setEditingRoleDescription("");
      setEditingRolePermissions([]);
      return;
    }

    const roleItem = roles.find((item) => item.name === option.value);
    if (!roleItem) return;

    setEditingRoleId(roleItem.id);
    setEditingRoleName(roleItem.name);
    setEditingRoleDescription(roleItem.description);
    setEditingRolePermissions(roleItem.permissions);
  };

  const handleCancelEditRole = () => {
    if (!selectedManageRole) {
      setEditingRoleId(null);
      setEditingRoleName("");
      setEditingRoleDescription("");
      setEditingRolePermissions([]);
      return;
    }

    const roleItem = roles.find(
      (item) => item.name === selectedManageRole.value,
    );
    if (!roleItem) return;

    setEditingRoleId(roleItem.id);
    setEditingRoleName(roleItem.name);
    setEditingRoleDescription(roleItem.description);
    setEditingRolePermissions(roleItem.permissions);
  };

  const handleSaveEditRole = () => {
    if (!editingRoleId || !editingRoleName.trim()) return;

    const oldRole = roles.find((role) => role.id === editingRoleId);
    if (!oldRole) return;

    const updatedName = editingRoleName.trim();

    setRoles((prev) =>
      prev.map((role) =>
        role.id === editingRoleId
          ? {
              ...role,
              name: updatedName,
              description: editingRoleDescription.trim() || "Custom role",
              permissions: editingRolePermissions,
            }
          : role,
      ),
    );

    if (selectedUser?.role === oldRole.name) {
      setSelectedUser({
        ...selectedUser,
        role: updatedName,
      });
    }

    if (userFormRole.value === oldRole.name) {
      setUserFormRole({
        value: updatedName,
        label: updatedName,
      });
    }

    setSelectedManageRole({
      value: updatedName,
      label: updatedName,
    });
  };

  const toggleNewRolePermission = (permissionKey: string) => {
    togglePermissionState(
      newRolePermissions,
      permissionKey,
      setNewRolePermissions,
    );
  };

  const toggleNewRoleModule = (module: PermissionModule) => {
    toggleModulePermissionState(
      newRolePermissions,
      module,
      setNewRolePermissions,
    );
  };

  const toggleEditingRolePermission = (permissionKey: string) => {
    togglePermissionState(
      editingRolePermissions,
      permissionKey,
      setEditingRolePermissions,
    );
  };

  const toggleEditingRoleModule = (module: PermissionModule) => {
    toggleModulePermissionState(
      editingRolePermissions,
      module,
      setEditingRolePermissions,
    );
  };

  return (
    <>
      <PageShell
        title="Users & Roles"
        subtitle="Manage user accounts, branch assignment, and role-based permissions across your system."
        actions={
          <>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleOpenAddUser}
            >
              Add User
            </Button>
            <Button variant="outline">
              <Link href="/users/roles">Manage Roles</Link>
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Total Users</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.totalUsers}
              </h3>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Active Users</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.activeUsers}
              </h3>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Inactive Users</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.inactiveUsers}
              </h3>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Roles</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {summary.totalRoles}
              </h3>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
            <Input
              placeholder="Search name, email, or user ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Select
              instanceId="branch-filter"
              options={BRANCH_OPTIONS}
              value={branch}
              onChange={(option) => setBranch(option ?? BRANCH_OPTIONS[0])}
              isSearchable
              placeholder="Select branch"
              styles={reactSelectStyles}
            />

            <Select
              instanceId="role-filter"
              options={ROLE_OPTIONS}
              value={role}
              onChange={(option) => setRole(option ?? ROLE_OPTIONS[0])}
              isSearchable
              placeholder="Select role"
              styles={reactSelectStyles}
            />

            <Select
              instanceId="status-filter"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(option) => setStatus(option ?? STATUS_OPTIONS[0])}
              isSearchable
              placeholder="Select status"
              styles={reactSelectStyles}
            />

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
                  User List
                </h3>
                <p className="text-sm text-slate-500">
                  Showing {showingFrom} to {showingTo} of {meta.total} users
                  {isFetching && !isLoading ? " • Updating..." : ""}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead className="bg-slate-50">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      User ID
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Name
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Email
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Role
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Branch
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Last Login
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Permissions
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
                          Loading users...
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-5 py-16 text-center text-slate-500"
                      >
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((user) => {
                      const rolePermissions = getRolePermissions(
                        user.role,
                        roles,
                      );

                      return (
                        <tr
                          key={user.id}
                          className="border-b transition-colors hover:bg-slate-50"
                        >
                          <td className="px-5 py-4 text-sm font-medium text-slate-700">
                            {user.id}
                          </td>
                          <td className="px-5 py-4 text-sm text-foreground">
                            {user.name}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">
                            {user.email}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">
                            {user.role}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">
                            {user.branch}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            <Badge className={getStatusBadgeClass(user.status)}>
                              {user.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">
                            {user.lastLogin ?? "-"}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">
                            {countGrantedModules(rolePermissions)} modules
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                onClick={() => handleOpenEditUser(user)}
                              >
                                Edit User
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setIsPermissionsOpen(true);
                                }}
                              >
                                View Permissions
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
        open={isUserModalOpen}
        onOpenChange={(open) => {
          setIsUserModalOpen(open);
          if (!open) setSelectedUser(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedUser ? "Edit User" : "Add User"}</DialogTitle>
            <DialogDescription>
              Assign a role first. The permission preview updates automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={userFormName}
                  onChange={(e) => setUserFormName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  value={userFormEmail}
                  onChange={(e) => setUserFormEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Assigned Branch</Label>
                <Select
                  instanceId="user-branch"
                  options={BRANCH_OPTIONS.filter(
                    (item) => item.value !== "all",
                  )}
                  value={userFormBranch}
                  onChange={(option) =>
                    setUserFormBranch(option ?? BRANCH_OPTIONS[2])
                  }
                  isSearchable
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  instanceId="user-status"
                  options={STATUS_OPTIONS.filter(
                    (item) => item.value !== "all",
                  )}
                  value={userFormStatus}
                  onChange={(option) =>
                    setUserFormStatus(option ?? STATUS_OPTIONS[1])
                  }
                  isSearchable={false}
                  styles={reactSelectStyles}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assigned Role</Label>
              <Select
                instanceId="user-role"
                options={roleSelectOptions}
                value={userFormRole}
                onChange={(option) =>
                  setUserFormRole(option ?? { value: "Admin", label: "Admin" })
                }
                isSearchable
                placeholder="Select role"
                styles={reactSelectStyles}
              />
            </div>

            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-5">
                <h3 className="mb-2 font-semibold text-slate-900">
                  Role Permissions Preview
                </h3>
                <p className="mb-4 text-sm text-slate-500">
                  Selected role:{" "}
                  <span className="font-medium">{userFormRole.label}</span>
                </p>
                <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700">
                  {countGrantedModules(
                    getRolePermissions(userFormRole.value, roles),
                  )}{" "}
                  modules enabled
                </div>
              </CardContent>
            </Card>

            <RolePermissionViewer roleName={userFormRole.value} roles={roles} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setIsUserModalOpen(false)}
            >
              {selectedUser ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={isPermissionsOpen}
        onOpenChange={(open) => {
          setIsPermissionsOpen(open);
          if (!open) setSelectedUser(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader className="border-b pb-4 text-left">
            <SheetTitle>{selectedUser?.name ?? "User"} Permissions</SheetTitle>
            <SheetDescription>
              Read-only permission view based on the user’s assigned role.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <Card>
              <CardContent className="grid gap-4 p-5 md:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="font-medium text-slate-900">
                    {selectedUser?.email ?? "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-500">Role</p>
                  <p className="font-medium text-slate-900">
                    {selectedUser?.role ?? "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-500">Branch</p>
                  <p className="font-medium text-slate-900">
                    {selectedUser?.branch ?? "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-500">Status</p>
                  <p className="font-medium text-slate-900">
                    {selectedUser?.status ?? "-"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {selectedUser && (
              <RolePermissionViewer
                roleName={selectedUser.role}
                roles={roles}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={isRolesModalOpen} onOpenChange={setIsRolesModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Manage Roles</DialogTitle>
            <DialogDescription>
              Select a role from the dropdown, then edit its permissions below.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h3 className="font-semibold text-slate-900">Add Role</h3>
                    <p className="text-sm text-slate-500">
                      Create a new role template.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="roleName">Role Name</Label>
                    <Input
                      id="roleName"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="e.g. Branch Cashier"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="roleDescription">Description</Label>
                    <Input
                      id="roleDescription"
                      value={newRoleDescription}
                      onChange={(e) => setNewRoleDescription(e.target.value)}
                      placeholder="Role description"
                    />
                  </div>

                  <Button
                    className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={handleAddRole}
                  >
                    Add Role
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      New Role Permissions
                    </h3>
                    <p className="text-sm text-slate-500">
                      Set permissions for the new role before adding it.
                    </p>
                  </div>

                  <RolePermissionEditor
                    permissions={newRolePermissions}
                    onTogglePermission={toggleNewRolePermission}
                    onToggleModule={toggleNewRoleModule}
                    title="New Role Permissions"
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Select Role</Label>
                      <Select
                        instanceId="manage-role-select"
                        options={roleSelectOptions}
                        value={selectedManageRole}
                        onChange={handleSelectManageRole}
                        isSearchable
                        placeholder="Choose a role"
                        styles={reactSelectStyles}
                      />
                    </div>

                    {selectedManageRoleItem && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Selected
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {selectedManageRoleItem.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {countGrantedModules(
                            selectedManageRoleItem.permissions,
                          )}{" "}
                          modules enabled
                        </p>
                      </div>
                    )}
                  </div>

                  {editingRoleId ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="editRoleName">Role Name</Label>
                          <Input
                            id="editRoleName"
                            value={editingRoleName}
                            onChange={(e) => setEditingRoleName(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="editRoleDescription">
                            Description
                          </Label>
                          <Input
                            id="editRoleDescription"
                            value={editingRoleDescription}
                            onChange={(e) =>
                              setEditingRoleDescription(e.target.value)
                            }
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={handleSaveEditRole}
                        >
                          Save Role
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleCancelEditRole}
                        >
                          Reset Changes
                        </Button>
                      </div>

                      <RolePermissionEditor
                        permissions={editingRolePermissions}
                        onTogglePermission={toggleEditingRolePermission}
                        onToggleModule={toggleEditingRoleModule}
                        title={`Editing ${editingRoleName || "Role"} Permissions`}
                      />
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-slate-500">
                      Select a role first to view and edit permissions.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRolesModalOpen(false);
                setSelectedManageRole(null);
                setEditingRoleId(null);
                setEditingRoleName("");
                setEditingRoleDescription("");
                setEditingRolePermissions([]);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
