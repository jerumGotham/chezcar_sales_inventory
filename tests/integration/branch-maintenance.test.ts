import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/services/branches", async () =>
  import("../../lib/server/services/branches"),
);

import type {
  CreateBranchRequest,
  UpdateBranchRequest,
} from "../../lib/contracts/branches";
import {
  findActiveBranch,
  findActiveOperationalLocation,
  listActiveBranches,
  listActiveOperationalLocations,
} from "../../lib/server/locations";
import { prisma as sharedPrisma } from "../../lib/server/prisma";
import {
  createBranch,
  listBranches,
  updateBranch,
} from "../../lib/server/services/branches";
import { withDisposableDatabase } from "../helpers/database";

afterEach(async () => {
  await sharedPrisma.$disconnect();
});

describe("persisted branch maintenance", () => {
  it("creates uppercase active branches, lists them as options, and keeps codes immutable", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const input = {
        code: "dv",
        name: "Davao City",
        city: "Davao City",
        email: "davao@example.test",
      } as CreateBranchRequest;
      const created = await createBranch(input);

      expect(created).toMatchObject({
        code: "DV",
        name: "Davao City",
        city: "Davao City",
      });
      await expect(listActiveBranches(prisma)).resolves.toContainEqual({
        id: created.id,
        code: "DV",
        name: "Davao City",
      });

      const update = { code: "XX", name: "Davao" } as UpdateBranchRequest;
      await expect(updateBranch(created.id, update)).resolves.toMatchObject({
        code: "DV",
        name: "Davao",
      });
      await expect(listBranches()).resolves.toHaveLength(1);
    });
  });

  it("rejects duplicate codes and never treats SR as a branch", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      await prisma.location.create({
        data: { code: "SR", name: "Stock Room", type: "WAREHOUSE" },
      });
      await createBranch({ code: "qc", name: "Quezon City" });

      await expect(
        createBranch({ code: "QC", name: "Other" }),
      ).rejects.toMatchObject({
        status: 409,
        code: "BRANCH_CODE_IN_USE",
      });
      expect(await listActiveBranches(prisma)).toHaveLength(1);
    });
  });

  it("excludes inactive and non-branch rows from shared branch sources", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const [active, inactive] = await Promise.all([
        prisma.location.create({
          data: { code: "DV", name: "Davao City", type: "BRANCH" },
        }),
        prisma.location.create({
          data: {
            code: "CDO",
            name: "Cagayan de Oro",
            type: "BRANCH",
            isActive: false,
          },
        }),
        prisma.location.create({
          data: { code: "SR", name: "Stock Room", type: "WAREHOUSE" },
        }),
      ]);

      await expect(findActiveBranch(active.id, prisma)).resolves.toMatchObject({
        code: "DV",
      });
      await expect(findActiveBranch(inactive.id, prisma)).resolves.toBeNull();
      await expect(listActiveBranches(prisma)).resolves.toEqual([
        { id: active.id, code: "DV", name: "Davao City" },
      ]);
      await expect(listActiveOperationalLocations(prisma)).resolves.toEqual([
        expect.objectContaining({ code: "SR", type: "WAREHOUSE" }),
        expect.objectContaining({ code: "DV", type: "BRANCH" }),
      ]);

      await prisma.location.createMany({
        data: [
          { code: "D1", name: "Duplicate", type: "BRANCH" },
          { code: "D2", name: "Duplicate", type: "BRANCH" },
        ],
      });
      await expect(
        findActiveOperationalLocation("Duplicate", prisma),
      ).resolves.toBeNull();
    });
  });
});
