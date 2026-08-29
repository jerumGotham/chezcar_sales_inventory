import "server-only";

import { CAPABILITY_IDS, type CapabilityId } from "../../contracts/roles";
import { effectiveCapabilities, hasCapability } from "../../permissions";

export type Capability = CapabilityId;

export type PersistedAccessContext = {
  userId: string;
  roleDefinitionId: string;
  capabilities: readonly string[];
  isOwner: boolean;
  locationIds: readonly string[];
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

export function hasAllLocationAccess(context: PersistedAccessContext): boolean {
  return context.isOwner || context.capabilities.includes("locations:all");
}

export function validatePersistedAssignment(context: PersistedAccessContext): boolean {
  return hasAllLocationAccess(context) || context.locationIds.length > 0;
}

export function canAccessLocation(
  context: PersistedAccessContext,
  locationId: string,
): boolean {
  return validatePersistedAssignment(context) &&
    (hasAllLocationAccess(context) || context.locationIds.includes(locationId));
}

export function accessibleLocationWhere(context: PersistedAccessContext):
  | Record<string, never>
  | { id: { in: string[] } } {
  return hasAllLocationAccess(context)
    ? {}
    : { id: { in: [...context.locationIds] } };
}

export function evaluateAccess(
  context: PersistedAccessContext,
  capability: Capability,
): boolean {
  if (!validatePersistedAssignment(context)) return false;
  const granted = context.capabilities.filter((item): item is CapabilityId =>
    CAPABILITY_IDS.includes(item as CapabilityId),
  );
  return context.isOwner || hasCapability(granted, capability);
}

export function capabilitiesFor(
  context: PersistedAccessContext,
): readonly Capability[] {
  if (!validatePersistedAssignment(context)) return [];
  if (context.isOwner) return CAPABILITY_IDS;
  const granted = context.capabilities.filter((item): item is CapabilityId =>
    CAPABILITY_IDS.includes(item as CapabilityId),
  );
  const effective = new Set(effectiveCapabilities(granted));
  return CAPABILITY_IDS.filter((capability) => effective.has(capability));
}
