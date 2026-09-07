import type { AuthContext } from "@/lib/server/authorization";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { authContextFor, createAuthFixture } from "../helpers/factories";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});
void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

function personnelActor(
  user: Parameters<typeof authContextFor>[0],
  location: Parameters<typeof authContextFor>[1],
  capabilities = ["personnel:view", "personnel:create", "personnel:update", "personnel:deactivate"] as const,
): AuthContext {
  return { ...authContextFor(user, location), isOwner: false, capabilities };
}

describe("personnel maintenance", () => {
  it("enforces branch scope across create, list, reassignment, and lifecycle", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "personnel-maintenance" });
      const qc = fixture.locations.branches.QC;
      const bl = fixture.locations.branches.BL;
      const actor = personnelActor(fixture.users.branchStaff, qc);
      const {
        createPersonnel,
        listPersonnel,
        setPersonnelStatus,
        updatePersonnel,
      } = await import("../../lib/server/services/personnel");

      const created = await createPersonnel(actor, { fullName: " Ana Reyes ", locationId: qc.id, type: "BOTH" });
      expect(created).toMatchObject({ fullName: "Ana Reyes", locationId: qc.id, type: "BOTH", status: "ACTIVE" });
      expect(await prisma.user.findFirst({ where: { name: "Ana Reyes" } })).toBeNull();
      await expect(createPersonnel(actor, { fullName: "Outside", locationId: bl.id, type: "INSTALLER" })).rejects.toThrow("outside assigned locations");

      await prisma.personnel.create({ data: { fullName: "BL Salesperson", locationId: bl.id, type: "SALESPERSON" } });
      await expect(listPersonnel(actor)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
      await expect(updatePersonnel(actor, created.id, { locationId: bl.id })).rejects.toThrow("outside assigned locations");

      await setPersonnelStatus(actor, created.id, { status: "INACTIVE" });
      await expect(listPersonnel(actor)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, status: "INACTIVE" })]));
      await setPersonnelStatus(actor, created.id, { status: "ACTIVE" });
      expect(await prisma.personnel.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
        createdById: actor.userId,
        reactivatedById: actor.userId,
      });
    });
  }, 30_000);

  it("rejects Stock Room and inactive branches as a home branch", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, { namespace: "personnel-branch" });
      const admin = { ...authContextFor(fixture.users.admin, null), capabilities: ["personnel:create"] } as AuthContext;
      const { createPersonnel } = await import("../../lib/server/services/personnel");
      await expect(createPersonnel(admin, { fullName: "SR Person", locationId: fixture.locations.stockRoom.id, type: "INSTALLER" })).rejects.toMatchObject({ code: "INVALID_PERSONNEL_BRANCH" });
      const branch = fixture.locations.branches.LU;
      await prisma.location.update({ where: { id: branch.id }, data: { isActive: false } });
      await expect(createPersonnel(admin, { fullName: "Inactive Branch", locationId: branch.id, type: "SALESPERSON" })).rejects.toMatchObject({ code: "INVALID_PERSONNEL_BRANCH" });
    });
  }, 30_000);
});

afterEach(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});

afterAll(async () => {
  const { prisma } = await import("../../lib/server/prisma");
  await prisma.$disconnect();
});
