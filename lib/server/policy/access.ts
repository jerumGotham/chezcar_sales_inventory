import "server-only";

import type { LocationType, UserRole } from "@prisma/client";

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

export type Capability =
  | "dashboard:view"
  | "customers:view"
  | "customer-orders:view"
  | "sales:post"
  | "sales:verify:view"
  | "sales:verify"
  | "sales:resolve"
  | "sales:mismatch:respond"
  | "products:view"
  | "inventory:view"
  | "inventory-receiving:create"
  | "reports:view"
  | "users:manage"
  | "stock-transfers:view";

export type PersistedAccessLocation = {
  id: string;
  code: string;
  type: LocationType;
  isActive: boolean;
};

export type PersistedAccessContext = {
  userId: string;
  role: UserRole;
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
  stockTransfersView: "stock-transfers:view",
} as const satisfies Record<string, Capability>;

const FIXED_BRANCH_CODES = new Set(["QC", "BL", "LU", "VC", "SP"]);

const ROLE_CAPABILITIES = {
  ADMIN: [
    CAPABILITIES.dashboardView,
    CAPABILITIES.customersView,
    CAPABILITIES.customerOrdersView,
    CAPABILITIES.salesPost,
    CAPABILITIES.salesVerifyView,
    CAPABILITIES.salesVerify,
    CAPABILITIES.salesResolve,
    CAPABILITIES.productsView,
    CAPABILITIES.inventoryView,
    CAPABILITIES.inventoryReceivingCreate,
    CAPABILITIES.reportsView,
    CAPABILITIES.usersManage,
    CAPABILITIES.stockTransfersView,
  ],
  STOCK_STAFF: [
    CAPABILITIES.dashboardView,
    CAPABILITIES.customersView,
    CAPABILITIES.customerOrdersView,
    CAPABILITIES.productsView,
    CAPABILITIES.inventoryView,
    CAPABILITIES.inventoryReceivingCreate,
    CAPABILITIES.stockTransfersView,
  ],
  BRANCH_STAFF: [
    CAPABILITIES.dashboardView,
    CAPABILITIES.customersView,
    CAPABILITIES.customerOrdersView,
    CAPABILITIES.salesPost,
    CAPABILITIES.salesVerifyView,
    CAPABILITIES.salesMismatchRespond,
    CAPABILITIES.inventoryView,
    CAPABILITIES.stockTransfersView,
  ],
  ACCOUNTING_STAFF: [
    CAPABILITIES.dashboardView,
    CAPABILITIES.customersView,
    CAPABILITIES.customerOrdersView,
    CAPABILITIES.salesVerify,
    CAPABILITIES.salesVerifyView,
    CAPABILITIES.salesResolve,
    CAPABILITIES.reportsView,
  ],
} as const satisfies Record<UserRole, readonly Capability[]>;

export function validatePersistedAssignment(
  context: PersistedAccessContext,
): boolean {
  const { role, locationId, location } = context;
  const hasConsistentLocation =
    locationId !== null && location !== null && location.id === locationId;

  switch (role) {
    case "ADMIN":
    case "ACCOUNTING_STAFF":
      return locationId === null && location === null;
    case "STOCK_STAFF":
      return (
        hasConsistentLocation &&
        location.isActive &&
        location.code === "SR" &&
        location.type === "WAREHOUSE"
      );
    case "BRANCH_STAFF":
      return (
        hasConsistentLocation &&
        location.isActive &&
        FIXED_BRANCH_CODES.has(location.code) &&
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

  return (ROLE_CAPABILITIES[context.role] as readonly Capability[]).includes(
    capability,
  );
}

export function capabilitiesFor(
  context: PersistedAccessContext,
): readonly Capability[] {
  if (!validatePersistedAssignment(context)) {
    return [];
  }

  return ROLE_CAPABILITIES[context.role];
}
