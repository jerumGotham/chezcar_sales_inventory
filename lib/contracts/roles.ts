import { z } from "zod";

export const ROLE_SCOPES = ["OWNER", "BRANCH", "STOCK_ROOM", "BUSINESS_WIDE"] as const;
export type RoleScopeDto = (typeof ROLE_SCOPES)[number];

export const ASSIGNABLE_ROLE_SCOPES = ["BRANCH", "STOCK_ROOM", "BUSINESS_WIDE"] as const;
export type AssignableRoleScope = (typeof ASSIGNABLE_ROLE_SCOPES)[number];

export const CAPABILITY_CATALOG = [
  { id: "dashboard:view", module: "Dashboard", label: "View dashboard" },
  { id: "notifications:view", module: "Notifications", label: "View notifications" },
  { id: "notifications:mark-read", module: "Notifications", label: "Mark notifications as read" },
  { id: "notifications:push", module: "Notifications", label: "Manage browser notifications" },
  { id: "customers:view", module: "Customers", label: "View customers" },
  { id: "customers:create", module: "Customers", label: "Add customers" },
  { id: "customers:update", module: "Customers", label: "Edit customers" },
  { id: "customers:deactivate", module: "Customers", label: "Deactivate customers" },
  { id: "customer-orders:view", module: "Customer Orders", label: "View customer orders" },
  { id: "customer-orders:create", module: "Customer Orders", label: "Create customer orders", allowedScopes: ["BRANCH"] },
  { id: "customer-orders:reserve", module: "Customer Orders", label: "Reserve order stock", allowedScopes: ["BRANCH"] },
  { id: "customer-orders:record-payment", module: "Customer Orders", label: "Record order payments", allowedScopes: ["BRANCH"] },
  { id: "customer-orders:release", module: "Customer Orders", label: "Release customer orders", allowedScopes: ["BRANCH"] },
  { id: "customer-orders:cancel", module: "Customer Orders", label: "Cancel unpaid customer orders", allowedScopes: ["BRANCH"] },
  { id: "customer-orders:cancel-paid", module: "Customer Orders", label: "Cancel paid customer orders", ownerOnly: true },
  { id: "sales:view", module: "Sales", label: "View sales", allowedScopes: ["BRANCH", "BUSINESS_WIDE"] },
  { id: "sales:post", module: "Sales", label: "Post sales", allowedScopes: ["BRANCH"] },
  { id: "sales:verify:view", module: "Sales", label: "View receipt verification", allowedScopes: ["BRANCH", "BUSINESS_WIDE"] },
  { id: "sales:verify", module: "Sales", label: "Verify receipts", allowedScopes: ["BUSINESS_WIDE"] },
  { id: "sales:resolve", module: "Sales", label: "Resolve receipt mismatches", allowedScopes: ["BUSINESS_WIDE"] },
  { id: "sales:void-replace", module: "Sales", label: "Void and replace sales", ownerOnly: true },
  { id: "sales:mismatch:respond", module: "Sales", label: "Respond to receipt mismatches", allowedScopes: ["BRANCH"] },
  { id: "sales:evidence:view", module: "Sales", label: "View receipt evidence", allowedScopes: ["BRANCH", "BUSINESS_WIDE"] },
  { id: "sales:evidence:upload", module: "Sales", label: "Upload receipt evidence", allowedScopes: ["BRANCH", "BUSINESS_WIDE"] },
  { id: "products:view", module: "Products", label: "View products" },
  { id: "products:create", module: "Products", label: "Add products" },
  { id: "products:update", module: "Products", label: "Edit products" },
  { id: "products:delete", module: "Products", label: "Delete products" },
  { id: "products:image:update", module: "Products", label: "Manage product images" },
  { id: "inventory:view", module: "Inventory", label: "View inventory" },
  { id: "inventory-availability:view", module: "Inventory", label: "View inventory availability" },
  { id: "inventory-movements:view", module: "Inventory", label: "View stock movements" },
  { id: "inventory:adjust", module: "Inventory", label: "Adjust stock", allowedScopes: ["BRANCH", "STOCK_ROOM"] },
  { id: "inventory:cost:update", module: "Inventory", label: "Edit inventory cost", allowedScopes: ["BRANCH", "STOCK_ROOM"] },
  { id: "stock-receipts:view", module: "Inventory", label: "View supplier receipts", allowedScopes: ["STOCK_ROOM"] },
  { id: "inventory-receiving:create", module: "Inventory", label: "Receive inventory", allowedScopes: ["STOCK_ROOM"] },
  { id: "stock-transfers:view", module: "Inventory", label: "View stock transfers", allowedScopes: ["BRANCH", "STOCK_ROOM"] },
  { id: "stock-transfers:create", module: "Inventory", label: "Create stock transfers", allowedScopes: ["STOCK_ROOM"] },
  { id: "stock-transfers:update", module: "Inventory", label: "Edit stock transfer drafts", allowedScopes: ["STOCK_ROOM"] },
  { id: "stock-transfers:delete", module: "Inventory", label: "Delete stock transfer drafts", allowedScopes: ["STOCK_ROOM"] },
  { id: "stock-transfers:finalize", module: "Inventory", label: "Finalize stock transfers", allowedScopes: ["STOCK_ROOM"] },
  { id: "stock-transfers:dispatch", module: "Inventory", label: "Dispatch stock transfers", allowedScopes: ["STOCK_ROOM"] },
  { id: "stock-transfers:receive", module: "Inventory", label: "Receive stock transfers", allowedScopes: ["BRANCH"] },
  { id: "stock-transfers:report-discrepancy", module: "Inventory", label: "Report transfer discrepancies", allowedScopes: ["BRANCH"] },
  { id: "stock-transfers:investigate", module: "Inventory", label: "Investigate transfer discrepancies", allowedScopes: ["STOCK_ROOM"] },
  { id: "stock-transfers:resolve", module: "Inventory", label: "Resolve transfer discrepancies", ownerOnly: true },
  { id: "stock-transfers:audit:view", module: "Inventory", label: "View transfer audit history", allowedScopes: ["BRANCH", "STOCK_ROOM"] },
  { id: "reports:view", module: "Reports", label: "View reports", allowedScopes: ["BUSINESS_WIDE"] },
  { id: "reports:export", module: "Reports", label: "Export reports", allowedScopes: ["BUSINESS_WIDE"] },
  { id: "offline-sales:snapshot", module: "Offline Sales", label: "View offline sales snapshot", allowedScopes: ["BRANCH"] },
  { id: "offline-sales:sync", module: "Offline Sales", label: "Sync offline sales", allowedScopes: ["BRANCH"] },
  { id: "offline-sales:activate-device", module: "Administration", label: "Activate offline devices", ownerOnly: true },
  { id: "users:view", module: "Administration", label: "View users", ownerOnly: true },
  { id: "users:create", module: "Administration", label: "Add users", ownerOnly: true },
  { id: "users:update", module: "Administration", label: "Edit users", ownerOnly: true },
  { id: "users:set-status", module: "Administration", label: "Activate or deactivate users", ownerOnly: true },
  { id: "users:reset-password", module: "Administration", label: "Reset user passwords", ownerOnly: true },
  { id: "branches:view", module: "Administration", label: "View branches", ownerOnly: true },
  { id: "branches:create", module: "Administration", label: "Add branches", ownerOnly: true },
  { id: "branches:update", module: "Administration", label: "Edit branches", ownerOnly: true },
  { id: "roles:view", module: "Administration", label: "View roles", ownerOnly: true },
  { id: "roles:create", module: "Administration", label: "Add roles", ownerOnly: true },
  { id: "roles:update", module: "Administration", label: "Edit roles", ownerOnly: true },
] as const;

