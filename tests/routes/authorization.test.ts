import type { LocationType, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
  listInventory: vi.fn(),
  listProducts: vi.fn(),
  getDashboardSummary: vi.fn(),
  listCustomers: vi.fn(),
  listCustomerOrders: vi.fn(),
  notificationFindMany: vi.fn(),
  requireCapability: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    notification: { findMany: mocks.notificationFindMany },
  },
}));
vi.mock("@/lib/server/authorization", async () => {
  const actual = await import("../../lib/server/authorization");
  mocks.requireCapability.mockImplementation(actual.requireCapability);

  return { ...actual, requireCapability: mocks.requireCapability };
});
vi.mock("@/lib/mock-data", () => ({
  dashboardStats: { marker: "protected-dashboard" },
  lowStock: [{ marker: "protected-stock" }],
  notifications: [{ marker: "protected-notification" }],
  orders: [{ marker: "protected-order" }],
  customers: [{ marker: "protected-customer" }],
}));
vi.mock("@/lib/server/catalog", async () => {
  const { z } = await import("zod");

  return {
    inventoryListQuerySchema: z.object({
      page: z.coerce.number().int().min(1).default(1),
      location: z.string().default("all"),
    }),
    parseInventoryListQuery: (searchParams: URLSearchParams) =>
      z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          location: z.string().default("all"),
        })
        .parse(Object.fromEntries(searchParams)),
    productListQuerySchema: z.object({
      page: z.coerce.number().int().min(1).default(1),
    }),
    listInventory: mocks.listInventory,
    listProducts: mocks.listProducts,
  };
});
vi.mock("../../lib/server/services/customer-sales", () => ({
  customerListQuerySchema: { parse: () => ({ page: 1, pageSize: 10, name: "", status: "all" }) },
  getDashboardSummary: mocks.getDashboardSummary,
  listCustomers: mocks.listCustomers,
  listCustomerOrders: mocks.listCustomerOrders,
  CustomerSalesError: class CustomerSalesError extends Error {
    constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
  },
}));

import { GET as getCustomerOrders } from "../../app/api/customer-orders/route";
import { GET as getCustomers } from "../../app/api/customers/route";
import { GET as getDashboard } from "../../app/api/dashboard/route";
import { GET as getInventory } from "../../app/api/inventory/route";
import { GET as getProducts } from "../../app/api/products/route";

type PersistedLocation = {
  id: string;
  code: string;
  type: LocationType;
  isActive: boolean;
};

