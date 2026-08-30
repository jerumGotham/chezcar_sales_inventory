import { verifyPassword } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

import { provisionOwnerAdmin } from "../../scripts/provision-owner-admin.mjs";
import { withDisposableDatabase } from "../helpers/database";

describe("production owner provisioning", () => {
  it("creates one credential owner and refuses target mismatch or replacement", async () => {
    await withDisposableDatabase(async ({ databaseUrl, prisma }) => {
      const databaseName = new URL(databaseUrl).pathname.slice(1);
      const environment = {
        NODE_ENV: "production",
        ALLOW_OWNER_PROVISIONING: "true",
        DATABASE_URL: databaseUrl,
        PROVISION_OWNER_DATABASE: databaseName,
        PROVISION_OWNER_EMAIL: "owner.provisioning@example.test",
        PROVISION_OWNER_PASSWORD: "temporary-owner-password-123",
        PROVISION_OWNER_NAME: "Provisioned Owner",
      };

      await expect(provisionOwnerAdmin(prisma, environment)).resolves.toMatchObject({
        email: "owner.provisioning@example.test",
        name: "Provisioned Owner",
      });

      const owner = await prisma.user.findUniqueOrThrow({
        where: { email: environment.PROVISION_OWNER_EMAIL },
        include: { accessRole: true, accounts: true, locationAssignments: true },
      });
      expect(owner).toMatchObject({
        role: "ADMIN",
        status: "ACTIVE",
        emailVerified: true,
        credentialSetupRequired: true,
        locationId: null,
        accessRole: { id: "role-admin", isOwner: true },
        locationAssignments: [],
      });
      expect(owner.accounts).toHaveLength(1);
      expect(owner.accounts[0]).toMatchObject({
        providerId: "credential",
        accountId: owner.id,
      });
      await expect(
        verifyPassword({
          hash: owner.accounts[0].password!,
          password: environment.PROVISION_OWNER_PASSWORD,
        }),
      ).resolves.toBe(true);

      await expect(provisionOwnerAdmin(prisma, environment)).rejects.toThrow(
        "owner Admin already exists",
      );
      await expect(prisma.user.count()).resolves.toBe(1);

      await expect(
        provisionOwnerAdmin(prisma, {
          ...environment,
          DATABASE_URL:
            "postgresql://postgres:postgres@localhost:55435/not_the_connected_database?schema=public",
          PROVISION_OWNER_DATABASE: "not_the_connected_database",
          PROVISION_OWNER_EMAIL: "other.owner@example.test",
        }),
      ).rejects.toThrow("Connected database does not match");
      await expect(prisma.user.count()).resolves.toBe(1);
    });
  }, 60_000);
});
