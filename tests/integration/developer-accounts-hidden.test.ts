import type { AuthContext } from "@/lib/server/authorization";
import { describe, expect, it, vi } from "vitest";

import { userListQuerySchema } from "@/lib/contracts/users";
import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});
void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

describe("Developer accounts in role and user maintenance", () => {
  it("are listed, offered and editable by no one, the developer included", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "developer-hidden" });
      const owner: AuthContext = authContextFor(fixture.users.admin, fixture.locations.branches.QC);
      const developer: AuthContext = { ...owner, isDeveloper: true };

      await prisma.roleDefinition.create({
        data: {
          id: "role-support-readonly", key: "support-readonly", name: "Support (read only)",
          description: "test", scope: "BUSINESS_WIDE", permissions: ["dashboard:view", "locations:all"], isSystem: true,
        },
      });
      const support = await prisma.user.create({
        data: { name: "Jerum (support)", email: "jerum@gmail.com", emailVerified: true, roleDefinitionId: "role-support-readonly", status: "ACTIVE" },
      });

      const { listRoleDefinitions, listAssignableRoleDefinitions, getRoleDefinition } = await import("../../lib/server/services/roles");
      const { listUsers, updateStaffUser } = await import("../../lib/server/services/users");

      expect((await listRoleDefinitions()).map((role) => role.id)).not.toContain("role-support-readonly");
      for (const actor of [owner, developer]) {
        // The Create User role picker reads this list.
        expect((await listAssignableRoleDefinitions(actor)).map((role) => role.id)).not.toContain("role-support-readonly");
        const users = await listUsers(actor, userListQuerySchema.parse({}));
        expect(users.data.map((user) => user.id)).not.toContain(support.id);
        await expect(updateStaffUser(actor, support.id, { name: "Renamed" })).rejects.toMatchObject({ status: 404 });
      }
      await expect(getRoleDefinition("role-support-readonly")).rejects.toMatchObject({ status: 404 });
    });
  });
});
