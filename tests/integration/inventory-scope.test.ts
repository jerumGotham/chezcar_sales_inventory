import type { PrismaClient, User } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

import { DISPOSABLE_DATABASE_CONFIG, withDisposableDatabase } from "../helpers/database";
import {
  createAuthFixture,
  createLocationFixture,
  createUserFixture,
  type AuthFixture,
} from "../helpers/factories";
import { createRequest, type RequestQueryEntry } from "../helpers/requests";

const authMocks = vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";

  return { getSession: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: authMocks.getSession } },
}));
vi.mock("@/lib/catalog", async () => import("../../lib/catalog"));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/policy/access", async () =>
  import("../../lib/server/policy/access"),
);
vi.mock("@/lib/server/authorization", async () =>
  import("../../lib/server/authorization"),
);
vi.mock("@/lib/server/catalog", async () => import("../../lib/server/catalog"));

type InventoryBody = {
  data?: Array<{ itemCode: string; location: string }>;
  error?: { code: string; message: string };
};

function markerCodes(body: InventoryBody) {
  return body.data?.map((row) => row.itemCode).sort() ?? [];
}

function inventoryRequest(user: User | null, query: readonly RequestQueryEntry[]) {
  authMocks.getSession.mockResolvedValue(
    user ? { user: { id: user.id, role: "ADMIN", locationId: "forged" } } : null,
  );

  return createRequest("/api/inventory", {
    query,
    headers: user ? { "x-test-principal": user.id } : undefined,
  });
}

async function seedInventoryMarkers(prisma: PrismaClient, fixture: AuthFixture) {
  const markers = [
    ["MARKER-SR", fixture.locations.stockRoom.id],
    ["MARKER-QC", fixture.locations.branches.QC.id],
    ["MARKER-BL", fixture.locations.branches.BL.id],
  ] as const;

  for (const [itemCode, locationId] of markers) {
    await prisma.product.create({
      data: {
        itemCode,
        name: itemCode,
        status: "ACTIVE",
        inventoryBalances: {
          create: {
            locationId,
            onHand: 10,
            unitCost: 1,
          },
        },
      },
    });
  }
}

describe("inventory persisted location scope", () => {
  it("keeps all four roles inside persisted scope under hostile direct requests", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "inventory-scope",
      });
      await seedInventoryMarkers(prisma, fixture);

      const inactiveBranch = await createLocationFixture(prisma, {
        code: "INACTIVE-BRANCH",
        name: "Inactive Branch",
        type: "BRANCH",
        isActive: false,
      });
      // Missing and inactive authoritative assignments must fail closed.
      const missingAssignment = await createUserFixture(prisma, fixture.locations, {
        namespace: "inventory-scope",
        key: "missing-assignment",
        role: "BRANCH_STAFF",
        locationId: null,
        allowInvalidAssignment: true,
      });
      const inactiveAssignment = await createUserFixture(prisma, fixture.locations, {
        namespace: "inventory-scope",
        key: "inactive-assignment",
        role: "BRANCH_STAFF",
        locationId: inactiveBranch.id,
        allowInvalidAssignment: true,
      });
      const { GET } = await import("../../app/api/inventory/route");

      for (const query of [
        [["location", "all"]],
        [["location", "QC Branch"]],
      ] as const) {
        const response = await GET(inventoryRequest(fixture.users.branchStaff, query));
        const body = (await response.json()) as InventoryBody;

        expect(response.status).toBe(200);
        expect(markerCodes(body)).toEqual(["MARKER-QC"]);
      }

      for (const location of ["BL Branch", "Stock Room"]) {
        const response = await GET(
          inventoryRequest(fixture.users.branchStaff, [["location", location]]),
        );
        expect(response.status).toBe(403);
        expect(markerCodes((await response.json()) as InventoryBody)).toEqual([]);
      }

      const stockAll = await GET(
        inventoryRequest(fixture.users.stockStaff, [["location", "all"]]),
      );
      expect(stockAll.status).toBe(200);
      expect(markerCodes((await stockAll.json()) as InventoryBody)).toEqual(["MARKER-SR"]);

      for (const location of ["QC Branch", "BL Branch"]) {
        const response = await GET(
          inventoryRequest(fixture.users.stockStaff, [["location", location]]),
        );
        expect(response.status).toBe(403);
        expect(markerCodes((await response.json()) as InventoryBody)).toEqual([]);
      }

      const adminAll = await GET(
        inventoryRequest(fixture.users.admin, [["location", "all"]]),
      );
      expect(markerCodes((await adminAll.json()) as InventoryBody)).toEqual([
        "MARKER-BL",
        "MARKER-QC",
        "MARKER-SR",
      ]);

      const adminBranch = await GET(
        inventoryRequest(fixture.users.admin, [["location", "BL Branch"]]),
      );
      expect(markerCodes((await adminBranch.json()) as InventoryBody)).toEqual([
        "MARKER-BL",
      ]);

      for (const query of [
        [
          ["location", "all"],
          ["location", "BL Branch"],
        ],
        [
          ["location", "BL Branch"],
          ["location", "all"],
        ],
      ] as const) {
        const response = await GET(inventoryRequest(fixture.users.admin, query));
        expect(response.status).toBe(400);
        expect(markerCodes((await response.json()) as InventoryBody)).toEqual([]);
      }

      for (const deniedUser of [
        fixture.users.accountingStaff,
        missingAssignment,
        inactiveAssignment,
      ]) {
        const response = await GET(
          inventoryRequest(deniedUser, [
            ["location", "all"],
            ["itemCode", "MARKER"],
          ]),
        );
        const body = (await response.json()) as InventoryBody;

        expect(response.status).toBe(403);
        expect(body.error?.code).toBe("FORBIDDEN");
        expect(markerCodes(body)).toEqual([]);
        expect(JSON.stringify(body)).not.toContain("MARKER-");
      }
    });
  }, 30_000);
});

afterAll(async () => {
  expect(process.env.DATABASE_URL).toBe(DISPOSABLE_DATABASE_CONFIG.databaseUrl);
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
