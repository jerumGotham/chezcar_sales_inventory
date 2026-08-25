import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/auth", async () => import("../../lib/server/auth"));
vi.mock("@/lib/server/policy/access", async () =>
  import("../../lib/server/policy/access"),
);
vi.mock("@/lib/server/authorization", async () =>
  import("../../lib/server/authorization"),
);
vi.mock("@/lib/server/internal-user-auth", async () =>
  import("../../lib/server/internal-user-auth"),
);
vi.mock("@/lib/server/services/users", async () =>
  import("../../lib/server/services/users"),
);
vi.mock("@/lib/contracts/users", async () => import("../../lib/contracts/users"));

import { auth } from "../../lib/server/auth";
import { prisma as sharedPrisma } from "../../lib/server/prisma";
import { withDisposableDatabase } from "../helpers/database";
import {
  createAuthFixture,
  createLocationFixtures,
  createUserFixture,
  type LocationFixtures,
} from "../helpers/factories";
import { createRequest } from "../helpers/requests";

const OWNER_EMAIL = "owner-admin@auth-fixture.example.test";
const OWNER_PASSWORD = "Owner-Temp-Pass-1";

type UsersRoute = typeof import("../../app/api/users/route");
let usersRoute: UsersRoute;

async function loadRoutes() {
  usersRoute = await import("../../app/api/users/route");
}

/**
 * Better Auth 1.6.23 signs its session cookie, so faithful owner request
 * headers require a real sign-in round-trip against the public instance.
 */
async function signInUser(
  prisma: PrismaClient,
  email: string,
  password: string,
) {
  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  const sessionCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="));
  expect(sessionCookie).toBeDefined();

  return new Headers({ cookie: sessionCookie ?? "" });
}

async function grantCredential(
  prisma: PrismaClient,
  userId: string,
  password: string,
) {
  const authContext = await auth.$context;
  const passwordHash = await authContext.password.hash(password);
  await prisma.account.create({
    data: {
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    },
  });
}

async function signInOwner(prisma: PrismaClient) {
  const fixture = await createAuthFixture(prisma, { namespace: "um-owner" });
  await grantCredential(prisma, fixture.users.admin.id, OWNER_PASSWORD);
  const ownerHeaders = await signInUser(
    prisma,
    OWNER_EMAIL,
    OWNER_PASSWORD,
  );
  return { fixture, ownerHeaders };
}

