import { readFile } from "node:fs/promises";

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
  it("executes the authorization migration SQL across its legacy backfill boundary", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const migrationSql = await readFile(
        "prisma/migrations/20260829190000_explicit_location_authorization/migration.sql",
        "utf8",
      );
      const statements = migrationSql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean);

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "authorization_boundary"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "authorization_boundary"`);
        await tx.$executeRawUnsafe(`
          CREATE TABLE "RoleDefinition" (
            "id" TEXT PRIMARY KEY,
            "scope" TEXT NOT NULL,
            "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            "version" INTEGER NOT NULL DEFAULT 1
          )
        `);
        await tx.$executeRawUnsafe(`
          CREATE TABLE "Location" ("id" TEXT PRIMARY KEY)
        `);
        await tx.$executeRawUnsafe(`
          CREATE TABLE "User" (
            "id" TEXT PRIMARY KEY,
            "roleDefinitionId" TEXT NOT NULL,
            "locationId" TEXT NULL
          )
        `);
        await tx.$executeRawUnsafe(`
          INSERT INTO "RoleDefinition" ("id", "scope", "permissions") VALUES
            ('role-admin', 'OWNER', ARRAY['users:view']),
            ('role-accounting-staff', 'BUSINESS_WIDE', ARRAY['reports:view']),
            ('role-branch-staff', 'BRANCH', ARRAY['sales:post'])
        `);
        await tx.$executeRawUnsafe(`
          INSERT INTO "Location" ("id") VALUES ('qc'), ('lu')
        `);
        await tx.$executeRawUnsafe(`
          INSERT INTO "User" ("id", "roleDefinitionId", "locationId") VALUES
            ('owner', 'role-admin', NULL),
            ('qc-user', 'role-branch-staff', 'qc'),
            ('unassigned-user', 'role-branch-staff', NULL)
        `);

        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }

        const roles = await tx.$queryRawUnsafe<
          Array<{ id: string; isOwner: boolean; permissions: string[] }>
        >(`
          SELECT "id", "isOwner", "permissions"
          FROM "RoleDefinition"
          ORDER BY "id"
        `);
        expect(roles).toEqual([
          {
            id: "role-accounting-staff",
            isOwner: false,
            permissions: ["reports:view", "locations:all"],
          },
          {
            id: "role-admin",
            isOwner: true,
            permissions: ["users:view", "locations:all"],
          },
          {
            id: "role-branch-staff",
            isOwner: false,
            permissions: ["sales:post"],
          },
        ]);
        const assignments = await tx.$queryRawUnsafe<
          Array<{ userId: string; locationId: string }>
        >(`SELECT "userId", "locationId" FROM "UserLocation" ORDER BY "userId"`);
        expect(assignments).toEqual([{ userId: "qc-user", locationId: "qc" }]);
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "authorization_boundary"`);
          await tx.$executeRawUnsafe(`
            INSERT INTO "RoleDefinition" ("id", "scope", "isOwner")
            VALUES ('second-owner-role', 'BUSINESS_WIDE', true)
          `);
        }),
      ).rejects.toThrow(/23505|unique constraint/i);
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "authorization_boundary"`);
          await tx.$executeRawUnsafe(`
            INSERT INTO "User" ("id", "roleDefinitionId", "locationId")
            VALUES ('second-owner-user', 'role-admin', NULL)
          `);
        }),
      ).rejects.toThrow(/23505|unique constraint/i);
    });
  }, 30_000);

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

      const roles = await prisma.roleDefinition.findMany({
        where: { id: { in: ["role-admin", "role-stock-staff", "role-branch-staff"] } },
        select: { id: true, permissions: true },
      });
      const adminPermissions = roles.find((role) => role.id === "role-admin")?.permissions ?? [];
      const stockPermissions = roles.find((role) => role.id === "role-stock-staff")?.permissions ?? [];
      const branchPermissions = roles.find((role) => role.id === "role-branch-staff")?.permissions ?? [];
      expect(adminPermissions).toEqual(
        expect.arrayContaining([
          "products:create",
          "products:update",
          "products:delete",
          "users:view",
          "roles:update",
        ]),
      );
      expect(adminPermissions).not.toContain("users:manage");
      expect(stockPermissions).toEqual(
        expect.arrayContaining([
          "stock-transfers:create",
          "stock-transfers:dispatch",
          "stock-transfers:investigate",
        ]),
      );
      expect(stockPermissions).not.toContain("stock-transfers:resolve");
      expect(branchPermissions).toContain("inventory-movements:view");
      expect(branchPermissions).not.toContain("customer-orders:cancel-paid");
    });
  }, 30_000);

  it("keeps legacy columns compatible while enforcing singleton ownership and assignments", async () => {
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

      await insertUser(prisma, {
        id: "branch-without-legacy-location",
        email: "branch-null@example.test",
        role: "BRANCH_STAFF",
        locationId: null,
      });
      await prisma.userLocation.createMany({
        data: [
          { userId: "stock-staff", locationId: "stock-room" },
          { userId: "branch-staff", locationId: "qc-branch" },
          { userId: "branch-without-legacy-location", locationId: "qc-branch" },
        ],
        skipDuplicates: true,
      });
      expect(await prisma.userLocation.count()).toBe(3);

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
      expect(await prisma.roleDefinition.findUnique({ where: { id: "role-admin" }, select: { isOwner: true } })).toEqual({ isOwner: true });

      await expect(
        prisma.roleDefinition.create({
          data: {
            key: "second-owner",
            name: "Second Owner",
            description: "Must violate singleton ownership",
            scope: "BUSINESS_WIDE",
            permissions: [],
            isOwner: true,
          },
        }),
      ).rejects.toThrow(/unique constraint/i);

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
