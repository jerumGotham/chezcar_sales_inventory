import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { withDisposableDatabase } from "../helpers/database";
import { createAuthFixture } from "../helpers/factories";

const testDatabaseUrl =
  "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";

const testEnvironment = vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
  return {};
});

void testEnvironment;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));

describe("operational data reset", () => {
  it("clears business data while preserving users, roles, products, and locations", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const fixture = await createAuthFixture(prisma, {
        namespace: "operational-reset",
      });
      const product = await prisma.product.create({
        data: {
          itemCode: "RESET-KEEP",
          name: "Preserved Product",
          imageKey: "00000000-0000-4000-8000-000000000001.png",
          imageType: "image/png",
        },
      });
      await prisma.inventoryBalance.create({
        data: {
          locationId: fixture.locations.branches.QC.id,
          productId: product.id,
          onHand: 5,
        },
      });
      await prisma.customer.create({
        data: { name: "Delete Me", createdById: fixture.users.admin.id },
      });
      await prisma.notification.create({
        data: { userId: fixture.users.admin.id, title: "Delete", description: "Delete" },
      });
      const before = {
        users: await prisma.user.count(),
        products: await prisma.product.count(),
        locations: await prisma.location.count(),
        roles: await prisma.roleDefinition.count(),
      };
      const { resetOperationalData } = await import(
        "../../prisma/reset-operational-data.mjs"
      );

      const result = await resetOperationalData(prisma, {
        nodeEnv: "test",
        databaseUrl: testDatabaseUrl,
        allowOperationalDataReset: "true",
      });

      expect(result.preserved).toEqual(before);
      await expect(prisma.user.count()).resolves.toBe(before.users);
      await expect(prisma.product.count()).resolves.toBe(before.products);
      await expect(prisma.location.count()).resolves.toBe(before.locations);
      await expect(prisma.roleDefinition.count()).resolves.toBe(before.roles);
      await expect(
        prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      ).resolves.toMatchObject({
        imageKey: "00000000-0000-4000-8000-000000000001.png",
        imageType: "image/png",
      });
      await expect(prisma.inventoryBalance.count()).resolves.toBe(0);
      await expect(prisma.customer.count()).resolves.toBe(0);
      await expect(prisma.notification.count()).resolves.toBe(0);
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
