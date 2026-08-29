import { z } from "zod";

export const CAPABILITY_CATALOG = [
  { id: "locations:all", module: "Locations", label: "Access all locations" },
  { id: "dashboard:view", module: "Dashboard", label: "View dashboard" },
  { id: "notifications:view", module: "Notifications", label: "View notifications" },
  { id: "notifications:mark-read", module: "Notifications", label: "Mark notifications as read" },
  { id: "notifications:push", module: "Notifications", label: "Manage browser notifications" },
  { id: "customers:view", module: "Customers", label: "View customers" },
  { id: "customers:create", module: "Customers", label: "Add customers" },
  { id: "customers:update", module: "Customers", label: "Edit customers" },
  { id: "customers:deactivate", module: "Customers", label: "Deactivate customers" },
  { id: "customer-orders:view", module: "Customer Orders", label: "View customer orders" },
  { id: "customer-orders:create", module: "Customer Orders", label: "Create customer orders" },
  { id: "customer-orders:reserve", module: "Customer Orders", label: "Reserve order stock" },
  { id: "customer-orders:record-payment", module: "Customer Orders", label: "Record order payments" },
  { id: "customer-orders:release", module: "Customer Orders", label: "Release customer orders" },
  { id: "customer-orders:cancel", module: "Customer Orders", label: "Cancel unpaid customer orders" },
  { id: "customer-orders:cancel-paid", module: "Customer Orders", label: "Cancel paid customer orders" },
  { id: "sales:view", module: "Sales", label: "View sales" },
  { id: "sales:post", module: "Sales", label: "Post sales" },
  { id: "sales:verify:view", module: "Sales", label: "View receipt verification" },
  { id: "sales:verify", module: "Sales", label: "Verify receipts" },
  { id: "sales:resolve", module: "Sales", label: "Resolve receipt mismatches" },
  { id: "sales:void-replace", module: "Sales", label: "Void and replace sales" },
  { id: "sales:mismatch:respond", module: "Sales", label: "Respond to receipt mismatches" },
  { id: "sales:evidence:view", module: "Sales", label: "View receipt evidence" },
  { id: "sales:evidence:upload", module: "Sales", label: "Upload receipt evidence" },
  { id: "products:view", module: "Products", label: "View products" },
  { id: "products:create", module: "Products", label: "Add products" },
  { id: "products:update", module: "Products", label: "Edit products" },
  { id: "products:delete", module: "Products", label: "Delete products" },
  { id: "products:image:update", module: "Products", label: "Manage product images" },
  { id: "inventory:view", module: "Inventory", label: "View inventory" },
  { id: "inventory-availability:view", module: "Inventory", label: "View inventory availability" },
  { id: "inventory-movements:view", module: "Inventory", label: "View stock movements" },
  { id: "inventory:adjust", module: "Inventory", label: "Adjust stock" },
  { id: "inventory:cost:update", module: "Inventory", label: "Edit inventory cost" },
  { id: "stock-receipts:view", module: "Inventory", label: "View supplier receipts" },
  { id: "inventory-receiving:create", module: "Inventory", label: "Receive inventory" },
  { id: "stock-transfers:view", module: "Inventory", label: "View stock transfers" },
  { id: "stock-transfers:create", module: "Inventory", label: "Create stock transfers" },
  { id: "stock-transfers:update", module: "Inventory", label: "Edit stock transfer drafts" },
  { id: "stock-transfers:delete", module: "Inventory", label: "Delete stock transfer drafts" },
  { id: "stock-transfers:finalize", module: "Inventory", label: "Finalize stock transfers" },
  { id: "stock-transfers:dispatch", module: "Inventory", label: "Dispatch stock transfers" },
  { id: "stock-transfers:receive", module: "Inventory", label: "Receive stock transfers" },
  { id: "stock-transfers:report-discrepancy", module: "Inventory", label: "Report transfer discrepancies" },
  { id: "stock-transfers:investigate", module: "Inventory", label: "Investigate transfer discrepancies" },
  { id: "stock-transfers:resolve", module: "Inventory", label: "Resolve transfer discrepancies" },
  { id: "stock-transfers:audit:view", module: "Inventory", label: "View transfer audit history" },
  { id: "reports:view", module: "Reports", label: "View reports" },
  { id: "reports:export", module: "Reports", label: "Export reports" },
  { id: "offline-sales:snapshot", module: "Offline Sales", label: "View offline sales snapshot" },
  { id: "offline-sales:sync", module: "Offline Sales", label: "Sync offline sales" },
  { id: "offline-sales:activate-device", module: "Administration", label: "Activate offline devices" },
  { id: "users:view", module: "Administration", label: "View users" },
  { id: "users:create", module: "Administration", label: "Add users" },
  { id: "users:update", module: "Administration", label: "Edit users" },
  { id: "users:set-status", module: "Administration", label: "Activate or deactivate users" },
  { id: "users:reset-password", module: "Administration", label: "Reset user passwords" },
  { id: "branches:view", module: "Administration", label: "View branches" },
  { id: "branches:create", module: "Administration", label: "Add branches" },
  { id: "branches:update", module: "Administration", label: "Edit branches" },
  { id: "roles:view", module: "Administration", label: "View roles" },
  { id: "roles:create", module: "Administration", label: "Add roles" },
  { id: "roles:update", module: "Administration", label: "Edit roles" },
] as const;

export type CapabilityId = (typeof CAPABILITY_CATALOG)[number]["id"];
export const CAPABILITY_IDS = CAPABILITY_CATALOG.map((item) => item.id) as readonly CapabilityId[];
export const ASSIGNABLE_CAPABILITY_CATALOG = CAPABILITY_CATALOG;
const capabilitySchema = z.enum(CAPABILITY_IDS as [CapabilityId, ...CapabilityId[]]);

const roleNameSchema = z.string().trim().min(1).max(120);
const roleDescriptionSchema = z.string().trim().max(500);

export const createRoleRequestSchema = z.object({
  name: roleNameSchema,
  description: roleDescriptionSchema.default(""),
  permissions: z.array(capabilitySchema).max(CAPABILITY_IDS.length).default([]),
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

export const updateRoleRequestSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: roleDescriptionSchema.optional(),
    permissions: z.array(capabilitySchema).max(CAPABILITY_IDS.length).optional(),
    version: z.number().int().min(1),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.permissions !== undefined,
    { message: "At least one change is required" },
  );
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

export type RoleDefinitionDto = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: CapabilityId[];
  isSystem: boolean;
  isOwner: boolean;
  isAssignable: boolean;
  assignedUserCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AssignableRoleDto = Pick<
  RoleDefinitionDto,
  "id" | "name" | "description" | "permissions"
>;

export class RolesApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RolesApiError";
  }
}

async function rolesFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new RolesApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "The role request could not be completed.",
    );
  }
  return (await response.json()) as T;
}

export async function listRoles(): Promise<RoleDefinitionDto[]> {
  return (await rolesFetch<{ data: RoleDefinitionDto[] }>("/api/roles")).data;
}

export async function createRole(input: CreateRoleRequest): Promise<RoleDefinitionDto> {
  return (
    await rolesFetch<{ data: RoleDefinitionDto }>("/api/roles", {
      method: "POST",
      body: JSON.stringify(input),
    })
  ).data;
}

export async function updateRole(
  roleId: string,
  input: UpdateRoleRequest,
): Promise<RoleDefinitionDto> {
  return (
    await rolesFetch<{ data: RoleDefinitionDto }>(
      `/api/roles/${encodeURIComponent(roleId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    )
  ).data;
}
