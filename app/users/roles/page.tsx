"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2, Eye } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

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
    name: "Cashier",
    description: "Handles sales and customer orders.",
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
];

function togglePermission(
  currentPermissions: string[],
  permissionKey: string,
  setPermissions: (value: string[]) => void,
) {
  if (currentPermissions.includes(permissionKey)) {
    setPermissions(currentPermissions.filter((item) => item !== permissionKey));
    return;
  }

  setPermissions([...currentPermissions, permissionKey]);
}

function toggleModule(
  currentPermissions: string[],
  module: PermissionModule,
  setPermissions: (value: string[]) => void,
) {
  const keys = getPermissionKeysForModule(module);
  const allSelected = keys.every((key) => currentPermissions.includes(key));

  if (allSelected) {
    setPermissions(currentPermissions.filter((key) => !keys.includes(key)));
    return;
  }

  setPermissions(Array.from(new Set([...currentPermissions, ...keys])));
}

function PermissionEditor({
  permissions,
  setPermissions,
}: {
  permissions: string[];
  setPermissions: (value: string[]) => void;
}) {
  const allPermissionKeys = getAllPermissionKeys();
  const allChecked = allPermissionKeys.every((key) =>
    permissions.includes(key),
  );
  const someChecked =
    permissions.length > 0 && permissions.length < allPermissionKeys.length;

  const handleToggleAllPermissions = () => {
    if (allChecked) {
      setPermissions([]);
      return;
    }

    setPermissions(allPermissionKeys);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">
              Permission Controls
            </h3>
            <p className="text-sm text-slate-600">
              {permissions.length} of {allPermissionKeys.length} permissions
              selected
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-2">
              <Checkbox
                checked={allChecked}
                indeterminate={someChecked}
                onCheckedChange={handleToggleAllPermissions}
              />
              <span className="text-sm font-medium text-slate-700">
                Check All Permissions
              </span>
            </label>

            <Button
              type="button"
              variant="outline"
              onClick={() => setPermissions([])}
            >
              Clear All
            </Button>
          </div>
        </div>
      </div>

      {PERMISSION_MODULES.map((module) => {
        const moduleKeys = getPermissionKeysForModule(module);
        const checkedCount = moduleKeys.filter((key) =>
          permissions.includes(key),
        ).length;
        const isChecked = checkedCount === moduleKeys.length;
        const isPartial = checkedCount > 0 && checkedCount < moduleKeys.length;

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
                    : `${checkedCount}/${moduleKeys.length} permissions selected`}
                </p>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <Checkbox
                  checked={isChecked}
                  indeterminate={isPartial}
                  onCheckedChange={() =>
                    toggleModule(permissions, module, setPermissions)
                  }
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
                          togglePermission(
                            permissions,
                            permissionKey,
                            setPermissions,
                          )
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
  );
}

function PermissionViewer({ permissions }: { permissions: string[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Permission Summary</h3>
            <p className="text-sm text-slate-600">
              {permissions.length} total permissions enabled
            </p>
          </div>

          <Badge className="border border-emerald-200 bg-white text-emerald-700 hover:bg-white">
            {countGrantedModules(permissions)} modules enabled
          </Badge>
        </div>
      </div>

      {PERMISSION_MODULES.map((module) => {
        const moduleKeys = getPermissionKeysForModule(module);
        const grantedKeys = moduleKeys.filter((key) =>
          permissions.includes(key),
        );
        const hasAccess = grantedKeys.length > 0;

        return (
          <Card key={module.key}>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {module.label}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {module.type === "simple"
                      ? hasAccess
                        ? "Access granted"
                        : "No access"
                      : `${grantedKeys.length}/${moduleKeys.length} permissions granted`}
                  </p>
                </div>

                <Badge
                  className={
                    hasAccess
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-slate-200 bg-slate-50 text-slate-600"
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

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>(MOCK_ROLES);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);

  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);

  const totals = useMemo(
    () => ({
      totalRoles: roles.length,
      totalPermissions: roles.reduce(
        (sum, role) => sum + role.permissions.length,
        0,
      ),
    }),
    [roles],
  );

  const resetForm = () => {
    setRoleName("");
    setRoleDescription("");
    setRolePermissions([]);
  };

  const handleOpenAdd = () => {
    resetForm();
    setSelectedRole(null);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (role: RoleItem) => {
    setSelectedRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description);
    setRolePermissions(role.permissions);
    setIsEditOpen(true);
  };

  const handleOpenView = (role: RoleItem) => {
    setSelectedRole(role);
    setIsViewOpen(true);
  };

  const handleOpenDelete = (role: RoleItem) => {
    setSelectedRole(role);
    setIsDeleteOpen(true);
  };

  const handleAddRole = () => {
    if (!roleName.trim()) return;

    const newRole: RoleItem = {
      id: `ROLE-${Date.now()}`,
      name: roleName.trim(),
      description: roleDescription.trim() || "Custom role",
      permissions: rolePermissions,
    };

    setRoles((prev) => [...prev, newRole]);
    setIsAddOpen(false);
    resetForm();
  };

  const handleSaveEdit = () => {
    if (!selectedRole || !roleName.trim()) return;

    setRoles((prev) =>
      prev.map((role) =>
        role.id === selectedRole.id
          ? {
              ...role,
              name: roleName.trim(),
              description: roleDescription.trim() || "Custom role",
              permissions: rolePermissions,
            }
          : role,
      ),
    );

    setIsEditOpen(false);
    setSelectedRole(null);
    resetForm();
  };

  const handleDeleteRole = () => {
    if (!selectedRole) return;

    setRoles((prev) => prev.filter((role) => role.id !== selectedRole.id));
    setIsDeleteOpen(false);
    setSelectedRole(null);
  };

  return (
    <>
      <PageShell
        title="Manage Roles"
        subtitle="Create, edit, view, and delete role-based permission templates."
        actions={
          <div className="flex gap-2">
            <Link
              href="/users"
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Users
            </Link>

            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleOpenAdd}
            >
              Add Role
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">Total Roles</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {totals.totalRoles}
              </h3>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">
                Total Assigned Permissions
              </p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {totals.totalPermissions}
              </h3>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardContent className="p-0">
            <div className="border-b px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Role List
              </h3>
              <p className="text-sm text-slate-500">
                Click view, edit, or delete for each role.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-slate-50">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Role Name
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Description
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Modules Enabled
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total Permissions
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} className="border-b hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {role.name}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {role.description}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {countGrantedModules(role.permissions)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {role.permissions.length}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenView(role)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEdit(role)}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleOpenDelete(role)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {roles.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-16 text-center text-slate-500"
                      >
                        No roles found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </PageShell>

      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Add Role</DialogTitle>
            <DialogDescription>
              Create a new role and assign permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-role-name">Role Name</Label>
                <Input
                  id="add-role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. Branch Cashier"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-role-description">Description</Label>
                <Input
                  id="add-role-description"
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder="Role description"
                />
              </div>
            </div>

            <PermissionEditor
              permissions={rolePermissions}
              setPermissions={setRolePermissions}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleAddRole}
            >
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setSelectedRole(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Update role details and permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-role-name">Role Name</Label>
                <Input
                  id="edit-role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-role-description">Description</Label>
                <Input
                  id="edit-role-description"
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                />
              </div>
            </div>

            <PermissionEditor
              permissions={rolePermissions}
              setPermissions={setRolePermissions}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleSaveEdit}
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
          if (!open) setSelectedRole(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {selectedRole?.name ?? "Role"} Permissions
            </DialogTitle>
            <DialogDescription>
              Read-only role permission view.
            </DialogDescription>
          </DialogHeader>

          {selectedRole && (
            <div className="space-y-4 py-2">
              <Card>
                <CardContent className="grid gap-4 p-5 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-slate-500">Role Name</p>
                    <p className="font-medium text-slate-900">
                      {selectedRole.name}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Description</p>
                    <p className="font-medium text-slate-900">
                      {selectedRole.description}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Modules Enabled</p>
                    <p className="font-medium text-slate-900">
                      {countGrantedModules(selectedRole.permissions)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <PermissionViewer permissions={selectedRole.permissions} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          setIsDeleteOpen(open);
          if (!open) setSelectedRole(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-slate-900">
                {selectedRole?.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeleteRole}
            >
              Delete Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
