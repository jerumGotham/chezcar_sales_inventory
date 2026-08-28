import "server-only";

import type { LocationType, RoleScope, UserRole } from "@prisma/client";

import { CAPABILITY_IDS, type CapabilityId } from "../../contracts/roles";

export type AccessResource =
  | "dashboard"
  | "customers"
  | "customer-orders"
  | "products"
  | "inventory"
  | "users"
  | "reports"
  | "stock-transfers";

export type AccessAction = "view" | "manage";

export type Capability = CapabilityId;

export type PersistedAccessLocation = {
  id: string;
  code: string;
  type: LocationType;
  isActive: boolean;
};

export type PersistedAccessContext = {
  userId: string;
  role: UserRole;
  roleDefinitionId: string;
  roleScope: RoleScope;
  capabilities: readonly string[];
  isOwner: boolean;
  locationId: string | null;
  location: PersistedAccessLocation | null;
};

export const CAPABILITIES = {
  dashboardView: "dashboard:view",
  customersView: "customers:view",
  customerOrdersView: "customer-orders:view",
  salesPost: "sales:post",
  salesVerifyView: "sales:verify:view",
  salesVerify: "sales:verify",
  salesResolve: "sales:resolve",
  salesMismatchRespond: "sales:mismatch:respond",
  productsView: "products:view",
  inventoryView: "inventory:view",
  inventoryReceivingCreate: "inventory-receiving:create",
  reportsView: "reports:view",
  usersManage: "users:manage",
  branchesManage: "branches:manage",
  rolesManage: "roles:manage",
  stockTransfersView: "stock-transfers:view",
} as const satisfies Record<string, Capability>;

const COMPATIBILITY_ROLE_BY_SCOPE = {
  OWNER: "ADMIN",
  BRANCH: "BRANCH_STAFF",
  STOCK_ROOM: "STOCK_STAFF",
  BUSINESS_WIDE: "ACCOUNTING_STAFF",
} as const satisfies Record<RoleScope, UserRole>;

export function validatePersistedAssignment(
  context: PersistedAccessContext,
): boolean {
  const { role, roleScope, locationId, location } = context;
  if (
    role !== COMPATIBILITY_ROLE_BY_SCOPE[roleScope] ||
    context.isOwner !== (roleScope === "OWNER")
  ) {
    return false;
  }
  const hasConsistentLocation =
    locationId !== null && location !== null && location.id === locationId;

  switch (roleScope) {
    case "OWNER":
    case "BUSINESS_WIDE":
      return locationId === null && location === null;
    case "STOCK_ROOM":
      return (
        hasConsistentLocation &&
        location.isActive &&
        location.code === "SR" &&
        location.type === "WAREHOUSE"
      );
    case "BRANCH":
      return (
        hasConsistentLocation &&
        location.isActive &&
        location.type === "BRANCH"
      );
  }
}

export function evaluateAccess(
  context: PersistedAccessContext,
  capability: Capability,
): boolean {
  if (!validatePersistedAssignment(context)) {
    return false;
  }

  return context.isOwner || context.capabilities.includes(capability);
}

export function capabilitiesFor(
  context: PersistedAccessContext,
): readonly Capability[] {
  if (!validatePersistedAssignment(context)) {
    return [];
  }

  if (context.isOwner) return CAPABILITY_IDS;
  const granted = new Set(context.capabilities);
  return CAPABILITY_IDS.filter((capability) => granted.has(capability));
}
