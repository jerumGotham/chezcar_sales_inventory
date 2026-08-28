export type ShellRole =
  | "ADMIN"
  | "STOCK_STAFF"
  | "BRANCH_STAFF"
  | "ACCOUNTING_STAFF";

import type { CapabilityId, RoleScopeDto } from "./roles";

export type ShellCapabilityId = CapabilityId;

export type ShellMenuIcon =
  | "dashboard"
  | "customers"
  | "customer-sales"
  | "products"
  | "inventory"
  | "customer-orders"
  | "receipt-verification"
   | "reports"
  | "users"
  | "roles"
  | "branches"
  | "stock-transfers"
  | "offline-devices";

export type ShellMenuHref =
  | "/dashboard"
  | "/customers"
  | "/pos"
  | "/products"
  | "/inventory"
  | "/customer-orders"
  | "/accounting/receipt-verification"
  | "/reports"
   | "/users"
  | "/users/roles"
  | "/branches"
  | "/stock-transfers"
  | "/offline";

export type ShellMenuEntryDto = {
  label: string;
  href: ShellMenuHref;
  icon: ShellMenuIcon;
};

export type ShellIdentityDto = {
  name: string;
  email: string;
  role: ShellRole;
  roleDefinitionId: string;
  roleName: string;
  roleScope: RoleScopeDto;
  isOwner: boolean;
};

export type LocationScopeDto = {
  kind: "all-locations" | "location" | "business-wide";
  label: string;
  locationId: string | null;
  code: string | null;
};

export type AuthenticatedShellAccessDto = {
  authenticated: true;
  identity: ShellIdentityDto;
  scope: LocationScopeDto;
  capabilities: readonly ShellCapabilityId[];
  menu: readonly ShellMenuEntryDto[];
};

export type AnonymousShellAccessDto = {
  authenticated: false;
  identity: null;
  scope: null;
  capabilities: readonly [];
  menu: readonly [];
};

export type ShellAccessDto =
  | AuthenticatedShellAccessDto
  | AnonymousShellAccessDto;

export const ANONYMOUS_SHELL_ACCESS: AnonymousShellAccessDto = {
  authenticated: false,
  identity: null,
  scope: null,
  capabilities: [],
  menu: [],
};
