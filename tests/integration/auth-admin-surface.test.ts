import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/auth", async () => import("../../lib/server/auth"));

import { auth } from "../../lib/server/auth";
import { internalUserAuth } from "../../lib/server/internal-user-auth";
import { withDisposableDatabase } from "../helpers/database";
import { createAuthFixture } from "../helpers/factories";

const STAFF_CREATION_CASES = [
  { role: "STOCK_STAFF", key: "stock-staff" },
  { role: "BRANCH_STAFF", key: "branch-staff" },
  { role: "ACCOUNTING_STAFF", key: "accounting-staff" },
] as const;

const OWNER_TEMP_PASSWORD = "Owner-Temp-Pass-1";

describe("internal staff credential primitives", () => {
  it("creates exactly one fixed-role credential record per supported staff role", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const createdUsers = [];
      for (const testCase of STAFF_CREATION_CASES) {
        const result = await internalUserAuth.api.createUser({
          body: {
            email: `MixedCase.${testCase.key}.internal@example.test`,
            password: "Temporary-Pass-1",
            name: `Internal ${testCase.role}`,
            role: testCase.role,
          },
        });
        createdUsers.push(result.user);
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
        expect(user.accounts).toHaveLength(1);
        const account = user.accounts[0];
        expect(account.providerId).toBe("credential");
        expect(account.accountId).toBe(user.id);
        expect(account.password).toBeTruthy();
        expect(account.password).not.toBe("Temporary-Pass-1");
      }

      const rolesByEmail = new Map(stored.map((user) => [user.email, user.role]));
      for (const [index, testCase] of STAFF_CREATION_CASES.entries()) {
        const email = `mixedcase.${testCase.key}.internal@example.test`;
        expect(rolesByEmail.get(email)).toBe(testCase.role);
        expect(createdUsers[index]?.id).toBe(
          stored.find((user) => user.email === email)?.id,
        );
      }
    });
  }, 60_000);

  it("refuses to create a second Admin through the supported mechanism", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      await createAuthFixture(prisma, { namespace: "admin-guard" });

      await expect(
        internalUserAuth.api.createUser({
          body: {
            // A hostile or mistyped caller may lie about the role at runtime.
            email: "second-admin.admin-guard@example.test",
            password: "Temporary-Pass-1",
            name: "Second Admin",
            role: "ADMIN" as "STOCK_STAFF",
          },
        }),
      ).rejects.toThrow(/only stock, branch, and accounting staff/i);

      const admins = await prisma.user.count({ where: { role: "ADMIN" } });
      expect(admins).toBe(1);
      const secondAdmin = await prisma.user.findUnique({
        where: { email: "second-admin.admin-guard@example.test" },
      });
      expect(secondAdmin).toBeNull();
    });
  }, 60_000);

  it("replaces credentials without creating another User, Account, or Session", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "reset-flow",
      });
      const ownerHeaders = new Headers({
        cookie: `better-auth.session_token=${fixture.sessions.valid.token}`,
      });

      const first = await internalUserAuth.api.createUser({
        body: {
          email: "reset-target.reset-flow@example.test",
          password: "First-Temp-Pass-1",
          name: "Reset Target",
          role: "BRANCH_STAFF",
        },
      });

      const hashBefore = await prisma.account.findFirstOrThrow({
        where: { userId: first.user.id, providerId: "credential" },
      });

      const sessionsBefore = await prisma.session.count({
        where: { userId: first.user.id },
      });

      const reset = await internalUserAuth.api.setUserPassword({
        body: { userId: first.user.id, newPassword: "Second-Temp-Pass2" },
        headers: ownerHeaders,
      });
      expect(reset.status ?? true).toBe(true);

      const usersAfter = await prisma.user.findMany({
        where: { email: "reset-target.reset-flow@example.test" },
        include: { accounts: true },
      });
      expect(usersAfter).toHaveLength(1);
      expect(usersAfter[0]?.accounts).toHaveLength(1);

      const hashAfter = usersAfter[0]?.accounts[0];
      expect(hashAfter?.password).toBeTruthy();
      expect(hashAfter?.password).not.toBe(hashBefore.password);

      expect(await prisma.session.count({ where: { userId: first.user.id } }))
        .toBe(sessionsBefore);

      await expect(
        auth.api.signInEmail({
          body: {
            email: "reset-target.reset-flow@example.test",
            password: "First-Temp-Pass-1",
          },
        }),
      ).rejects.toThrow();

      const reauth = await auth.api.signInEmail({
        body: {
          email: "reset-target.reset-flow@example.test",
          password: "Second-Temp-Pass2",
        },
      });
      expect(reauth.user.id).toBe(first.user.id);
      expect((await prisma.session.count({ where: { userId: first.user.id } })))
        .toBe(sessionsBefore + 1);
    });
  }, 60_000);

  it("keeps application status authoritative while plugin ban fields stay inert", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "status-drift",
      });
      const ownerHeaders = new Headers({
        cookie: `better-auth.session_token=${fixture.sessions.valid.token}`,
      });
      const target = fixture.users.inactiveBranchStaff;

      await internalUserAuth.api.setUserPassword({
        body: { userId: target.id, newPassword: OWNER_TEMP_PASSWORD },
        headers: ownerHeaders,
      });

      const reloaded = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(reloaded.status).toBe("INACTIVE");
      expect(reloaded.banned).toBe(false);
      expect(reloaded.banReason).toBeNull();
      expect(reloaded.banExpires).toBeNull();
    });
  }, 60_000);
});
