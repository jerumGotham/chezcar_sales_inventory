import type { LocationType, UserRole, UserStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/server/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));
vi.mock("@/lib/server/policy/access", () =>
  import("./lib/server/policy/access"),
);

import { proxy } from "./proxy";

type PersistedLocation = {
  id: string;
  code: string;
  type: LocationType;
  isActive: boolean;
};

const stockRoom: PersistedLocation = {
  id: "location-sr",
  code: "SR",
  type: "WAREHOUSE",
  isActive: true,
};

const branch: PersistedLocation = {
  id: "location-qc",
  code: "QC",
  type: "BRANCH",
  isActive: true,
};

const assignmentByRole = {
  ADMIN: null,
  STOCK_STAFF: stockRoom,
  BRANCH_STAFF: branch,
  ACCOUNTING_STAFF: null,
} as const satisfies Record<UserRole, PersistedLocation | null>;

const pageAccess = {
  ADMIN: [
    "/dashboard",
    "/customers",
    "/customer-orders/order-17",
    "/products",
    "/inventory/receive",
    "/users",
    "/users/roles",
    "/branches",
  ],
  STOCK_STAFF: [
    "/dashboard",
    "/customers",
    "/customer-orders/order-17",
    "/products",
    "/inventory/transfer",
  ],
  BRANCH_STAFF: [
    "/dashboard",
    "/customers",
    "/customer-orders/order-17",
    "/inventory",
  ],
  ACCOUNTING_STAFF: [
    "/dashboard",
    "/customers",
    "/customer-orders/order-17",
  ],
} as const satisfies Record<UserRole, readonly string[]>;

const roleAccess = {
  ADMIN: { id: "role-admin", scope: "OWNER", permissions: [] },
  STOCK_STAFF: { id: "role-stock-staff", scope: "STOCK_ROOM", permissions: ["dashboard:view", "customers:view", "customer-orders:view", "products:view", "inventory:view"] },
  BRANCH_STAFF: { id: "role-branch-staff", scope: "BRANCH", permissions: ["dashboard:view", "customers:view", "customer-orders:view", "inventory:view"] },
  ACCOUNTING_STAFF: { id: "role-accounting-staff", scope: "BUSINESS_WIDE", permissions: ["dashboard:view", "customers:view", "customer-orders:view"] },
} as const;

function persistedUser(
  role: UserRole,
  location: PersistedLocation | null,
  status: UserStatus = "ACTIVE",
) {
  const accessRole = roleAccess[role];
  return {
    id: `user-${role.toLowerCase()}`,
    role,
    roleDefinitionId: accessRole.id,
    accessRole: { scope: accessRole.scope, permissions: accessRole.permissions },
    status,
    locationId: location?.id ?? null,
    location,
  };
}

function authenticate(role: UserRole) {
  mocks.getSession.mockResolvedValue({
    user: { id: `user-${role.toLowerCase()}`, role: "ADMIN", locationId: "forged" },
  });
  mocks.findUser.mockResolvedValue(
    persistedUser(role, assignmentByRole[role]),
  );
}

function authenticateWithPermissions(
  role: UserRole,
  permissions: readonly string[],
) {
  mocks.getSession.mockResolvedValue({ user: { id: `user-${role.toLowerCase()}` } });
  mocks.findUser.mockResolvedValue({
    ...persistedUser(role, assignmentByRole[role]),
    accessRole: { ...roleAccess[role], permissions },
  });
}

async function request(path: string) {
  return proxy(new NextRequest(`http://localhost${path}`));
}

function redirectPath(response: Response): string | null {
  const location = response.headers.get("location");
  if (!location) {
    return null;
  }

  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

describe("page session routing", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.findUser.mockReset();
  });

  it.each([
    ["missing", null, null],
    ["expired", null, null],
    ["revoked", null, null],
    [
      "inactive",
      { user: { id: "inactive-user" } },
      persistedUser("BRANCH_STAFF", branch, "INACTIVE"),
    ],
  ])("sends a %s session to sign-in with a local callback", async (_state, session, user) => {
    mocks.getSession.mockResolvedValue(session);
    mocks.findUser.mockResolvedValue(user);

    const response = await request("/inventory?location=QC&page=2");

    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe(
      "/sign-in?callbackUrl=%2Finventory%3Flocation%3DQC%26page%3D2",
    );
  });

  it("does not query persisted users when no valid session exists", async () => {
    mocks.getSession.mockResolvedValue(null);

    await request("/products");

    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("rejects a protocol-relative callback path", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await request("//attacker.example/protected?record=secret-17");

    expect(redirectPath(response)).toBe(
      "/sign-in?callbackUrl=%2Fdashboard",
    );
    expect(response.headers.get("location")).not.toContain("attacker.example");
    expect(response.headers.get("location")).not.toContain("secret-17");
  });
});

describe("persisted page capability routing", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.findUser.mockReset();
  });

  it.each(Object.entries(pageAccess) as Array<[UserRole, readonly string[]]>) (
    "allows every centrally permitted page for %s",
    async (role, paths) => {
      authenticate(role);

      for (const path of paths) {
        const response = await request(path);

        expect(response.status, path).toBe(200);
        expect(response.headers.get("x-middleware-next"), path).toBe("1");
      }
    },
  );

  it.each([
    ["BRANCH_STAFF", "/products"],
    ["ACCOUNTING_STAFF", "/products/item-secret"],
    ["ACCOUNTING_STAFF", "/inventory?location=SR&record=stock-secret"],
    ["STOCK_STAFF", "/users?email=protected@example.com"],
    ["BRANCH_STAFF", "/users/user-secret"],
  ] satisfies ReadonlyArray<readonly [UserRole, string]>) (
    "redirects forbidden %s access to a fixed data-free denial URL",
    async (role, path) => {
      authenticate(role);

      const response = await request(path);

      expect(response.status).toBe(307);
      expect(redirectPath(response)).toBe("/access-denied");
      expect(response.headers.get("location")).not.toContain("secret");
      expect(response.headers.get("location")).not.toContain("location");
      expect(response.headers.get("location")).not.toContain("email");
    },
  );

  it("produces the same denial regardless of hostile query ordering", async () => {
    authenticate("ACCOUNTING_STAFF");

    const first = await request("/inventory?record=secret-17&location=SR");
    const second = await request("/inventory?location=SR&record=secret-17");

    expect(first.headers.get("location")).toBe(second.headers.get("location"));
    expect(redirectPath(first)).toBe("/access-denied");
  });

  it("treats an invalid persisted assignment as authenticated but forbidden", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "invalid-stock-user" } });
    mocks.findUser.mockResolvedValue(persistedUser("STOCK_STAFF", branch));

    const response = await request("/dashboard");

    expect(redirectPath(response)).toBe("/access-denied");
  });

  it("allows the fixed denial page without evaluating a business capability", async () => {
    authenticate("ACCOUNTING_STAFF");

    const response = await request("/access-denied?record=ignored");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("uses the shared orders and sales gate only for the base page", async () => {
    authenticateWithPermissions("ACCOUNTING_STAFF", ["sales:view"]);

    expect((await request("/customer-orders")).status).toBe(200);
    expect((await request("/customer-orders/")).status).toBe(200);
    for (const path of [
      "/customer-orders/create",
      "/customer-orders/order-17",
      "/customer-orders/order-17/release",
    ]) {
      expect(redirectPath(await request(path)), path).toBe("/access-denied");
    }
  });
});
