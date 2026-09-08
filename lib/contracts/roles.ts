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
  { id: "sales:view", module: "Sales", label: "View direct sales" },
  { id: "sales:post", module: "Sales", label: "Complete Sale" },
  { id: "sales:correction:request", module: "Sales", label: "Report wrong submission" },
  { id: "sales:verify:view", module: "Sales", label: "View receipt verification" },
  { id: "sales:verify", module: "Sales", label: "Confirm correct or report mismatch" },
  { id: "sales:resolve", module: "Sales", label: "Confirm original encoding" },
  { id: "sales:void-replace", module: "Sales", label: "Keep sale posted / Approve and void sale / Void and replace / Void sale and restore inventory" },
  { id: "sales:mismatch:respond", module: "Sales", label: "Submit or update branch response" },
  { id: "sales:evidence:view", module: "Sales", label: "View uploaded receipt photo" },
  { id: "sales:evidence:upload", module: "Sales", label: "Attach or replace receipt photo" },
  { id: "sales:evidence:delete", module: "Sales", label: "Delete receipt photo" },
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
  { id: "stock-transfers:cancel", module: "Inventory", label: "Cancel in-transit stock transfers" },
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
  { id: "suppliers:view", module: "Supplier Maintenance", label: "View suppliers" },
  { id: "suppliers:create", module: "Supplier Maintenance", label: "Add suppliers" },
  { id: "suppliers:update", module: "Supplier Maintenance", label: "Edit suppliers" },
  { id: "suppliers:deactivate", module: "Supplier Maintenance", label: "Activate or deactivate suppliers" },
  { id: "personnel:view", module: "Personnel Maintenance", label: "View personnel" },
  { id: "personnel:create", module: "Personnel Maintenance", label: "Add personnel" },
  { id: "personnel:update", module: "Personnel Maintenance", label: "Edit personnel" },
  { id: "personnel:deactivate", module: "Personnel Maintenance", label: "Activate or deactivate personnel" },
  { id: "backjobs:view", module: "Returns & Warranty", label: "View backjobs" },
  { id: "backjobs:create", module: "Returns & Warranty", label: "Create backjobs" },
  { id: "backjobs:update", module: "Returns & Warranty", label: "Edit backjobs" },
  { id: "backjobs:delete", module: "Returns & Warranty", label: "Delete unused Backjob drafts" },
  { id: "backjobs:schedule", module: "Returns & Warranty", label: "Schedule backjobs" },
  { id: "backjobs:complete", module: "Returns & Warranty", label: "Record and complete backjob work" },
  { id: "backjobs:parts:issue", module: "Returns & Warranty", label: "Issue backjob parts" },
  { id: "backjobs:parts:return", module: "Returns & Warranty", label: "Return unused backjob parts" },
  { id: "backjobs:print", module: "Returns & Warranty", label: "Print backjob details" },
  { id: "customer-warranties:view", module: "Returns & Warranty", label: "View customer warranties" },
  { id: "customer-warranties:create", module: "Returns & Warranty", label: "Create customer warranties" },
  { id: "customer-warranties:photos:add", module: "Returns & Warranty", label: "Add warranty photos" },
  { id: "customer-warranties:receive-quarantine", module: "Returns & Warranty", label: "Receive warranty items into quarantine" },
  { id: "customer-warranties:assess", module: "Returns & Warranty", label: "Assess customer warranties" },
  { id: "customer-warranties:approve", module: "Returns & Warranty", label: "Approve warranty repair or replacement" },
  { id: "customer-warranties:release", module: "Returns & Warranty", label: "Release warranty repair or replacement" },
  { id: "customer-warranties:complete", module: "Returns & Warranty", label: "Complete or reject warranties" },
  { id: "customer-warranties:print", module: "Returns & Warranty", label: "Print warranty details" },
  { id: "supplier-claims:view", module: "Returns & Warranty", label: "View supplier claims" },
  { id: "supplier-claims:create", module: "Returns & Warranty", label: "Create supplier claims" },
  { id: "supplier-claims:manage", module: "Returns & Warranty", label: "Manage supplier claims" },
  { id: "supplier-claims:return-stock", module: "Returns & Warranty", label: "Return claim stock to supplier" },
  { id: "supplier-claims:receive-replacement", module: "Returns & Warranty", label: "Receive supplier replacements" },
  { id: "supplier-claims:repair-stock", module: "Returns & Warranty", label: "Process supplier repairs" },
  { id: "supplier-claims:record-monetary-resolution", module: "Returns & Warranty", label: "Record supplier refund or credit" },
  { id: "supplier-claims:approve-writeoff", module: "Returns & Warranty", label: "Approve claim write-offs" },
  { id: "supplier-claims:close", module: "Returns & Warranty", label: "Close supplier claims" },
  { id: "supplier-claims:evidence", module: "Returns & Warranty", label: "Manage supplier claim evidence" },
  { id: "supplier-claims:print", module: "Returns & Warranty", label: "Print supplier claims" },
  { id: "roles:view", module: "Role Permissions", label: "View roles" },
  { id: "roles:create", module: "Role Permissions", label: "Add roles" },
  { id: "roles:update", module: "Role Permissions", label: "Edit roles" },
] as const;

export type CapabilityId = (typeof CAPABILITY_CATALOG)[number]["id"];
export const CAPABILITY_IDS = CAPABILITY_CATALOG.map((item) => item.id) as readonly CapabilityId[];
export const ASSIGNABLE_CAPABILITY_CATALOG = CAPABILITY_CATALOG.filter(
  ({ id }) =>
    id !== "offline-sales:snapshot" &&
    id !== "offline-sales:sync" &&
    id !== "offline-sales:activate-device" &&
    id !== "stock-transfers:audit:view",
);
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
