import type { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
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

  it("creates exactly one inactive staging credential per supported staff role", async () => {
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
            roleDefinitionId: `role-${testCase.role.toLowerCase().replaceAll("_", "-")}`,
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
        expect(user.status).toBe("INACTIVE");
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
            roleDefinitionId: "role-branch-staff",
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
          roleDefinitionId: "role-branch-staff",
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

      await prisma.user.update({
        where: { id: first.user.id },
        data: { status: "ACTIVE" },
      });

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
          roleDefinitionId: "role-stock-staff",
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

function publicAuthRequest(
  method: "GET" | "POST",
  authPath: string,
  body?: unknown,
) {
  return new Request(`http://localhost/api/auth${authPath}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function countPrincipals(prisma: PrismaClient) {
  const [users, accounts, sessions] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.session.count(),
  ]);
  return { users, accounts, sessions };
}

const GENERIC_ADMIN_OPERATIONS = [
  {
    name: "create-user",
    method: "POST" as const,
    path: "/admin/create-user",
    body: { email: "generic.owner@example.test", password: "Generic-Pass-1", name: "Generic" },
  },
  {
    name: "list-users",
    method: "GET" as const,
    path: "/admin/list-users?limit=10",
  },
  {
    name: "set-user-password",
    method: "POST" as const,
    path: "/admin/set-user-password",
    body: { userId: "target", newPassword: "Generic-Pass-1" },
  },
  {
    name: "set-role",
    method: "POST" as const,
    path: "/admin/set-role",
    body: { userId: "target", role: "ADMIN" },
  },
  {
    name: "ban-user",
    method: "POST" as const,
    path: "/admin/ban-user",
    body: { userId: "target" },
  },
  {
    name: "unban-user",
    method: "POST" as const,
    path: "/admin/unban-user",
    body: { userId: "target" },
  },
  {
    name: "remove-user",
    method: "POST" as const,
    path: "/admin/remove-user",
    body: { userId: "target" },
  },
  {
    name: "revoke-user-sessions",
    method: "POST" as const,
    path: "/admin/revoke-user-sessions",
    body: { userId: "target" },
  },
];

describe("public auth surface", () => {
  afterEach(async () => {
    await sharedPrisma.$disconnect();
  });

  it("keeps public sign-up unavailable without any database mutation", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const before = await countPrincipals(prisma);

      const response = await auth.handler(
        publicAuthRequest("POST", "/sign-up/email", {
          email: "public-signup.owner@example.test",
          password: "Public-Pass-123",
          name: "Public Sign Up",
        }),
      );
      const body = (await response.json()) as {
        code?: string;
        message?: string;
      };

      expect(response.status).toBe(400);
      expect(body.code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");

      expect(await countPrincipals(prisma)).toEqual(before);
    });
  }, 60_000);

  it.each(GENERIC_ADMIN_OPERATIONS)(
    "leaves generic Admin $name unroutable through the public catch-all",
    async (operation) => {
      await withDisposableDatabase(async ({ prisma }) => {
        const { fixture } = await signInOwner(prisma);
        const before = await countPrincipals(prisma);
        const targeted = JSON.stringify(operation.body ?? {}).replace(
          '"target"',
          JSON.stringify(fixture.users.branchStaff.id),
        );

        const response = await auth.handler(
          new Request(`http://localhost/api/auth${operation.path}`, {
            method: operation.method,
            headers: { "content-type": "application/json" },
            ...(operation.body === undefined
              ? {}
              : { body: targeted }),
          }),
        );

        expect(response.status).toBe(404);
        expect(await countPrincipals(prisma)).toEqual(before);
      });
    },
    60_000,
  );

  it("binds the catch-all to the public auth instance only", () => {
    const routeSource = readFileSync(
      path.join("app", "api", "auth", "[...all]", "route.ts"),
      "utf8",
    );
    const importSources = [...routeSource.matchAll(/from\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(importSources).toEqual(["better-auth/next-js", "@/lib/server/auth"]);

    const appFiles = readdirSync(path.join("app"), {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => /\.(ts|tsx|mts)$/.test(file));
    for (const file of appFiles) {
      const source = readFileSync(path.join("app", file), "utf8");
      expect(source).not.toContain("internal-user-auth");
    }

    const internalSource = readFileSync(
      path.join("lib", "server", "internal-user-auth.ts"),
      "utf8",
    );
    expect(internalSource.startsWith('import "server-only";')).toBe(true);
  });
});
