import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/auth", async () => import("../../lib/server/auth"));

import { auth } from "../../lib/server/auth";
import { prisma as sharedPrisma } from "../../lib/server/prisma";
import { internalUserAuth } from "../../lib/server/internal-user-auth";
import { withDisposableDatabase } from "../helpers/database";
import {
  createAuthFixture,
  createLocationFixtures,
  type LocationFixtures,
} from "../helpers/factories";

const STAFF_CREATION_CASES = [
  {
    role: "STOCK_STAFF",
    key: "stock-staff",
    pickLocationId: (locations: LocationFixtures) => locations.stockRoom.id,
  },
  {
    role: "BRANCH_STAFF",
    key: "branch-staff",
    pickLocationId: (locations: LocationFixtures) => locations.branches.QC.id,
  },
  {
    role: "ACCOUNTING_STAFF",
    key: "accounting-staff",
    pickLocationId: () => null,
  },
] as const;

/**
 * The owner Admin fixture has no credential account; Better Auth 1.6.23
 * signs its session cookie, so the only faithful way to obtain owner request
 * headers is a real sign-in against the public instance.
 */
async function signInOwner(prisma: PrismaClient) {
  const fixture = await createAuthFixture(prisma, { namespace: "owner" });
  const authContext = await auth.$context;
  const passwordHash = await authContext.password.hash("Owner-Temp-Pass-1");
  await prisma.account.create({
    data: {
      accountId: fixture.users.admin.id,
      providerId: "credential",
      userId: fixture.users.admin.id,
      password: passwordHash,
    },
  });

  const response = await auth.api.signInEmail({
    body: {
      email: fixture.users.admin.email,
      password: "Owner-Temp-Pass-1",
    },
    asResponse: true,
  });
  const sessionCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="));
  expect(sessionCookie).toBeDefined();

  return {
    fixture,
    ownerHeaders: new Headers({ cookie: sessionCookie ?? "" }),
  };
}

