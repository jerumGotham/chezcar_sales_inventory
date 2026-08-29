import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

import type { AuthContext } from "../../lib/server/authorization";
import { prisma as sharedPrisma } from "../../lib/server/prisma";
import { authContextFor, createAuthFixture, createUserFixture } from "../helpers/factories";
import { withDisposableDatabase } from "../helpers/database";

describe("role and location authorization maintenance", () => {
  afterEach(async () => {
    await sharedPrisma.$disconnect();
  });

  it("delegates administration and safely removes all-location access", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "roles" });
      const actor = authContextFor(fixture.users.admin, null);
      const { createRoleDefinition, updateRoleDefinition } = await import(
        "../../lib/server/services/roles"
      );
      const { updateStaffUser } = await import("../../lib/server/services/users");

      const role = await createRoleDefinition(actor, {
        name: "Delegated administrator",
        description: "Administers users at every location",
        permissions: ["locations:all", "users:view", "users:update", "roles:view"],
      });
      expect(role).not.toHaveProperty("scope");
      expect(role.permissions).toContain("users:update");

      await updateStaffUser(actor, fixture.users.branchStaff.id, {
        roleId: role.id,
        locationIds: [],
      });
      await expect(
        updateRoleDefinition(actor, role.id, {
          version: role.version,
          permissions: ["users:view", "users:update", "roles:view"],
        }),
      ).rejects.toMatchObject({ code: "LOCATION_ASSIGNMENT_REQUIRED", status: 409 });

      await updateStaffUser(actor, fixture.users.branchStaff.id, {
        locationIds: [fixture.locations.branches.QC.id, fixture.locations.stockRoom.id],
      });
      const updated = await updateRoleDefinition(actor, role.id, {
        version: role.version,
        permissions: ["users:view", "users:update", "roles:view"],
      });
      expect(updated.permissions).not.toContain("locations:all");

      const assignments = await prisma.userLocation.findMany({
        where: { userId: fixture.users.branchStaff.id },
        orderBy: { locationId: "asc" },
      });
      expect(assignments.map(({ locationId }) => locationId).sort()).toEqual(
        [fixture.locations.branches.QC.id, fixture.locations.stockRoom.id].sort(),
      );

      await expect(
        updateRoleDefinition(actor, "role-admin", { version: 1, name: "Changed Admin" }),
      ).rejects.toMatchObject({ code: "OWNER_ROLE_IMMUTABLE", status: 403 });
    });
  }, 60_000);

  it("preserves role uniqueness, optimistic versions, and permission-change session revocation", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "role-safeguards" });
      const actor = authContextFor(fixture.users.admin, null);
      const { createRoleDefinition, updateRoleDefinition } = await import(
        "../../lib/server/services/roles"
      );
      const { updateStaffUser } = await import("../../lib/server/services/users");

      const role = await createRoleDefinition(actor, {
        name: "Branch Cashier",
        description: "Posts sales",
        permissions: ["sales:post"],
      });
      await expect(
        createRoleDefinition(actor, {
          name: "branch cashier",
          description: "Duplicate case",
          permissions: [],
        }),
      ).rejects.toMatchObject({ code: "ROLE_NAME_IN_USE", status: 409 });

      await updateStaffUser(actor, fixture.users.branchStaff.id, {
        roleId: role.id,
        locationIds: [fixture.locations.branches.QC.id],
      });
      await prisma.session.create({
        data: {
          id: "role-revocation-session",
          token: "role-revocation-token",
          expiresAt: new Date(Date.now() + 60_000),
          userId: fixture.users.branchStaff.id,
        },
      });

      const updated = await updateRoleDefinition(actor, role.id, {
        version: role.version,
        permissions: ["sales:view"],
      });
      expect(updated.version).toBe(role.version + 1);
      expect(await prisma.session.count({ where: { userId: fixture.users.branchStaff.id } })).toBe(0);
      await expect(
        updateRoleDefinition(actor, role.id, {
          version: role.version,
          description: "Stale update",
        }),
      ).rejects.toMatchObject({ code: "ROLE_VERSION_CONFLICT", status: 409 });
    });
  }, 60_000);

  it("prevents delegated grant and self-management escalation", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "delegated-roles" });
      const owner = authContextFor(fixture.users.admin, null);
      const { createRoleDefinition, listAssignableRoleDefinitions, updateRoleDefinition } = await import(
        "../../lib/server/services/roles"
      );
      const { resetStaffPassword, setStaffStatus, updateStaffUser } = await import(
        "../../lib/server/services/users"
      );

      const managerRole = await createRoleDefinition(owner, {
        name: "QC Access Manager",
        description: "Delegated role and user manager",
        permissions: ["roles:view", "roles:create", "roles:update", "users:view", "users:update", "users:set-status", "users:reset-password"],
      });
      await prisma.user.update({
        where: { id: fixture.users.branchStaff.id },
        data: { roleDefinitionId: managerRole.id },
      });
      const manager: AuthContext = {
        userId: fixture.users.branchStaff.id,
        roleDefinitionId: managerRole.id,
        capabilities: managerRole.permissions,
        isOwner: false,
        locationIds: [fixture.locations.branches.QC.id],
      };

      await expect(
        createRoleDefinition(manager, {
          name: "Escalated Role",
          description: "Must fail",
          permissions: ["sales:void-replace"],
        }),
      ).rejects.toMatchObject({ code: "ROLE_GRANT_EXCEEDS_ACTOR", status: 403 });
      const subordinate = await createRoleDefinition(owner, {
        name: "QC Viewer",
        description: "Within delegated ceiling",
        permissions: ["roles:view"],
      });
      await expect(
        updateRoleDefinition(manager, subordinate.id, {
          version: subordinate.version,
          permissions: ["sales:void-replace"],
        }),
      ).rejects.toMatchObject({ code: "ROLE_GRANT_EXCEEDS_ACTOR", status: 403 });
      await expect(
        updateRoleDefinition(manager, managerRole.id, {
          version: managerRole.version,
          description: "Self edited",
        }),
      ).rejects.toMatchObject({ code: "SELF_ROLE_EDIT_FORBIDDEN", status: 403 });

      const superior = await createRoleDefinition(owner, {
        name: "Superior Role",
        description: "Exceeds delegated capabilities",
        permissions: ["users:view", "sales:void-replace"],
      });
      await expect(
        updateRoleDefinition(manager, superior.id, {
          version: superior.version,
          permissions: ["users:view"],
        }),
      ).rejects.toMatchObject({ code: "ROLE_GRANT_EXCEEDS_ACTOR", status: 403 });
      await expect(
        updateRoleDefinition(manager, superior.id, {
          version: superior.version,
          description: "Inferior manager edit",
        }),
      ).rejects.toMatchObject({ code: "ROLE_GRANT_EXCEEDS_ACTOR", status: 403 });
      const assignableOptions = await listAssignableRoleDefinitions(manager);
      expect(assignableOptions.map((role) => role.id)).toContain(subordinate.id);
      expect(assignableOptions.map((role) => role.id)).not.toContain(superior.id);
      const target = await createUserFixture(prisma, fixture.locations, {
        namespace: "delegated-roles",
        key: "qc-target",
        role: "BRANCH_STAFF",
        locationId: fixture.locations.branches.QC.id,
      });
      await prisma.user.update({
        where: { id: target.id },
        data: { roleDefinitionId: subordinate.id },
      });
      await expect(
        updateStaffUser(manager, target.id, {
          roleId: superior.id,
          locationIds: [fixture.locations.branches.QC.id],
        }),
      ).rejects.toMatchObject({ code: "ROLE_GRANT_EXCEEDS_ACTOR", status: 403 });
      await expect(
        updateStaffUser(manager, manager.userId, {
          locationIds: [fixture.locations.branches.QC.id],
        }),
      ).rejects.toMatchObject({ code: "SELF_MANAGEMENT_FORBIDDEN", status: 403 });
      await expect(setStaffStatus(manager, manager.userId, "INACTIVE")).rejects.toMatchObject({
        code: "SELF_MANAGEMENT_FORBIDDEN",
        status: 403,
      });
      await expect(
        resetStaffPassword(manager, new Headers(), manager.userId, "New-Password-123"),
      ).rejects.toMatchObject({ code: "SELF_MANAGEMENT_FORBIDDEN", status: 403 });
    });
  }, 60_000);

  it("serializes all-location removal against assignment replacement", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "role-concurrency" });
      const owner = authContextFor(fixture.users.admin, null);
      const { createRoleDefinition, updateRoleDefinition } = await import(
        "../../lib/server/services/roles"
      );
      const { updateStaffUser } = await import("../../lib/server/services/users");
      const role = await createRoleDefinition(owner, {
        name: "Concurrent All Locations",
        description: "Exercises role and assignment locking",
        permissions: ["locations:all", "users:view"],
      });
      await updateStaffUser(owner, fixture.users.branchStaff.id, {
        roleId: role.id,
        locationIds: [],
      });

      await Promise.allSettled([
        updateRoleDefinition(owner, role.id, {
          version: role.version,
          permissions: ["users:view"],
        }),
        updateStaffUser(owner, fixture.users.branchStaff.id, {
          locationIds: [fixture.locations.branches.QC.id],
        }),
      ]);

      const [persistedRole, assignmentCount] = await Promise.all([
        prisma.roleDefinition.findUniqueOrThrow({ where: { id: role.id } }),
        prisma.userLocation.count({ where: { userId: fixture.users.branchStaff.id } }),
      ]);
      if (!persistedRole.permissions.includes("locations:all")) {
        expect(assignmentCount).toBeGreaterThan(0);
      }
    });
  }, 60_000);
});
