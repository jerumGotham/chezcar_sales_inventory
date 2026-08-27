import type { LocationType, UserRole, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
  findLocation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("./prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    location: { findUnique: mocks.findLocation },
  },
}));

import { loadShellAccess } from "./shell";

type LocationInput = {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  isActive: boolean;
};

const stockRoom: LocationInput = {
  id: "location-sr",
  code: "SR",
  name: "Stock Room",
  type: "WAREHOUSE",
  isActive: true,
};
const qcBranch: LocationInput = {
  id: "location-qc",
  code: "QC",
  name: "Quezon City",
  type: "BRANCH",
  isActive: true,
};

const expectedMenu = {
  ADMIN: [
    "Dashboard",
    "Customers",
    "Customer Sales",
    "Receipt Verification",
    "Customer Orders",
    "Products",
    "Inventory",
    "Stock Transfers",
    "Reports",
    "User Management",
  ],
  STOCK_STAFF: [
    "Dashboard",
    "Customers",
    "Customer Orders",
    "Products",
    "Inventory",
    "Stock Transfers",
  ],
  BRANCH_STAFF: [
    "Dashboard",
    "Customers",
    "Customer Sales",
    "Customer Orders",
    "Inventory",
    "Stock Transfers",
  ],
  ACCOUNTING_STAFF: ["Dashboard", "Customers", "Receipt Verification", "Customer Orders", "Reports"],
} as const satisfies Record<UserRole, readonly string[]>;

const expectedCapabilities = {
  ADMIN: [
    "dashboard:view",
    "customers:view",
    "customer-orders:view",
    "sales:post",
    "sales:verify:view",
    "sales:resolve",
    "products:view",
    "inventory:view",
    "inventory-receiving:create",
    "reports:view",
    "users:manage",
    "stock-transfers:view",
  ],
  STOCK_STAFF: [
    "dashboard:view",
    "customers:view",
    "customer-orders:view",
    "products:view",
    "inventory:view",
    "inventory-receiving:create",
    "stock-transfers:view",
  ],
  BRANCH_STAFF: [
    "dashboard:view",
    "customers:view",
    "customer-orders:view",
    "sales:post",
    "inventory:view",
    "stock-transfers:view",
  ],
  ACCOUNTING_STAFF: [
    "dashboard:view",
    "customers:view",
    "customer-orders:view",
    "sales:verify",
    "sales:verify:view",
    "sales:resolve",
    "reports:view",
  ],
} as const satisfies Record<UserRole, readonly string[]>;

function persistedUser(
  role: UserRole,
  location: LocationInput | null,
  status: UserStatus = "ACTIVE",
) {
  return {
    id: `user-${role.toLowerCase()}`,
    name: `${role} User`,
    email: `${role.toLowerCase()}@example.com`,
    role,
    status,
    locationId: location?.id ?? null,
    location,
  };
}

function signInAs(role: UserRole, location: LocationInput | null) {
  mocks.getSession.mockResolvedValue({
    user: { id: `user-${role.toLowerCase()}`, role: "ADMIN" },
  });
  mocks.findUser.mockResolvedValue(persistedUser(role, location));
}

describe("loadShellAccess", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.findUser.mockReset();
    mocks.findLocation.mockReset();
  });

  it.each([
    ["ADMIN", null, "All locations", null, "all-locations"],
    ["STOCK_STAFF", stockRoom, "Stock Room (SR)", stockRoom.id, "location"],
    ["BRANCH_STAFF", qcBranch, "Quezon City (QC)", qcBranch.id, "location"],
    ["ACCOUNTING_STAFF", null, "Business-wide", null, "business-wide"],
  ] satisfies ReadonlyArray<
    readonly [UserRole, LocationInput | null, string, string | null, string]
  >)(
    "derives exact persisted shell access for %s",
    async (role, location, label, locationId, kind) => {
      signInAs(role, location);

      const result = await loadShellAccess(new Headers());

      expect(result.authenticated).toBe(true);
      if (!result.authenticated) {
        throw new Error("Expected authenticated shell access");
      }
      expect(result.identity).toEqual({
        name: `${role} User`,
        email: `${role.toLowerCase()}@example.com`,
        role,
      });
      expect(result.scope).toMatchObject({ kind, label, locationId });
      expect(result.menu.map((item) => item.label)).toEqual(expectedMenu[role]);
      expect(result.capabilities).toEqual(expectedCapabilities[role]);
    },
  );

  it("validates and renders a persisted Admin location selection", async () => {
    signInAs("ADMIN", null);
    mocks.findLocation.mockResolvedValue(qcBranch);
    const headers = new Headers({
      cookie: "chezcar-admin-location-scope=location-qc",
    });

    const result = await loadShellAccess(headers);

    expect(result.authenticated).toBe(true);
    if (!result.authenticated) {
      throw new Error("Expected authenticated shell access");
    }
    expect(result.scope).toEqual({
      kind: "location",
      label: "Quezon City (QC)",
      locationId: "location-qc",
      code: "QC",
    });
    expect(mocks.findLocation).toHaveBeenCalledWith({
      where: { id: "location-qc", isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        isActive: true,
      },
    });
  });

  it("does not convert Accounting's Business-wide label into inventory access", async () => {
    signInAs("ACCOUNTING_STAFF", null);

    const result = await loadShellAccess(new Headers());

    expect(result.authenticated).toBe(true);
    if (!result.authenticated) {
      throw new Error("Expected authenticated shell access");
    }
    expect(result.scope).toEqual({
      kind: "business-wide",
      label: "Business-wide",
      locationId: null,
      code: null,
    });
    expect(result.capabilities).not.toContain("inventory:view");
    expect(result.menu.map((item) => item.href)).not.toContain("/inventory");
  });

  it.each([
    ["missing user", null],
    ["inactive user", persistedUser("BRANCH_STAFF", qcBranch, "INACTIVE")],
    ["Stock Staff without SR", persistedUser("STOCK_STAFF", null)],
    ["Branch Staff with inactive branch", persistedUser("BRANCH_STAFF", { ...qcBranch, isActive: false })],
    ["Accounting with a location", persistedUser("ACCOUNTING_STAFF", qcBranch)],
  ])("fails closed for %s", async (_description, user) => {
    mocks.getSession.mockResolvedValue({ user: { id: "persisted-user" } });
    mocks.findUser.mockResolvedValue(user);

    await expect(loadShellAccess(new Headers())).resolves.toEqual({
      authenticated: false,
      identity: null,
      scope: null,
      capabilities: [],
      menu: [],
    });
  });

  it("returns anonymous no-menu data for unauthenticated auth-page loading", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(loadShellAccess(new Headers())).resolves.toEqual({
      authenticated: false,
      identity: null,
      scope: null,
      capabilities: [],
      menu: [],
    });
    expect(mocks.findUser).not.toHaveBeenCalled();
  });
});