type RouteSpec = {
  name: string;
  path: string;
  capability: string;
  handler: (request: Request) => Promise<Response>;
  allowed: readonly [UserRole, PersistedLocation | null];
  denied: readonly [UserRole, PersistedLocation | null];
  protectedMarker: string;
  service: ReturnType<typeof vi.fn> | null;
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

const roleAccess = {
  ADMIN: { id: "role-admin", isOwner: true, permissions: [] },
  STOCK_STAFF: { id: "role-stock-staff", isOwner: false, permissions: ["customers:view", "products:view", "inventory:view"] },
  BRANCH_STAFF: { id: "role-branch-staff", isOwner: false, permissions: ["dashboard:view", "customers:view", "inventory:view"] },
  ACCOUNTING_STAFF: { id: "role-accounting-staff", isOwner: false, permissions: ["locations:all", "dashboard:view", "customer-orders:view"] },
} as const;

const routes: readonly RouteSpec[] = [
  {
    name: "dashboard",
    path: "/api/dashboard",
    capability: "dashboard:view",
    handler: getDashboard,
    allowed: ["ACCOUNTING_STAFF", null],
    denied: ["STOCK_STAFF", stockRoom],
    protectedMarker: "protected-dashboard",
    service: null,
  },
  {
    name: "customers",
    path: "/api/customers",
    capability: "customers:view",
    handler: getCustomers,
    allowed: ["STOCK_STAFF", stockRoom],
    denied: ["ACCOUNTING_STAFF", null],
    protectedMarker: "protected-customer",
    service: mocks.listCustomers,
  },
  {
    name: "customer orders",
    path: "/api/customer-orders",
    capability: "customer-orders:view",
    handler: getCustomerOrders,
    allowed: ["ACCOUNTING_STAFF", null],
    denied: ["BRANCH_STAFF", stockRoom],
    protectedMarker: "protected-order",
    service: mocks.listCustomerOrders,
  },
  {
    name: "products",
    path: "/api/products?page=1",
    capability: "products:view",
    handler: getProducts,
    allowed: ["STOCK_STAFF", stockRoom],
    denied: ["ACCOUNTING_STAFF", null],
    protectedMarker: "protected-product",
    service: mocks.listProducts,
  },
  {
    name: "inventory",
    path: "/api/inventory?page=1&location=all",
    capability: "inventory:view",
    handler: getInventory,
    allowed: ["BRANCH_STAFF", branch],
    denied: ["ACCOUNTING_STAFF", null],
    protectedMarker: "protected-inventory",
    service: mocks.listInventory,
  },
];

function persistedUser(
  role: UserRole,
  location: PersistedLocation | null,
) {
  const accessRole = roleAccess[role];
  return {
    id: `user-${role.toLowerCase()}`,
    role,
    roleDefinitionId: accessRole.id,
    accessRole: { isOwner: accessRole.isOwner, permissions: accessRole.permissions },
    status: "ACTIVE",
    locationAssignments: location?.isActive ? [{ locationId: location.id }] : [],
  };
}

function authenticate(role: UserRole, location: PersistedLocation | null) {
  mocks.getSession.mockResolvedValue({
    user: { id: `user-${role.toLowerCase()}`, role: "ADMIN", locationId: "forged" },
  });
  mocks.findUnique.mockResolvedValue(persistedUser(role, location));
}

describe.each(routes)("$name authorization", (route) => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.findUnique.mockReset();
    mocks.listInventory.mockReset();
    mocks.listProducts.mockReset();
    mocks.getDashboardSummary.mockReset();
    mocks.listCustomers.mockReset();
    mocks.listCustomerOrders.mockReset();
    mocks.notificationFindMany.mockReset();
    mocks.requireCapability.mockClear();
    mocks.listProducts.mockResolvedValue({
      data: [{ marker: "protected-product" }],
    });
    mocks.listInventory.mockResolvedValue({
      data: [{ marker: "protected-inventory" }],
    });
    mocks.notificationFindMany.mockResolvedValue([]);
    mocks.getDashboardSummary.mockResolvedValue({ marker: "protected-dashboard" });
    mocks.listCustomers.mockResolvedValue([{ marker: "protected-customer" }]);
    mocks.listCustomerOrders.mockResolvedValue([{ marker: "protected-order" }]);
  });

  it("returns only the stable 401 envelope when the session is missing", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await route.handler(new Request(`http://localhost${route.path}`));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Authentication required" },
    });
    expect(JSON.stringify(body)).not.toContain(route.protectedMarker);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.listProducts).not.toHaveBeenCalled();
    expect(mocks.listInventory).not.toHaveBeenCalled();
  });

  it("returns only the stable 403 envelope for denied persisted access", async () => {
    authenticate(...route.denied);

    const response = await route.handler(new Request(`http://localhost${route.path}`));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      },
    });
    expect(JSON.stringify(body)).not.toContain(route.protectedMarker);
    expect(mocks.listProducts).not.toHaveBeenCalled();
    expect(mocks.listInventory).not.toHaveBeenCalled();
  });

  it("returns protected data for an allowed persisted role and location", async () => {
    authenticate(...route.allowed);

    const response = await route.handler(new Request(`http://localhost${route.path}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).toContain(route.protectedMarker);
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      expect.any(Headers),
      route.capability,
    );
    if (route.service) {
      expect(route.service).toHaveBeenCalledOnce();
    }
  });
});

it("allows owner Admin to list products", async () => {
  mocks.getSession.mockReset();
  mocks.findUnique.mockReset();
  mocks.listProducts.mockReset();
  mocks.requireCapability.mockClear();
  mocks.listProducts.mockResolvedValue({
    data: [{ marker: "protected-product" }],
  });
  authenticate("ADMIN", null);

  const response = await getProducts(
    new Request("http://localhost/api/products?page=1"),
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(JSON.stringify(body)).toContain("protected-product");
  expect(mocks.requireCapability).toHaveBeenCalledWith(
    expect.any(Headers),
    "products:view",
  );
  expect(mocks.listProducts).toHaveBeenCalledOnce();
});

it("authorizes products before parsing filters or executing its service", async () => {
  mocks.listProducts.mockClear();
  mocks.requireCapability.mockClear();
  mocks.getSession.mockResolvedValue(null);

  const response = await getProducts(
    new Request("http://localhost/api/products?page=not-a-number"),
  );

  expect(response.status).toBe(401);
  expect(mocks.listProducts).not.toHaveBeenCalled();
});

it("authorizes inventory before parsing hostile filters or executing its service", async () => {
  mocks.listInventory.mockClear();
  mocks.requireCapability.mockClear();
  mocks.getSession.mockResolvedValue(null);

  const response = await getInventory(
    new Request("http://localhost/api/inventory?page=not-a-number&location=SR"),
  );

  expect(response.status).toBe(401);
  expect(mocks.requireCapability).toHaveBeenCalledWith(
    expect.any(Headers),
    "inventory:view",
  );
  expect(mocks.listInventory).not.toHaveBeenCalled();
});

it("returns a data-free 401 for an inactive persisted inventory principal", async () => {
  mocks.getSession.mockResolvedValue({ user: { id: "inactive-user" } });
  mocks.findUnique.mockResolvedValue({
    ...persistedUser("BRANCH_STAFF", branch),
    status: "INACTIVE",
  });

  const response = await getInventory(
    new Request("http://localhost/api/inventory?location=all"),
  );
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body).toEqual({
    error: { code: "UNAUTHENTICATED", message: "Active user account required" },
  });
  expect(JSON.stringify(body)).not.toContain("protected-inventory");
  expect(mocks.listInventory).not.toHaveBeenCalled();
});

it("returns a data-free 401 for a revoked inventory session", async () => {
  mocks.getSession.mockResolvedValue(null);

  const response = await getInventory(
    new Request("http://localhost/api/inventory?location=all"),
  );
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body).toEqual({
    error: { code: "UNAUTHENTICATED", message: "Authentication required" },
  });
  expect(JSON.stringify(body)).not.toContain("protected-inventory");
  expect(mocks.listInventory).not.toHaveBeenCalled();
});
