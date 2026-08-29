import "server-only";

import type { LocationType, RoleScope, UserRole } from "@prisma/client";

import { CAPABILITY_IDS, type CapabilityId } from "../../contracts/roles";
import { effectiveCapabilities, hasCapability } from "../../permissions";

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
  customersCreate: "customers:create",
  customersUpdate: "customers:update",
  customersDeactivate: "customers:deactivate",
  customerOrdersView: "customer-orders:view",
  customerOrdersCreate: "customer-orders:create",
  salesView: "sales:view",
  salesPost: "sales:post",
  salesVerifyView: "sales:verify:view",
  salesVerify: "sales:verify",
  salesResolve: "sales:resolve",
  salesMismatchRespond: "sales:mismatch:respond",
  productsView: "products:view",
  productsCreate: "products:create",
  productsUpdate: "products:update",
  productsDelete: "products:delete",
  inventoryView: "inventory:view",
  inventoryReceivingCreate: "inventory-receiving:create",
  reportsView: "reports:view",
  usersView: "users:view",
  branchesView: "branches:view",
  rolesView: "roles:view",
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

  const granted = context.capabilities.filter((item): item is CapabilityId =>
    CAPABILITY_IDS.includes(item as CapabilityId),
  );
  return context.isOwner || hasCapability(granted, capability);
}

export function capabilitiesFor(
  context: PersistedAccessContext,
): readonly Capability[] {
  if (!validatePersistedAssignment(context)) {
    return [];
  }

  if (context.isOwner) return CAPABILITY_IDS;
  const granted = context.capabilities.filter((item): item is CapabilityId =>
    CAPABILITY_IDS.includes(item as CapabilityId),
  );
  const effective = new Set(effectiveCapabilities(granted));
  return CAPABILITY_IDS.filter((capability) => effective.has(capability));
}
