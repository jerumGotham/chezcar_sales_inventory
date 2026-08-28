import { z } from "zod";

export const ROLE_SCOPES = ["OWNER", "BRANCH", "STOCK_ROOM", "BUSINESS_WIDE"] as const;
export type RoleScopeDto = (typeof ROLE_SCOPES)[number];

export const ASSIGNABLE_ROLE_SCOPES = ["BRANCH", "STOCK_ROOM", "BUSINESS_WIDE"] as const;
export type AssignableRoleScope = (typeof ASSIGNABLE_ROLE_SCOPES)[number];

export const CAPABILITY_CATALOG = [
  { id: "dashboard:view", module: "Dashboard", label: "View dashboard" },
  { id: "customers:view", module: "Customers", label: "View customers" },
  { id: "customer-orders:view", module: "Customer Orders", label: "View customer orders" },
  { id: "sales:post", module: "Sales", label: "Post sales" },
  { id: "sales:verify:view", module: "Sales", label: "View receipt verification" },
  { id: "sales:verify", module: "Sales", label: "Verify receipts" },
  { id: "sales:resolve", module: "Sales", label: "Resolve receipt mismatches" },
  { id: "sales:mismatch:respond", module: "Sales", label: "Respond to receipt mismatches" },
  { id: "products:view", module: "Products", label: "View products" },
  { id: "inventory:view", module: "Inventory", label: "View inventory" },
  { id: "inventory-receiving:create", module: "Inventory", label: "Receive inventory" },
  { id: "stock-transfers:view", module: "Inventory", label: "View stock transfers" },
  { id: "reports:view", module: "Reports", label: "View reports" },
  { id: "users:manage", module: "Administration", label: "Manage users", ownerOnly: true },
  { id: "branches:manage", module: "Administration", label: "Manage branches", ownerOnly: true },
  { id: "roles:manage", module: "Administration", label: "Manage roles", ownerOnly: true },
] as const;

export type CapabilityId = (typeof CAPABILITY_CATALOG)[number]["id"];
export const CAPABILITY_IDS = CAPABILITY_CATALOG.map((item) => item.id) as readonly CapabilityId[];
export const ASSIGNABLE_CAPABILITY_CATALOG = CAPABILITY_CATALOG.filter(
  (item) => !("ownerOnly" in item && item.ownerOnly),
);
export const OWNER_ONLY_CAPABILITY_IDS = CAPABILITY_CATALOG.filter(
  (item) => "ownerOnly" in item && item.ownerOnly,
).map((item) => item.id) as readonly CapabilityId[];
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
