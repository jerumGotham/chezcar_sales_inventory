import { describe, expect, it } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import {
  createAuthFixture,
  createUserFixture,
} from "../helpers/factories";

describe("persisted authorization factories", () => {
  it("reloads canonical locations, actors, session states, and explicit invalid assignments", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "canonical",
      });

      const locations = await prisma.location.findMany({
        orderBy: { code: "asc" },
      });
      expect(locations.map(({ code, type, isActive }) => ({ code, type, isActive })))
        .toEqual([
          { code: "BL", type: "BRANCH", isActive: true },
          { code: "LU", type: "BRANCH", isActive: true },
          { code: "QC", type: "BRANCH", isActive: true },
          { code: "SP", type: "BRANCH", isActive: true },
          { code: "SR", type: "WAREHOUSE", isActive: true },
          { code: "VC", type: "BRANCH", isActive: true },
        ]);

      const users = await prisma.user.findMany({
        where: {
          OR: [
            { email: { endsWith: ".canonical@example.test" } },
            { id: fixture.users.admin.id },
          ],
        },
        orderBy: { email: "asc" },
      });
      expect(
        users.map(({ role, status, locationId }) => ({
          role,
          status,
          locationId,
        })),
      ).toEqual(
        expect.arrayContaining([
          { role: "ADMIN", status: "ACTIVE", locationId: null },
          { role: "STOCK_STAFF", status: "ACTIVE", locationId: fixture.locations.stockRoom.id },
          { role: "BRANCH_STAFF", status: "ACTIVE", locationId: fixture.locations.branches.QC.id },
          { role: "ACCOUNTING_STAFF", status: "ACTIVE", locationId: null },
          { role: "BRANCH_STAFF", status: "INACTIVE", locationId: fixture.locations.branches.BL.id },
        ]),
      );
      expect(fixture.invalidAssignments).toBeNull();

      const validSession = await prisma.session.findUnique({
        where: { token: fixture.sessions.valid.token },
      });
      const expiredSession = await prisma.session.findUnique({
        where: { token: fixture.sessions.expired.token },
      });
      const revokedSession = await prisma.session.findUnique({
        where: { token: fixture.sessions.revoked.token },
      });
      expect(validSession?.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(expiredSession?.expiresAt.getTime()).toBeLessThan(Date.now());
      expect(revokedSession).toBeNull();

      await expect(
        createUserFixture(prisma, fixture.locations, {
          namespace: "guarded",
          role: "STOCK_STAFF",
          locationId: null,
        }),
      ).rejects.toThrow(/invalid role\/location assignment/i);

      const withInvalidAssignments = await createAuthFixture(prisma, {
        namespace: "invalid",
        includeInvalidAssignments: true,
      });
      expect(withInvalidAssignments.invalidAssignments).not.toBeNull();

      const invalidUsers = await prisma.user.findMany({
        where: {
          email: {
            startsWith: "invalid-",
            endsWith: ".invalid@example.test",
          },
        },
      });
      expect(
        invalidUsers.map(({ role, locationId }) => ({ role, locationId })),
      ).toEqual(
        expect.arrayContaining([
          { role: "STOCK_STAFF", locationId: withInvalidAssignments.locations.branches.BL.id },
          { role: "BRANCH_STAFF", locationId: withInvalidAssignments.locations.stockRoom.id },
        ]),
      );
      expect(invalidUsers).toHaveLength(2);
    });
  }, 30_000);
});
