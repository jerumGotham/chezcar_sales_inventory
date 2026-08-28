import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { withDisposableDatabase } from "../helpers/database";

type UserInsert = {
  id: string;
  email: string;
  role: "ADMIN" | "STOCK_STAFF" | "BRANCH_STAFF" | "ACCOUNTING_STAFF";
  locationId: string | null;
};

async function insertUser(prisma: PrismaClient, input: UserInsert) {
  return prisma.$executeRaw`
    INSERT INTO "User" (
      "id", "name", "email", "emailVerified", "role", "roleDefinitionId", "status", "locationId", "updatedAt"
    ) VALUES (
      ${input.id}, ${input.id}, ${input.email}, true,
      ${input.role}::"UserRole",
      ${`role-${input.role.toLowerCase().replaceAll("_", "-")}`},
      'ACTIVE', ${input.locationId}, CURRENT_TIMESTAMP
    )
  `;
}

describe("trusted foundation migration", () => {
  it("adds nullable catalog prices and Better Auth compatibility defaults", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      await prisma.$executeRaw`
        INSERT INTO "Product" ("id", "itemCode", "name", "price", "status", "updatedAt")
        VALUES ('no-price-product', 'NO-PRICE', 'Reviewed inactive product', NULL, 'INACTIVE', CURRENT_TIMESTAMP)
      `;
      await insertUser(prisma, {
        id: "owner-admin",
        email: "owner@example.test",
        role: "ADMIN",
        locationId: null,
      });
      await prisma.$executeRaw`
        INSERT INTO "Session" ("id", "expiresAt", "token", "userId", "updatedAt")
        VALUES ('owner-session', CURRENT_TIMESTAMP + INTERVAL '1 hour', 'owner-token', 'owner-admin', CURRENT_TIMESTAMP)
      `;

      const [user] = await prisma.$queryRaw<
        Array<{
          banned: boolean;
          banReason: string | null;
          banExpires: Date | null;
          credentialSetupRequired: boolean;
        }>
      >`
        SELECT "banned", "banReason", "banExpires", "credentialSetupRequired"
        FROM "User"
        WHERE "id" = 'owner-admin'
      `;
      const [session] = await prisma.$queryRaw<Array<{ impersonatedBy: string | null }>>`
        SELECT "impersonatedBy" FROM "Session" WHERE "id" = 'owner-session'
      `;

      expect(user).toEqual({
        banned: false,
        banReason: null,
        banExpires: null,
        credentialSetupRequired: false,
      });
      expect(session).toEqual({ impersonatedBy: null });
    });
  }, 30_000);

  it("rejects invalid role scope and a second Admin", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      await prisma.location.createMany({
        data: [
          { id: "stock-room", code: "SR", name: "Stock Room", type: "WAREHOUSE" },
          { id: "qc-branch", code: "QC", name: "QC Branch", type: "BRANCH" },
        ],
      });
      await insertUser(prisma, {
        id: "owner-admin",
        email: "owner@example.test",
        role: "ADMIN",
        locationId: null,
      });
      await insertUser(prisma, {
        id: "stock-staff",
        email: "stock@example.test",
        role: "STOCK_STAFF",
        locationId: "stock-room",
      });
      await insertUser(prisma, {
        id: "branch-staff",
        email: "branch@example.test",
        role: "BRANCH_STAFF",
        locationId: "qc-branch",
      });
      await insertUser(prisma, {
        id: "accounting-staff",
        email: "accounting@example.test",
        role: "ACCOUNTING_STAFF",
        locationId: null,
      });

      for (const invalid of [
        {
          id: "admin-with-location",
          email: "admin-location@example.test",
          role: "ADMIN" as const,
          locationId: "qc-branch",
        },
        {
          id: "accounting-with-location",
          email: "accounting-location@example.test",
          role: "ACCOUNTING_STAFF" as const,
          locationId: "qc-branch",
        },
        {
          id: "stock-without-location",
          email: "stock-null@example.test",
          role: "STOCK_STAFF" as const,
          locationId: null,
        },
        {
          id: "branch-without-location",
          email: "branch-null@example.test",
          role: "BRANCH_STAFF" as const,
          locationId: null,
        },
      ]) {
        await expect(insertUser(prisma, invalid)).rejects.toThrow(
          /User_role_location_check/,
        );
      }

      const singletonAdminIndexes = await prisma.$queryRaw<
        Array<{ indexname: string }>
      >`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'User_single_admin_key'
      `;
      expect(singletonAdminIndexes).toEqual([
        { indexname: "User_single_admin_key" },
      ]);

      await expect(
        insertUser(prisma, {
          id: "second-admin",
          email: "second-admin@example.test",
          role: "ADMIN",
          locationId: null,
        }),
      ).rejects.toThrow(/23505|already exists/i);
    });
  }, 30_000);
});
