export type ShellRole =
  | "ADMIN"
  | "STOCK_STAFF"
  | "BRANCH_STAFF"
  | "ACCOUNTING_STAFF";

export type ShellCapabilityId =
  | "dashboard:view"
  | "customers:view"
  | "customer-orders:view"
  | "products:view"
  | "inventory:view"
  | "users:manage";

export type ShellMenuIcon =
  | "dashboard"
  | "customers"
  | "products"
  | "inventory"
  | "customer-orders"
  | "users";

export type ShellMenuHref =
  | "/dashboard"
  | "/customers"
  | "/products"
  | "/inventory"
  | "/customer-orders"
  | "/users";

export type ShellMenuEntryDto = {
  label: string;
  href: ShellMenuHref;
  icon: ShellMenuIcon;
};

export type ShellIdentityDto = {
  name: string;
  email: string;
  role: ShellRole;
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
