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
  authContextFor,
  createAuthFixture,
  createLocationFixtures,
  createUserFixture,
  type LocationFixtures,
} from "../helpers/factories";
import { createRequest } from "../helpers/requests";

const OWNER_EMAIL = "owner-admin@auth-fixture.example.test";
const OWNER_PASSWORD = "Owner-Temp-Pass-1";

type UsersRoute = typeof import("../../app/api/users/route");
type UserIdRoute = typeof import("../../app/api/users/[userId]/route");
type UserStatusRoute = typeof import("../../app/api/users/[userId]/status/route");
type UserPasswordRoute = typeof import("../../app/api/users/[userId]/password/route");
let usersRoute: UsersRoute;
let userIdRoute: UserIdRoute | null;
let userStatusRoute: UserStatusRoute | null;
let userPasswordRoute: UserPasswordRoute | null;

async function loadRoutes() {
  usersRoute = await import("../../app/api/users/route");
}

async function loadLifecycleRoutes() {
  usersRoute = await import("../../app/api/users/route");
  userIdRoute = await import("../../app/api/users/[userId]/route");
  userStatusRoute = await import("../../app/api/users/[userId]/status/route");
  userPasswordRoute = await import(
    "../../app/api/users/[userId]/password/route"
  );
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
    roleDefinitionId: string;
    roleName: string;
    status: string;
    isOwner: boolean;
    locations: Array<{ id: string; code: string; name: string; type: string }>;
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
    name: string;
    email: string;
    roleDefinitionId: string;
    roleName: string;
    status: string;
    isOwner: boolean;
    locations: Array<{ id: string; code: string; name: string; type: string }>;
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
            "lastSignInAt",
            "locations",
            "name",
            "roleDefinitionId",
            "roleName",
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
      expect(ownerRow?.roleName).toBe("Admin");
      expect(ownerRow?.isOwner).toBe(true);
      expect(ownerRow?.locations).toEqual([]);

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
      expect(searched.data?.map((row) => row.roleName)).toEqual(["Stock Staff"]);

      const branchOnly = await listQuery("roleId=role-branch-staff");
      expect(branchOnly.meta?.totalItems).toBe(6);
      expect(branchOnly.data?.every((row) => row.roleName === "Branch Staff")).toBe(
        true,
      );

      const inactive = await listQuery("status=INACTIVE");
      expect(inactive.meta?.totalItems).toBe(1);
      expect(inactive.data?.[0]?.email).toContain("inactive-branch-staff");

      const atBl = await listQuery("location=BL");
      expect(atBl.meta?.totalItems).toBe(5);
      expect(atBl.data?.every((row) => row.locations.some((location) => location.code === "BL"))).toBe(true);

      const unassigned = await listQuery("location=none");
      expect(unassigned.meta?.totalItems).toBe(1);
      expect(unassigned.data?.some((row) => row.isOwner)).toBe(true);
      expect(unassigned.data?.some((row) => row.roleName === "Accounting Staff")).toBe(true);

      const dynamicBranch = await prisma.location.create({
        data: { code: "DV", name: "Davao City", type: "BRANCH" },
      });
      await prisma.user.create({
        data: {
          name: "Dynamic Branch Staff",
          email: "dynamic-branch@example.test",
          role: "BRANCH_STAFF",
          roleDefinitionId: "role-branch-staff",
          locationId: dynamicBranch.id,
          locationAssignments: {
            create: { locationId: dynamicBranch.id },
          },
        },
      });
      const atDynamicBranch = await listQuery("location=DV");
      expect(atDynamicBranch.meta?.totalItems).toBe(1);
      expect(atDynamicBranch.data?.[0]?.locations[0]?.code).toBe("DV");

      const invalidLocationResponse = await usersRoute.GET(
        usersRequest("/api/users?location=UNKNOWN", { headers: ownerHeaders }),
      );
      expect(invalidLocationResponse.status).toBe(400);
      await expect(invalidLocationResponse.json()).resolves.toMatchObject({
        error: { code: "INVALID_LOCATION_FILTER" },
      });
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
        roleId: "role-stock-staff",
        name: "Stock Person",
        email: "Stock.Person@Example.test",
        temporaryPassword: "Temp-Pass-123",
        // Hostile extra field must be ignored: Stock Staff resolves to SR only.
        locationIds: [locations.stockRoom.id],
      });
      expect(stockResult.status).toBe(201);
      expect(stockResult.body.error).toBeUndefined();
      expect(stockResult.body.data?.roleName).toBe("Stock Staff");
      expect(stockResult.body.data?.locations[0]?.code).toBe("SR");
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
        roleId: "role-branch-staff",
        name: "Branch Person",
        email: "branch.person@example.test",
        temporaryPassword: "Temp-Pass-123",
        locationIds: [locations.branches.QC.id],
      });
      expect(branchResult.status).toBe(201);
      expect(branchResult.body.data?.locations[0]?.code).toBe("QC");

      const accountingResult = await postUser({
        roleId: "role-accounting-staff",
        name: "Accounting Person",
        email: "accounting.person@example.test",
        temporaryPassword: "Temp-Pass-123",
        // Hostile extra field must never assign a location to Accounting.
        locationIds: [],
      });
      expect(accountingResult.status).toBe(201);
      expect(accountingResult.body.data?.locations).toEqual([]);
      const accountingRow = await prisma.user.findUniqueOrThrow({
        where: { email: "accounting.person@example.test" },
      });
      expect(accountingRow.locationId).toBeNull();

      const missingBranch = await postUser({
        roleId: "role-branch-staff",
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
        roleId: "role-stock-staff",
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
              roleId: "role-branch-staff",
              name: "Dup Candidate",
              email,
              temporaryPassword: "Temp-Pass-123",
              locationIds: [locations.branches.QC.id],
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
            roleId: "role-branch-staff",
            name: "Escalated",
            email: "escalated@example.test",
            temporaryPassword: "Temp-Pass-123",
            locationIds: [locations.branches.QC.id],
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
            roleId: "role-admin",
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
            roleId: "does-not-exist",
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

  it("keeps delegated filters, summaries, and form locations inside actor access", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "delegated-user-list" });
      const multiLocationTarget = await createUserFixture(prisma, fixture.locations, {
        namespace: "delegated-user-list",
        key: "qc-lu-target",
        role: "BRANCH_STAFF",
        locationId: fixture.locations.branches.QC.id,
      });
      await prisma.userLocation.create({
        data: {
          userId: multiLocationTarget.id,
          locationId: fixture.locations.branches.LU.id,
        },
      });
      const higherPrivilegeRole = await prisma.roleDefinition.create({
        data: {
          key: "same-location-higher-privilege",
          name: "Same-location higher privilege",
          description: "Exceeds the delegated manager capability ceiling",
          scope: "BRANCH",
          permissions: ["sales:void-replace"],
        },
      });
      const higherPrivilegeTarget = await createUserFixture(prisma, fixture.locations, {
        namespace: "delegated-user-list",
        key: "qc-higher-privilege",
        role: "BRANCH_STAFF",
        locationId: fixture.locations.branches.QC.id,
      });
      await prisma.user.update({
        where: { id: higherPrivilegeTarget.id },
        data: { roleDefinitionId: higherPrivilegeRole.id },
      });
      await createUserFixture(prisma, fixture.locations, {
        namespace: "delegated-user-list",
        key: "qc-inactive-extra",
        role: "BRANCH_STAFF",
        status: "INACTIVE",
        locationId: fixture.locations.branches.QC.id,
      });
      const branchRole = await prisma.roleDefinition.findUniqueOrThrow({
        where: { id: "role-branch-staff" },
        select: { permissions: true },
      });
      const { effectiveCapabilities } = await import("../../lib/permissions");
      const branchCapabilities = effectiveCapabilities(
        branchRole.permissions as Parameters<typeof effectiveCapabilities>[0],
      );
      const actor = {
        userId: fixture.users.branchStaff.id,
        roleDefinitionId: fixture.users.branchStaff.roleDefinitionId,
        capabilities: [...new Set([
          ...branchCapabilities,
          "users:view",
          "users:update",
          "users:set-status",
          "users:reset-password",
        ])],
        isOwner: false,
        locationIds: [fixture.locations.branches.QC.id],
      };
      const { listAssignableUserLocations, listUsers } = await import(
        "../../lib/server/services/users"
      );
      const { userListQuerySchema } = await import("../../lib/contracts/users");

      const visible = await listUsers(actor, userListQuerySchema.parse({}));
      expect(visible.data.map((user) => user.email).sort()).toEqual([
        fixture.users.branchStaff.email,
        "qc-higher-privilege.delegated-user-list@example.test",
        "qc-inactive-extra.delegated-user-list@example.test",
      ].sort());
      expect(visible.meta).toMatchObject({ totalStaff: 3, activeStaff: 2, inactiveStaff: 1 });
      expect(
        visible.data.every((user) =>
          user.locations.every((location) => location.code === "QC"),
        ),
      ).toBe(true);

      const searched = await listUsers(
        actor,
        userListQuerySchema.parse({ search: fixture.users.inactiveBranchStaff.email }),
      );
      expect(searched.data).toEqual([]);
      expect(searched.meta).toMatchObject({ totalStaff: 3, activeStaff: 2, inactiveStaff: 1 });

      const { resetStaffPassword, setStaffStatus, updateStaffUser } = await import(
        "../../lib/server/services/users"
      );
      await expect(
        updateStaffUser(actor, multiLocationTarget.id, { name: "Unauthorized rename" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(
        setStaffStatus(actor, multiLocationTarget.id, "INACTIVE"),
      ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(
        resetStaffPassword(
          actor,
          new Headers(),
          multiLocationTarget.id,
          "New-Password-123",
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(
        setStaffStatus(actor, fixture.users.accountingStaff.id, "INACTIVE"),
      ).rejects.toMatchObject({ code: "TARGET_ROLE_EXCEEDS_ACTOR", status: 403 });
      await expect(
        updateStaffUser(actor, higherPrivilegeTarget.id, {
          name: "Unauthorized same-location edit",
        }),
      ).rejects.toMatchObject({ code: "TARGET_ROLE_EXCEEDS_ACTOR", status: 403 });
      await expect(
        setStaffStatus(actor, higherPrivilegeTarget.id, "INACTIVE"),
      ).rejects.toMatchObject({ code: "TARGET_ROLE_EXCEEDS_ACTOR", status: 403 });
      await expect(
        resetStaffPassword(
          actor,
          new Headers(),
          higherPrivilegeTarget.id,
          "New-Password-123",
        ),
      ).rejects.toMatchObject({ code: "TARGET_ROLE_EXCEEDS_ACTOR", status: 403 });
      await expect(
        prisma.user.findUniqueOrThrow({ where: { id: higherPrivilegeTarget.id } }),
      ).resolves.toMatchObject({ name: higherPrivilegeTarget.name, status: "ACTIVE" });

      await expect(
        listUsers(actor, userListQuerySchema.parse({ location: "BL" })),
      ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(
        listUsers(actor, userListQuerySchema.parse({ location: "none" })),
      ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

      const options = await listAssignableUserLocations(actor);
      expect(options.map((location) => location.code)).toEqual(["QC"]);
    });
  }, 90_000);

  it("cleans failed credential finalization and leaves failed cleanup inactive", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "credential-finalization",
      });
      const owner = authContextFor(fixture.users.admin, null);
      const { createStaffUser } = await import("../../lib/server/services/users");
      const baseInput = {
        roleId: "role-branch-staff",
        name: "Provisioning Failure",
        temporaryPassword: "Temp-Pass-123",
        locationIds: [fixture.locations.branches.QC.id],
      };

      await expect(
        createStaffUser(
          owner,
          { ...baseInput, email: "cleaned.failure@example.test" },
          { injectFailureAfterCredentialWrite: true },
        ),
      ).rejects.toThrow(/credential-finalization failure/i);
      expect(
        await prisma.user.findUnique({ where: { email: "cleaned.failure@example.test" } }),
      ).toBeNull();

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await expect(
          createStaffUser(
            owner,
            { ...baseInput, email: "retained.failure@example.test" },
            {
              injectFailureAfterCredentialWrite: true,
              injectCleanupFailure: true,
            },
          ),
        ).rejects.toThrow(/credential-finalization failure/i);
        const retained = await prisma.user.findUniqueOrThrow({
          where: { email: "retained.failure@example.test" },
          include: { accounts: true, locationAssignments: true },
        });
        expect(retained).toMatchObject({ status: "INACTIVE" });
        expect(retained.accounts).toHaveLength(1);
        expect(retained.locationAssignments).toHaveLength(0);
        expect(errorSpy).toHaveBeenCalledWith(
          "Unable to remove a partially provisioned user",
          expect.any(Error),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });
  }, 90_000);
});

