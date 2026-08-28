import type { PrismaClient, User } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  DISPOSABLE_DATABASE_CONFIG,
  withDisposableDatabase,
} from "../helpers/database";
import {
  createAuthFixture,
  createLocationFixture,
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
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/policy/access", async () =>
  import("../../lib/server/policy/access"),
);
vi.mock("@/lib/server/authorization", async () =>
  import("../../lib/server/authorization"),
);
vi.mock("@/lib/server/inventory-availability", async () =>
  import("../../lib/server/inventory-availability"),
);

type AvailabilityBody = {
  data?: Array<{
    product: { itemCode: string };
    location: { code: string };
    onHand: number;
    reserved: number;
    available: number;
    status: string;
  }>;
  filterOptions?: { locations: Array<{ code: string }> };
  error?: { code: string };
};

function availabilityRequest(
  user: User | null,
  query: readonly RequestQueryEntry[] = [],
) {
  authMocks.getSession.mockResolvedValue(
    user ? { user: { id: user.id, role: "ADMIN", locationId: "forged" } } : null,
  );

  return createRequest("/api/inventory/availability", {
    query,
    headers: user ? { "x-test-principal": user.id } : undefined,
  });
}

async function createAvailabilityProduct(
  prisma: PrismaClient,
  input: {
    itemCode: string;
    name: string;
    category: string;
    reorderLevel: number;
    balances: Array<{
      locationId: string;
      onHand: number;
      reserved: number;
    }>;
  },
) {
  await prisma.product.create({
    data: {
      itemCode: input.itemCode,
      name: input.name,
      category: input.category,
      reorderLevel: input.reorderLevel,
      inventoryBalances: {
        create: input.balances.map((balance) => ({ ...balance, unitCost: 1 })),
      },
    },
  });
}

describe("live inventory availability", () => {
  it("returns active scoped balances, derived availability, dynamic filters, and denies Accounting", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "inventory-availability",
      });
      const extraLocation = await createLocationFixture(prisma, {
        code: "AV-EXTRA",
        name: "Availability Extra Branch",
        type: "BRANCH",
      });
      const inactiveLocation = await createLocationFixture(prisma, {
        code: "AV-INACTIVE",
        name: "Inactive Availability Branch",
        type: "BRANCH",
        isActive: false,
      });
      const nonOperationalWarehouse = await createLocationFixture(prisma, {
        code: "AV-WAREHOUSE",
        name: "Non-operational Availability Warehouse",
        type: "WAREHOUSE",
      });

      await createAvailabilityProduct(prisma, {
        itemCode: "AVAIL-FILM",
        name: "Availability Film",
        category: "Film",
        reorderLevel: 1,
        balances: [
          { locationId: fixture.locations.stockRoom.id, onHand: 10, reserved: 2 },
          { locationId: fixture.locations.branches.QC.id, onHand: 5, reserved: 4 },
          { locationId: extraLocation.id, onHand: 1, reserved: 1 },
          { locationId: inactiveLocation.id, onHand: 99, reserved: 0 },
          { locationId: nonOperationalWarehouse.id, onHand: 77, reserved: 0 },
        ],
      });
      await createAvailabilityProduct(prisma, {
        itemCode: "AVAIL-AUDIO",
        name: "Searchable Audio Unit",
        category: "Audio",
        reorderLevel: 2,
        balances: [
          { locationId: fixture.locations.branches.QC.id, onHand: 8, reserved: 1 },
        ],
      });

      const { GET } = await import("../../app/api/inventory/availability/route");
      const adminResponse = await GET(
        availabilityRequest(fixture.users.admin),
      );
      const adminBody = (await adminResponse.json()) as AvailabilityBody;

      expect(adminResponse.status).toBe(200);
      expect(adminBody.data?.map((row) => row.location.code)).toContain("AV-EXTRA");
      expect(adminBody.data?.map((row) => row.location.code)).not.toContain("AV-INACTIVE");
      expect(adminBody.data?.map((row) => row.location.code)).not.toContain("AV-WAREHOUSE");
      expect(adminBody.filterOptions?.locations.map((location) => location.code)).toContain("AV-EXTRA");
      expect(adminBody.filterOptions?.locations.map((location) => location.code)).not.toContain("AV-INACTIVE");
      expect(adminBody.filterOptions?.locations.map((location) => location.code)).not.toContain("AV-WAREHOUSE");
      expect(
        adminBody.data?.find(
          (row) => row.product.itemCode === "AVAIL-FILM" && row.location.code === "QC",
        ),
      ).toMatchObject({
        onHand: 5,
        reserved: 4,
        available: 1,
        status: "Low Stock",
      });

      const branchResponse = await GET(
        availabilityRequest(fixture.users.branchStaff, [
          ["location", "AV-EXTRA"],
        ]),
      );
      const branchBody = (await branchResponse.json()) as AvailabilityBody;
      expect(branchResponse.status).toBe(200);
      expect(new Set(branchBody.data?.map((row) => row.location.code))).toEqual(
        new Set(["QC"]),
      );
      expect(branchBody.filterOptions?.locations.map((location) => location.code)).toEqual(["QC"]);

      const stockResponse = await GET(
        availabilityRequest(fixture.users.stockStaff, [["location", "QC"]]),
      );
      const stockBody = (await stockResponse.json()) as AvailabilityBody;
      expect(stockResponse.status).toBe(200);
      expect(new Set(stockBody.data?.map((row) => row.location.code))).toEqual(
        new Set(["SR"]),
      );

      const filteredResponse = await GET(
        availabilityRequest(fixture.users.admin, [
          ["search", "audio"],
          ["location", "QC"],
          ["status", "In Stock"],
        ]),
      );
      const filteredBody = (await filteredResponse.json()) as AvailabilityBody;
      expect(filteredResponse.status).toBe(200);
      expect(filteredBody.data).toHaveLength(1);
      expect(filteredBody.data?.[0]).toMatchObject({
        product: { itemCode: "AVAIL-AUDIO" },
        location: { code: "QC" },
        available: 7,
        status: "In Stock",
      });

      const accountingResponse = await GET(
        availabilityRequest(fixture.users.accountingStaff),
      );
      const accountingBody = (await accountingResponse.json()) as AvailabilityBody;
      expect(accountingResponse.status).toBe(403);
      expect(accountingBody.error?.code).toBe("FORBIDDEN");
      expect(accountingBody.data).toBeUndefined();
    });
  }, 60_000);
});

afterAll(async () => {
  expect(process.env.DATABASE_URL).toBe(DISPOSABLE_DATABASE_CONFIG.databaseUrl);
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
