import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";
import { prisma as sharedPrisma } from "../../lib/server/prisma";

describe("persisted role maintenance", () => {
  afterEach(async () => {
    await sharedPrisma.$disconnect();
  });

  it("creates and updates custom roles with assignment, version, and session safeguards", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "roles" });
      const actor = authContextFor(fixture.users.admin, null);
      const {
        createRoleDefinition,
        updateRoleDefinition,
      } = await import("../../lib/server/services/roles");
      const { createStaffUser, updateStaffUser } = await import(
        "../../lib/server/services/users"
      );

      const created = await createRoleDefinition({
        name: "Branch Cashier",
        description: "Posts branch sales",
        scope: "BRANCH",
        permissions: ["dashboard:view", "sales:post"],
      });
      expect(created).toMatchObject({
        name: "Branch Cashier",
        scope: "BRANCH",
        isOwner: false,
        isAssignable: true,
        assignedUserCount: 0,
        version: 1,
      });

      await expect(
        createRoleDefinition({
          name: "branch cashier",
          description: "Duplicate case",
          scope: "BRANCH",
          permissions: [],
        }),
      ).rejects.toMatchObject({ code: "ROLE_NAME_IN_USE", status: 409 });

      await expect(
        createRoleDefinition({
          name: "Branch Administrator",
          description: "Must not receive owner maintenance access",
          scope: "BRANCH",
          permissions: ["branches:manage"],
        }),
      ).rejects.toMatchObject({ code: "OWNER_PERMISSION_ONLY", status: 400 });

      await prisma.user.update({
        where: { id: fixture.users.branchStaff.id },
        data: { roleDefinitionId: created.id, role: "BRANCH_STAFF" },
      });
      await prisma.session.create({
        data: {
          id: "assigned-role-session",
          token: "assigned-role-token",
          expiresAt: new Date(Date.now() + 60_000),
          userId: fixture.users.branchStaff.id,
        },
      });

      await expect(
        updateRoleDefinition(created.id, {
          version: created.version,
          scope: "BUSINESS_WIDE",
        }),
      ).rejects.toMatchObject({ code: "ROLE_SCOPE_ASSIGNED", status: 409 });

      const updated = await updateRoleDefinition(created.id, {
        version: created.version,
        name: "Branch Sales",
        permissions: ["dashboard:view"],
      });
      expect(updated).toMatchObject({ name: "Branch Sales", version: 2 });
      expect(
        await prisma.session.count({ where: { userId: fixture.users.branchStaff.id } }),
      ).toBe(0);

      await expect(
        updateRoleDefinition(created.id, {
          version: created.version,
          description: "Stale write",
        }),
      ).rejects.toMatchObject({ code: "ROLE_VERSION_CONFLICT", status: 409 });

      const concurrentRole = await createRoleDefinition({
        name: "Concurrent Role",
        description: "Exercises assignment and scope serialization",
        scope: "BRANCH",
        permissions: ["dashboard:view"],
      });
      await Promise.allSettled([
        updateRoleDefinition(concurrentRole.id, {
          version: concurrentRole.version,
          scope: "BUSINESS_WIDE",
        }),
        updateStaffUser(actor, fixture.users.branchStaff.id, {
          roleId: concurrentRole.id,
          locationId: fixture.locations.branches.QC.id,
        }),
      ]);

      const concurrentAssignment = await prisma.user.findUniqueOrThrow({
        where: { id: fixture.users.branchStaff.id },
        select: {
          role: true,
          locationId: true,
          accessRole: { select: { scope: true } },
        },
      });
      if (concurrentAssignment.accessRole.scope === "BRANCH") {
        expect(concurrentAssignment).toMatchObject({
          role: "BRANCH_STAFF",
          locationId: fixture.locations.branches.QC.id,
        });
      } else {
        expect(concurrentAssignment).toMatchObject({
          role: "ACCOUNTING_STAFF",
          locationId: null,
          accessRole: { scope: "BUSINESS_WIDE" },
        });
      }

      const accountCountBeforeFailure = await prisma.account.count();
      const cleanupError = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(
        createStaffUser(
          actor,
          {
            roleId: concurrentRole.id,
            name: "Failed Provision",
            email: "failed.provision@example.test",
            temporaryPassword: "Temp-Pass-123",
            locationId: fixture.locations.branches.QC.id,
          },
          { injectFailureAfterCredentialWrite: true },
        ),
      ).rejects.toThrow("Injected credential-finalization failure");
      await expect(
        prisma.user.findUnique({
          where: { email: "failed.provision@example.test" },
        }),
      ).resolves.toBeNull();
      await expect(prisma.account.count()).resolves.toBe(accountCountBeforeFailure);

      await expect(
        createStaffUser(
          actor,
          {
            roleId: concurrentRole.id,
            name: "Inactive Failed Provision",
            email: "inactive.failed.provision@example.test",
            temporaryPassword: "Temp-Pass-123",
            locationId: fixture.locations.branches.QC.id,
          },
          {
            injectFailureAfterCredentialWrite: true,
            injectCleanupFailure: true,
          },
        ),
      ).rejects.toThrow("Injected credential-finalization failure");
      expect(cleanupError).toHaveBeenCalledWith(
        "Unable to remove a partially provisioned user",
        expect.any(Error),
      );
      cleanupError.mockRestore();
      const inactiveStagingUser = await prisma.user.findUniqueOrThrow({
        where: { email: "inactive.failed.provision@example.test" },
        include: { accounts: true },
      });
      expect(inactiveStagingUser).toMatchObject({
        status: "INACTIVE",
        credentialSetupRequired: false,
      });
      expect(inactiveStagingUser.accounts).toHaveLength(1);
      await prisma.user.delete({ where: { id: inactiveStagingUser.id } });

      await expect(
        updateRoleDefinition("role-admin", {
          version: 1,
          name: "Changed Admin",
        }),
      ).rejects.toMatchObject({ code: "OWNER_ROLE_IMMUTABLE", status: 403 });
      expect(actor.isOwner).toBe(true);
    });
  }, 60_000);
});