type LifecycleSetup = {
  locations: LocationFixtures;
  ownerHeaders: Headers;
  staffHeaders: Headers;
  targetId: string;
};

async function routeContext(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

describe("user management lifecycle", () => {
  afterEach(async () => {
    await sharedPrisma.$disconnect();
  });

  async function prepareLifecycle(prisma: PrismaClient): Promise<LifecycleSetup> {
    const locations = await createLocationFixtures(prisma);
    const { fixture, ownerHeaders } = await signInOwner(prisma);
    const target = fixture.users.branchStaff;
    await grantCredential(prisma, target.id, "Staff-Old-Pass-1");
    const staffHeaders = await signInUser(
      prisma,
      target.email,
      "Staff-Old-Pass-1",
    );
    await loadLifecycleRoutes();
    return {
      locations,
      ownerHeaders,
      staffHeaders,
      targetId: target.id,
    };
  }

  function patchRequest(
    path: string,
    headers: HeadersInit,
    body: unknown,
    method = "PATCH",
  ) {
    return usersRequest(path, { method, headers, body });
  }

  it("updates staff fields and enforces the full resulting assignment", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { locations, ownerHeaders, targetId } =
        await prepareLifecycle(prisma);
      if (!userIdRoute) throw new Error("PATCH route module missing");

      expect(
        await prisma.session.count({ where: { userId: targetId } }),
      ).toBeGreaterThanOrEqual(1);

      // Name/email-only updates keep the assignment and live session intact.
      const renameResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${targetId}`, ownerHeaders, {
          name: "Renamed Staff",
          email: "renamed.staff@example.test",
        }),
        await routeContext(targetId),
      );
      expect(renameResponse.status).toBe(200);
      const renamed = (await renameResponse.json()) as MutationBody;
      expect(renamed.data?.name).toBe("Renamed Staff");
      expect(renamed.data?.email).toBe("renamed.staff@example.test");
      expect(renamed.data?.locations[0]?.code).toBe("QC");
      expect(await prisma.session.count({ where: { userId: targetId } })).toBeGreaterThanOrEqual(1);

      // Role changes do not derive location semantics and revoke sessions.
      const accountingResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${targetId}`, ownerHeaders, {
          roleId: "role-accounting-staff",
        }),
        await routeContext(targetId),
      );
      expect(accountingResponse.status).toBe(200);
      const accountant = (await accountingResponse.json()) as MutationBody;
      expect(accountant.data?.roleName).toBe("Accounting Staff");
      expect(accountant.data?.locations.map((location) => location.code)).toEqual(["QC"]);
      expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);

      // Another role change preserves the authoritative assignment by default.
      const stockResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${targetId}`, ownerHeaders, {
          roleId: "role-stock-staff",
        }),
        await routeContext(targetId),
      );
      expect(stockResponse.status).toBe(200);
      expect(((await stockResponse.json()) as MutationBody).data?.locations[0]?.code).toBe("QC");

      // Explicitly clearing locations for a restricted role fails unchanged.
      const beforeFailedBranch = await prisma.user.findUniqueOrThrow({
        where: { id: targetId },
      });
      const missingBranchResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${targetId}`, ownerHeaders, {
          roleId: "role-branch-staff",
          locationIds: [],
        }),
        await routeContext(targetId),
      );
      expect(missingBranchResponse.status).toBe(400);
      const afterFailedBranch = await prisma.user.findUniqueOrThrow({
        where: { id: targetId },
      });
      expect(afterFailedBranch.role).toBe(beforeFailedBranch.role);
      expect(afterFailedBranch.locationId).toBe(beforeFailedBranch.locationId);
      expect(afterFailedBranch.locationId).toBe(locations.branches.QC.id);

      const branchResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${targetId}`, ownerHeaders, {
          roleId: "role-branch-staff",
          locationIds: [locations.branches.BL.id],
        }),
        await routeContext(targetId),
      );
      expect(branchResponse.status).toBe(200);
      expect(((await branchResponse.json()) as MutationBody).data?.locations[0]?.code).toBe("BL");

      // Duplicate email conflicts map to a stable 409 with no change.
      const duplicateEmailResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${targetId}`, ownerHeaders, {
          email: OWNER_EMAIL,
        }),
        await routeContext(targetId),
      );
      expect(duplicateEmailResponse.status).toBe(409);
      expect((await duplicateEmailResponse.json() as MutationBody).error?.code).toBe("EMAIL_IN_USE");
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).email,
      ).toBe("renamed.staff@example.test");

      // An all-location role may retain explicit assignments, though it does not require them.
      const accountingTarget = (
        await prisma.user.findUniqueOrThrow({
          where: { email: "accounting-staff.um-owner@example.test" },
        })
      ).id;
      const hostileLocationResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${accountingTarget}`, ownerHeaders, {
          locationIds: [locations.branches.QC.id],
        }),
        await routeContext(accountingTarget),
      );
      expect(hostileLocationResponse.status).toBe(200);
      expect(((await hostileLocationResponse.json()) as MutationBody).data?.locations[0]?.code).toBe("QC");

      // The owner Admin is not manageable.
      const admin = (await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } }));
      const adminPatchResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${admin.id}`, ownerHeaders, { name: "New Owner" }),
        await routeContext(admin.id),
      );
      expect(adminPatchResponse.status).toBe(403);
      expect((await adminPatchResponse.json() as MutationBody).error?.code).toBe("USER_NOT_MANAGEABLE");
      const adminAfter = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
      expect(adminAfter.name).toBe(admin.name);

      const missingResponse = await userIdRoute.PATCH(
        patchRequest("/api/users/does-not-exist", ownerHeaders, { name: "Ghost" }),
        await routeContext("does-not-exist"),
      );
      expect(missingResponse.status).toBe(404);
      expect((await missingResponse.json() as MutationBody).error?.code).toBe("USER_NOT_FOUND");

      // The earlier role changes revoked the staff session; sign in again to
      // prove an authenticated non-Admin caller is still denied without data.
      const escalatedHeaders = await signInUser(
        prisma,
        "renamed.staff@example.test",
        "Staff-Old-Pass-1",
      );
      const staffCallerResponse = await userIdRoute.PATCH(
        patchRequest(`/api/users/${targetId}`, escalatedHeaders, { name: "Escalated" }),
        await routeContext(targetId),
      );
      expect(staffCallerResponse.status).toBe(403);
      expect((await staffCallerResponse.json() as MutationBody).data).toBeUndefined();
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).name,
      ).toBe("Renamed Staff");
    });
  }, 120_000);

  it("deactivates and reactivates idempotently without duplicates or a delete surface", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { ownerHeaders, targetId } = await prepareLifecycle(prisma);
      if (!userStatusRoute) throw new Error("status route module missing");

      expect(await prisma.session.count({ where: { userId: targetId } })).toBeGreaterThanOrEqual(1);

      async function postStatus(status: string, headers: HeadersInit = ownerHeaders, userId = targetId) {
        const response = await userStatusRoute!.POST(
          patchRequest(`/api/users/${userId}/status`, headers, { status }, "POST"),
          await routeContext(userId),
        );
        return { status: response.status, body: (await response.json()) as MutationBody };
      }

      const deactivated = await postStatus("INACTIVE");
      expect(deactivated.status).toBe(200);
      expect(deactivated.body.data?.status).toBe("INACTIVE");
      expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);

      const repeatedDeactivate = await postStatus("INACTIVE");
      expect(repeatedDeactivate.status).toBe(200);
      expect(repeatedDeactivate.body.data?.status).toBe("INACTIVE");
      expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);

      const reactivated = await postStatus("ACTIVE");
      expect(reactivated.status).toBe(200);
      expect(reactivated.body.data?.status).toBe("ACTIVE");
      expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);

      const repeatedReactivate = await postStatus("ACTIVE");
      expect(repeatedReactivate.status).toBe(200);
      expect(repeatedReactivate.body.data?.status).toBe("ACTIVE");

      const missing = await postStatus("INACTIVE", ownerHeaders, "does-not-exist");
      expect(missing.status).toBe(404);
      expect(missing.body.error?.code).toBe("USER_NOT_FOUND");

      const admin = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
      const adminDeactivate = await postStatus("INACTIVE", ownerHeaders, admin.id);
      expect(adminDeactivate.status).toBe(403);
      expect(adminDeactivate.body.error?.code).toBe("USER_NOT_MANAGEABLE");
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).status,
      ).toBe("ACTIVE");

      const accounting = await prisma.user.findUniqueOrThrow({
        where: { email: "accounting-staff.um-owner@example.test" },
      });
      // Reactivation restored sign-in; a non-Admin caller stays denied.
      const escalatedHeaders = await signInUser(
        prisma,
        "branch-staff.um-owner@example.test",
        "Staff-Old-Pass-1",
      );
      const staffCaller = await postStatus("INACTIVE", escalatedHeaders, accounting.id);
      expect(staffCaller.status).toBe(403);
      expect(staffCaller.body.data).toBeUndefined();
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: accounting.id } })).status,
      ).toBe("ACTIVE");

      expect(userIdRoute && Object.prototype.hasOwnProperty.call(userIdRoute, "DELETE")).toBe(false);
      expect(userStatusRoute && Object.prototype.hasOwnProperty.call(userStatusRoute, "DELETE")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(usersRoute, "DELETE")).toBe(false);
    });
  }, 120_000);

  it("resets credentials safely without duplication, echo, or surviving sessions", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { ownerHeaders, targetId } = await prepareLifecycle(prisma);
      if (!userPasswordRoute) throw new Error("password route module missing");

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const usersBefore = await prisma.user.count();
        const accountsBefore = await prisma.account.count({ where: { userId: targetId } });
        expect(accountsBefore).toBe(1);
        expect(await prisma.session.count({ where: { userId: targetId } })).toBeGreaterThanOrEqual(1);

        async function postPassword(newPassword: string, headers: HeadersInit = ownerHeaders, userId = targetId) {
          const response = await userPasswordRoute!.POST(
            patchRequest(`/api/users/${userId}/password`, headers, { newPassword }, "POST"),
            await routeContext(userId),
          );
          return {
            status: response.status,
            raw: JSON.stringify(await response.json()),
          };
        }

        const firstReset = await postPassword("Brand-New-Pass-7");
        expect(firstReset.status).toBe(200);
        expect(firstReset.raw).not.toContain("Brand-New-Pass-7");
        expect(firstReset.raw).toContain('"credentialSetupRequired":true');
        expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);
        expect(await prisma.account.count({ where: { userId: targetId } })).toBe(accountsBefore);
        expect(await prisma.user.count()).toBe(usersBefore);
        expect(errorSpy.mock.calls.map(String).join("\n")).not.toContain("Brand-New-Pass-7");

        await expect(
          auth.api.signInEmail({
            body: { email: "branch-staff.um-owner@example.test", password: "Staff-Old-Pass-1" },
          }),
        ).rejects.toThrow();
        const reauth = await auth.api.signInEmail({
          body: { email: "branch-staff.um-owner@example.test", password: "Brand-New-Pass-7" },
        });
        expect(reauth.user.id).toBe(targetId);

        const secondReset = await postPassword("Second-New-Pass-8");
        expect(secondReset.status).toBe(200);
        expect(secondReset.raw).not.toContain("Second-New-Pass-8");
        expect(secondReset.raw).toContain('"credentialSetupRequired":true');
        expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);
        expect(await prisma.account.count({ where: { userId: targetId } })).toBe(accountsBefore);

        const weakAttempt = await postPassword("weak");
        expect(weakAttempt.status).toBe(400);
        const stillWorks = await auth.api.signInEmail({
          body: { email: "branch-staff.um-owner@example.test", password: "Second-New-Pass-8" },
        });
        expect(stillWorks.user.id).toBe(targetId);

        const admin = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
        const adminReset = await postPassword("Admin-Pass-999", ownerHeaders, admin.id);
        expect(adminReset.status).toBe(403);
        expect(adminReset.raw).toContain("USER_NOT_MANAGEABLE");

        const missingReset = await postPassword("Missing-Pass-9", ownerHeaders, "does-not-exist");
        expect(missingReset.status).toBe(404);

        // The reset replaced the staff credential; use it to prove that even
        // an authenticated non-Admin caller cannot invoke privileged resets.
        const escalatedHeaders = await signInUser(
          prisma,
          "branch-staff.um-owner@example.test",
          "Second-New-Pass-8",
        );
        const staffCaller = await postPassword("Escalated-Pass-1", escalatedHeaders);
        expect(staffCaller.status).toBe(403);
        expect(staffCaller.raw).not.toContain("Escalated-Pass-1");
      } finally {
        errorSpy.mockRestore();
      }
    });
  }, 120_000);
});
