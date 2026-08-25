import type { LocationType, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
  listProducts: vi.fn(),
  requireCapability: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/server/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
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
    productListQuerySchema: z.object({
      page: z.coerce.number().int().min(1).default(1),
    }),
    listProducts: mocks.listProducts,
  };
});

import { GET as getCustomerOrders } from "../../app/api/customer-orders/route";
import { GET as getCustomers } from "../../app/api/customers/route";
import { GET as getDashboard } from "../../app/api/dashboard/route";
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

const routes: readonly RouteSpec[] = [
  {
    name: "dashboard",
    path: "/api/dashboard",
    capability: "dashboard:view",
    handler: getDashboard,
    allowed: ["ACCOUNTING_STAFF", null],
    denied: ["ADMIN", branch],
    protectedMarker: "protected-dashboard",
  },
  {
    name: "customers",
    path: "/api/customers",
    capability: "customers:view",
    handler: getCustomers,
    allowed: ["BRANCH_STAFF", branch],
    denied: ["STOCK_STAFF", branch],
    protectedMarker: "protected-customer",
  },
  {
    name: "customer orders",
    path: "/api/customer-orders",
    capability: "customer-orders:view",
    handler: getCustomerOrders,
    allowed: ["ACCOUNTING_STAFF", null],
    denied: ["BRANCH_STAFF", stockRoom],
    protectedMarker: "protected-order",
  },
  {
    name: "products",
    path: "/api/products?page=1",
    capability: "products:view",
    handler: getProducts,
    allowed: ["STOCK_STAFF", stockRoom],
    denied: ["ACCOUNTING_STAFF", null],
    protectedMarker: "protected-product",
  },
];

function persistedUser(
  role: UserRole,
  location: PersistedLocation | null,
) {
  return {
    id: `user-${role.toLowerCase()}`,
    role,
    status: "ACTIVE",
    locationId: location?.id ?? null,
    location,
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
    mocks.listProducts.mockReset();
    mocks.requireCapability.mockClear();
    mocks.listProducts.mockResolvedValue({
      data: [{ marker: "protected-product" }],
    });
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
  });

  it("returns only the stable 403 envelope for denied persisted access", async () => {
    authenticate(...route.denied);

    const response = await route.handler(new Request(`http://localhost${route.path}`));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: {
        code: "FORBIDDEN",
        message:
          route.name === "products"
            ? "Insufficient permissions"
            : "Invalid persisted access assignment",
      },
    });
    expect(JSON.stringify(body)).not.toContain(route.protectedMarker);
    expect(mocks.listProducts).not.toHaveBeenCalled();
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
  });
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