export type CapabilityId = (typeof CAPABILITY_CATALOG)[number]["id"];
export const CAPABILITY_IDS = CAPABILITY_CATALOG.map((item) => item.id) as readonly CapabilityId[];
export const ASSIGNABLE_CAPABILITY_CATALOG = CAPABILITY_CATALOG.filter(
  (item) => !("ownerOnly" in item && item.ownerOnly),
);
export const OWNER_ONLY_CAPABILITY_IDS = CAPABILITY_CATALOG.filter(
  (item) => "ownerOnly" in item && item.ownerOnly,
).map((item) => item.id) as readonly CapabilityId[];

export function capabilityIsAssignableToScope(
  capabilityId: CapabilityId,
  scope: AssignableRoleScope,
): boolean {
  const capability = CAPABILITY_CATALOG.find((item) => item.id === capabilityId);
  if (!capability || ("ownerOnly" in capability && capability.ownerOnly)) return false;
  return !("allowedScopes" in capability) ||
    (capability.allowedScopes as readonly AssignableRoleScope[]).includes(scope);
}
const capabilitySchema = z.enum(CAPABILITY_IDS as [CapabilityId, ...CapabilityId[]]);

const roleNameSchema = z.string().trim().min(1).max(120);
const roleDescriptionSchema = z.string().trim().max(500);

export const createRoleRequestSchema = z.object({
  name: roleNameSchema,
  description: roleDescriptionSchema.default(""),
  scope: z.enum(ASSIGNABLE_ROLE_SCOPES),
  permissions: z.array(capabilitySchema).max(CAPABILITY_IDS.length).default([]),
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

export const updateRoleRequestSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: roleDescriptionSchema.optional(),
    scope: z.enum(ASSIGNABLE_ROLE_SCOPES).optional(),
    permissions: z.array(capabilitySchema).max(CAPABILITY_IDS.length).optional(),
    version: z.number().int().min(1),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.scope !== undefined ||
      value.permissions !== undefined,
    { message: "At least one change is required" },
  );
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

export type RoleDefinitionDto = {
  id: string;
  key: string;
  name: string;
  description: string;
  scope: RoleScopeDto;
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
  "id" | "name" | "scope" | "description"
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