describe("internal staff credential primitives", () => {
  // Each test swaps the disposable PostgreSQL container, so the shared
  // Better Auth Prisma pool must not carry sockets across tests.
  afterEach(async () => {
    await sharedPrisma.$disconnect();
  });

  it("creates exactly one fixed-role credential record per supported staff role", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const locations = await createLocationFixtures(prisma);
      const expectedLocations = new Map<string, string | null>();
      const createdIds = new Map<string, string>();

      for (const testCase of STAFF_CREATION_CASES) {
        const locationId = testCase.pickLocationId(locations);
        const result = await internalUserAuth.api.createUser({
          body: {
            email: `MixedCase.${testCase.key}.internal@example.test`,
            password: "Temporary-Pass-1",
            name: `Internal ${testCase.role}`,
            role: testCase.role,
            ...(locationId === null ? {} : { locationId }),
          },
        });
        createdIds.set(testCase.role, result.user.id);
        expectedLocations.set(
          result.user.email,
          locationId === null ? null : locationId,
        );
      }

      const stored = await prisma.user.findMany({
        where: { email: { endsWith: ".internal@example.test" } },
        include: { accounts: true },
        orderBy: { email: "asc" },
      });

      expect(stored).toHaveLength(STAFF_CREATION_CASES.length);
      for (const user of stored) {
        expect(user.email).toBe(user.email.toLowerCase());
        expect(user.status).toBe("ACTIVE");
        expect(user.banned).toBe(false);
        expect(user.banReason).toBeNull();
        expect(user.banExpires).toBeNull();
        expect(user.credentialSetupRequired).toBe(false);
        expect(user.locationId).toBe(expectedLocations.get(user.email) ?? null);
        expect(user.accounts).toHaveLength(1);
        const account = user.accounts[0];
        expect(account.providerId).toBe("credential");
        expect(account.accountId).toBe(user.id);
        expect(account.password).toBeTruthy();
        expect(account.password).not.toBe("Temporary-Pass-1");
      }

      for (const testCase of STAFF_CREATION_CASES) {
        const email = `mixedcase.${testCase.key}.internal@example.test`;
        const row = stored.find((user) => user.email === email);
        expect(row?.role).toBe(testCase.role);
        expect(createdIds.get(testCase.role)).toBe(row?.id);
      }
    });
  }, 60_000);

  it("refuses to create a second Admin through the supported mechanism", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { fixture } = await signInOwner(prisma);

      await expect(
        internalUserAuth.api.createUser({
          body: {
            // A hostile or mistyped caller may lie about the role at runtime.
            email: "second-admin.owner@example.test",
            password: "Temporary-Pass-1",
            name: "Second Admin",
            role: "ADMIN" as "STOCK_STAFF",
          },
        }),
      ).rejects.toThrow(/only stock, branch, and accounting staff/i);

      const admins = await prisma.user.count({ where: { role: "ADMIN" } });
      expect(admins).toBe(1);
      const secondAdmin = await prisma.user.findUnique({
        where: { email: "second-admin.owner@example.test" },
      });
      expect(secondAdmin).toBeNull();
      expect(fixture.users.admin.role).toBe("ADMIN");
    });
  }, 60_000);

  it("replaces credentials without creating another User, Account, or Session", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const locations = await createLocationFixtures(prisma);
      const { ownerHeaders } = await signInOwner(prisma);

      const first = await internalUserAuth.api.createUser({
        body: {
          email: "reset-target.owner@example.test",
          password: "First-Temp-Pass-1",
          name: "Reset Target",
          role: "BRANCH_STAFF",
          locationId: locations.branches.QC.id,
        },
      });

      const sessionsBefore = await prisma.session.count({
        where: { userId: first.user.id },
      });
      expect(sessionsBefore).toBe(0);

      const reset = await internalUserAuth.api.setUserPassword({
        body: { userId: first.user.id, newPassword: "Second-Temp-Pass2" },
        headers: ownerHeaders,
      });
      expect(reset.status ?? true).toBe(true);

      const usersAfter = await prisma.user.findMany({
        where: { email: "reset-target.owner@example.test" },
        include: { accounts: true },
      });
      expect(usersAfter).toHaveLength(1);
      expect(usersAfter[0]?.accounts).toHaveLength(1);
      expect(usersAfter[0]?.accounts[0]?.password).toBeTruthy();
      expect(usersAfter[0]?.accounts[0]?.password).not.toBe("First-Temp-Pass-1");
      expect(await prisma.session.count({ where: { userId: first.user.id } }))
        .toBe(sessionsBefore);

      await expect(
        auth.api.signInEmail({
          body: {
            email: "reset-target.owner@example.test",
            password: "First-Temp-Pass-1",
          },
        }),
      ).rejects.toThrow();

      const reauth = await auth.api.signInEmail({
        body: {
          email: "reset-target.owner@example.test",
          password: "Second-Temp-Pass2",
        },
      });
      expect(reauth.user.id).toBe(first.user.id);
      expect(
        await prisma.session.count({ where: { userId: first.user.id } }),
      ).toBe(sessionsBefore + 1);
    });
  }, 60_000);

  it("keeps application status authoritative while plugin ban fields stay inert", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const locations = await createLocationFixtures(prisma);
      const { ownerHeaders } = await signInOwner(prisma);

      const target = await internalUserAuth.api.createUser({
        body: {
          email: "inactive-staff.owner@example.test",
          password: "Temporary-Pass-1",
          name: "Inactive Staff",
          role: "STOCK_STAFF",
          locationId: locations.stockRoom.id,
        },
      });
      await prisma.user.update({
        where: { id: target.user.id },
        data: { status: "INACTIVE" },
      });

      const reset = await internalUserAuth.api.setUserPassword({
        body: { userId: target.user.id, newPassword: "Another-Temp-Pass3" },
        headers: ownerHeaders,
      });
      expect(reset.status ?? true).toBe(true);

      const reloaded = await prisma.user.findUniqueOrThrow({
        where: { id: target.user.id },
      });
      expect(reloaded.status).toBe("INACTIVE");
      expect(reloaded.banned).toBe(false);
      expect(reloaded.banReason).toBeNull();
      expect(reloaded.banExpires).toBeNull();
    });
  }, 60_000);
});