function usersRequest(
  path: string,
  options: {
    method?: string;
    headers?: HeadersInit;
    body?: unknown;
  } = {},
) {
  return createRequest(path, {
    method: options.method,
    headers: options.headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

type UserListBody = {
  data?: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    isOwner: boolean;
    location: { id: string; code: string; type: string } | null;
    credentialSetupRequired: boolean;
  }>;
  meta?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    totalStaff: number;
    activeStaff: number;
    inactiveStaff: number;
  };
  error?: { code: string; message: string };
};

type MutationBody = {
  data?: {
    id: string;
    email: string;
    role: string;
    status: string;
    isOwner: boolean;
    locationId?: string | null;
    location: { id: string; code: string; type: string } | null;
    credentialSetupRequired: boolean;
  };
  error?: { code: string; message: string };
};

describe("user management list and create", () => {
  afterEach(async () => {
    await sharedPrisma.$disconnect();
  });

  it("lists paginated safe DTOs with an immutable owner marker and staff-only counts", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      // 4 canonical staff + 8 extra branch staff + 1 admin = 13 rows.
      const { ownerHeaders } = await signInOwner(prisma);
      const locations = await createLocationFixtures(prisma);
      for (let index = 1; index <= 8; index += 1) {
        await createUserFixture(prisma, locations, {
          namespace: "um-list",
          key: `b${String(index).padStart(2, "0")}`,
          role: "BRANCH_STAFF",
          locationId:
            index <= 4 ? locations.branches.BL.id : locations.branches.VC.id,
        });
      }

      await loadRoutes();

      const page1Response = await usersRoute.GET(
        usersRequest("/api/users?page=1", { headers: ownerHeaders }),
      );
      expect(page1Response.status).toBe(200);
      const page1 = (await page1Response.json()) as UserListBody;

      expect(page1.data).toHaveLength(10);
      expect(page1.meta).toEqual({
        page: 1,
        pageSize: 10,
        totalItems: 12,
        totalPages: 2,
        totalStaff: 12,
        activeStaff: 11,
        inactiveStaff: 1,
      });

      const serializedPage1 = JSON.stringify(page1);
      expect(serializedPage1).not.toContain("password");
      expect(serializedPage1).not.toContain("token");
      expect(serializedPage1).not.toContain("banned");
      expect(serializedPage1).not.toContain("banReason");
      expect(serializedPage1).not.toContain("session");
      for (const row of page1.data ?? []) {
        expect(row.isOwner).toBe(false);
        expect(Object.keys(row).sort()).toEqual(
          [
            "credentialSetupRequired",
            "createdAt",
            "email",
            "id",
            "isOwner",
            "location",
            "name",
            "role",
            "status",
            "updatedAt",
          ].sort(),
        );
      }

      const page2Response = await usersRoute.GET(
        usersRequest("/api/users?page=2", { headers: ownerHeaders }),
      );
      const page2 = (await page2Response.json()) as UserListBody;
      expect(page2.data).toHaveLength(3);
      const ownerRow = page2.data?.find((row) => row.email === OWNER_EMAIL);
      expect(ownerRow).toBeDefined();
      expect(ownerRow?.role).toBe("ADMIN");
      expect(ownerRow?.isOwner).toBe(true);
      expect(ownerRow?.location).toBeNull();

      const beyondResponse = await usersRoute.GET(
        usersRequest("/api/users?page=9", { headers: ownerHeaders }),
      );
      const beyond = (await beyondResponse.json()) as UserListBody;
      expect(beyond.data).toHaveLength(0);
      expect(beyond.meta?.totalPages).toBe(2);
    });
  }, 90_000);

  it("filters by search, role, status, and location while counting staff only", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      // 4 canonical staff + 4 extra branch staff + 1 admin.
      const { ownerHeaders } = await signInOwner(prisma);
      const locations = await createLocationFixtures(prisma);
      for (let index = 1; index <= 4; index += 1) {
        await createUserFixture(prisma, locations, {
          namespace: "um-filter",
          key: `b${String(index).padStart(2, "0")}`,
          role: "BRANCH_STAFF",
          locationId: locations.branches.BL.id,
        });
      }

      await loadRoutes();

      async function listQuery(query: string) {
        const response = await usersRoute.GET(
          usersRequest(`/api/users?${query}`, { headers: ownerHeaders }),
        );
        expect(response.status).toBe(200);
        return (await response.json()) as UserListBody;
      }

      const searched = await listQuery("search=stock-staff.um-owner");
      expect(searched.meta?.totalItems).toBe(1);
      expect(searched.data?.map((row) => row.role)).toEqual(["STOCK_STAFF"]);

      const branchOnly = await listQuery("role=BRANCH_STAFF");
      expect(branchOnly.meta?.totalItems).toBe(6);
      expect(branchOnly.data?.every((row) => row.role === "BRANCH_STAFF")).toBe(
        true,
      );

      const inactive = await listQuery("status=INACTIVE");
      expect(inactive.meta?.totalItems).toBe(1);
      expect(inactive.data?.[0]?.email).toContain("inactive-branch-staff");

      const atBl = await listQuery("location=BL");
      expect(atBl.meta?.totalItems).toBe(5);
      expect(atBl.data?.every((row) => row.location?.code === "BL")).toBe(true);

      const unassigned = await listQuery("location=none");
      expect(unassigned.meta?.totalItems).toBe(1);
      expect(unassigned.data?.some((row) => row.isOwner)).toBe(true);
      expect(unassigned.data?.some((row) => row.role === "ACCOUNTING_STAFF")).toBe(true);
    });
  }, 90_000);

  it("creates one of three fixed roles with exact server-resolved location semantics", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const locations = await createLocationFixtures(prisma);
      const { ownerHeaders } = await signInOwner(prisma);
      await loadRoutes();

      async function postUser(body: unknown) {
        const response = await usersRoute.POST(
          usersRequest("/api/users", { method: "POST", headers: ownerHeaders, body }),
        );
        return {
          status: response.status,
          body: (await response.json()) as MutationBody & UserListBody,
        };
      }

      const stockResult = await postUser({
        role: "STOCK_STAFF",
        name: "Stock Person",
        email: "Stock.Person@Example.test",
        temporaryPassword: "Temp-Pass-123",
        // Hostile extra field must be ignored: Stock Staff resolves to SR only.
        locationId: locations.branches.QC.id,
      });
      expect(stockResult.status).toBe(201);
      expect(stockResult.body.error).toBeUndefined();
      expect(stockResult.body.data?.role).toBe("STOCK_STAFF");
      expect(stockResult.body.data?.location?.code).toBe("SR");
      expect(stockResult.body.data?.credentialSetupRequired).toBe(true);
      expect(stockResult.body.data?.isOwner).toBe(false);
      const stockDtoJson = JSON.stringify(stockResult.body);
      expect(stockDtoJson).not.toContain("Temp-Pass-123");
      expect(stockDtoJson.toLowerCase()).not.toContain('"password"');

      const stockRow = await prisma.user.findUniqueOrThrow({
        where: { email: "stock.person@example.test" },
        include: { accounts: true },
      });
      expect(stockRow.locationId).toBe(locations.stockRoom.id);
      expect(stockRow.accounts).toHaveLength(1);
      expect(stockRow.accounts[0]?.password).toBeTruthy();
      expect(stockRow.accounts[0]?.password).not.toBe("Temp-Pass-123");

      const branchResult = await postUser({
        role: "BRANCH_STAFF",
        name: "Branch Person",
        email: "branch.person@example.test",
        temporaryPassword: "Temp-Pass-123",
        locationId: locations.branches.QC.id,
      });
      expect(branchResult.status).toBe(201);
      expect(branchResult.body.data?.location?.code).toBe("QC");

      const accountingResult = await postUser({
        role: "ACCOUNTING_STAFF",
        name: "Accounting Person",
        email: "accounting.person@example.test",
        temporaryPassword: "Temp-Pass-123",
        // Hostile extra field must never assign a location to Accounting.
        locationId: locations.branches.BL.id,
      });
      expect(accountingResult.status).toBe(201);
      expect(accountingResult.body.data?.location).toBeNull();
      const accountingRow = await prisma.user.findUniqueOrThrow({
        where: { email: "accounting.person@example.test" },
      });
      expect(accountingRow.locationId).toBeNull();

      const missingBranch = await postUser({
        role: "BRANCH_STAFF",
        name: "No Branch",
        email: "no.branch@example.test",
        temporaryPassword: "Temp-Pass-123",
      });
      expect(missingBranch.status).toBe(400);
      expect(missingBranch.body.error?.code).toBeDefined();
      expect(
        await prisma.user.findUnique({ where: { email: "no.branch@example.test" } }),
      ).toBeNull();

      await prisma.location.update({
        where: { id: locations.stockRoom.id },
        data: { isActive: false },
      });
      const unavailableStockRoom = await postUser({
        role: "STOCK_STAFF",
        name: "Late Stock",
        email: "late.stock@example.test",
        temporaryPassword: "Temp-Pass-123",
      });
      expect(unavailableStockRoom.status).toBe(400);
      expect(
        await prisma.user.findUnique({ where: { email: "late.stock@example.test" } }),
      ).toBeNull();
      await prisma.location.update({
        where: { id: locations.stockRoom.id },
        data: { isActive: true },
      });
    });
  }, 90_000);

  it("rejects duplicate normalized email safely, including concurrent submissions", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const locations = await createLocationFixtures(prisma);
      const { ownerHeaders } = await signInOwner(prisma);
      await loadRoutes();

      async function postUser(email: string) {
        const response = await usersRoute.POST(
          usersRequest("/api/users", {
            method: "POST",
            headers: ownerHeaders,
            body: {
              role: "BRANCH_STAFF",
              name: "Dup Candidate",
              email,
              temporaryPassword: "Temp-Pass-123",
              locationId: locations.branches.QC.id,
            },
          }),
        );
        return { status: response.status, body: (await response.json()) as MutationBody };
      }

      const first = await postUser("Dup.Case@Example.test");
      expect(first.status).toBe(201);

      const second = await postUser("dup.case@example.test");
      expect(second.status).toBe(409);
      expect(second.body.error?.code).toBe("EMAIL_IN_USE");
      expect(second.body.data).toBeUndefined();

      expect(await prisma.user.count({ where: { email: "dup.case@example.test" } })).toBe(1);
      expect(await prisma.account.count()).toBeGreaterThanOrEqual(1);

      const [winner, loser] = await Promise.allSettled([
        postUser("race.condition@example.test"),
        postUser("Race.Condition@example.test"),
      ]);
      const outcomes = [winner, loser].map((outcome) =>
        outcome.status === "fulfilled" ? outcome.value.status : "rejected",
      );
      expect(outcomes.filter((status) => status === 201)).toHaveLength(1);
      expect(outcomes.filter((status) => status === 409)).toHaveLength(1);
      expect(await prisma.user.count({ where: { email: "race.condition@example.test" } })).toBe(1);
      const racedUser = await prisma.user.findUniqueOrThrow({
        where: { email: "race.condition@example.test" },
        include: { accounts: true },
      });
      expect(racedUser.accounts).toHaveLength(1);
    });
  }, 90_000);

  it("serves only the owner Admin and denies every other principal without data", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const locations = await createLocationFixtures(prisma);
      const { fixture, ownerHeaders } = await signInOwner(prisma);
      await grantCredential(
        prisma,
        fixture.users.branchStaff.id,
        "Staff-Pass-123",
      );
      const staffHeaders = await signInUser(
        prisma,
        fixture.users.branchStaff.email,
        "Staff-Pass-123",
      );
      await loadRoutes();

      const anonymousGet = await usersRoute.GET(usersRequest("/api/users"));
      expect(anonymousGet.status).toBe(401);
      const anonymousGetBody = (await anonymousGet.json()) as UserListBody;
      expect(anonymousGetBody.error?.code).toBe("UNAUTHENTICATED");
      expect(anonymousGetBody.data).toBeUndefined();

      const staffGet = await usersRoute.GET(
        usersRequest("/api/users", { headers: staffHeaders }),
      );
      expect(staffGet.status).toBe(403);
      const staffGetBody = (await staffGet.json()) as UserListBody;
      expect(staffGetBody.error?.code).toBe("FORBIDDEN");
      expect(staffGetBody.data).toBeUndefined();

      const usersBefore = await prisma.user.count();
      const staffPost = await usersRoute.POST(
        usersRequest("/api/users", {
          method: "POST",
          headers: staffHeaders,
          body: {
            role: "BRANCH_STAFF",
            name: "Escalated",
            email: "escalated@example.test",
            temporaryPassword: "Temp-Pass-123",
            locationId: locations.branches.QC.id,
          },
        }),
      );
      expect(staffPost.status).toBe(403);
      const staffPostBody = (await staffPost.json()) as MutationBody;
      expect(staffPostBody.data).toBeUndefined();
      expect(await prisma.user.count()).toBe(usersBefore);

      const adminCreate = await usersRoute.POST(
        usersRequest("/api/users", {
          method: "POST",
          headers: ownerHeaders,
          body: {
            role: "ADMIN",
            name: "Second Admin",
            email: "second.admin@example.test",
            temporaryPassword: "Temp-Pass-123",
          },
        }),
      );
      expect(adminCreate.status).toBe(400);
      expect((await adminCreate.json() as MutationBody).data).toBeUndefined();
      expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
      expect(
        await prisma.user.findUnique({ where: { email: "second.admin@example.test" } }),
      ).toBeNull();

      const unknownRole = await usersRoute.POST(
        usersRequest("/api/users", {
          method: "POST",
          headers: ownerHeaders,
          body: {
            role: "SUPER_ADMIN",
            name: "Unknown Role",
            email: "unknown.role@example.test",
            temporaryPassword: "Temp-Pass-123",
          },
        }),
      );
      expect(unknownRole.status).toBe(400);
      expect(await prisma.user.count()).toBe(usersBefore);
    });
  }, 90_000);
});
