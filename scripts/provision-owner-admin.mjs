import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const OWNER_ROLE_ID = "role-admin";

function requiredValue(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function ownerProvisioningInput(environment) {
  if (environment.NODE_ENV !== "production") {
    throw new Error("Owner provisioning requires NODE_ENV=production");
  }
  if (environment.ALLOW_OWNER_PROVISIONING !== "true") {
    throw new Error("ALLOW_OWNER_PROVISIONING=true is required");
  }

  const databaseUrl = requiredValue(environment.DATABASE_URL, "DATABASE_URL");
  const expectedDatabase = requiredValue(
    environment.PROVISION_OWNER_DATABASE,
    "PROVISION_OWNER_DATABASE",
  );
  let databaseName;
  try {
    const parsedDatabaseUrl = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
      throw new Error();
    }
    databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (databaseName !== expectedDatabase) {
    throw new Error("DATABASE_URL does not match PROVISION_OWNER_DATABASE");
  }

  const email = requiredValue(environment.PROVISION_OWNER_EMAIL, "PROVISION_OWNER_EMAIL")
    .toLowerCase();
  if (!email.includes("@") || email.endsWith(".invalid")) {
    throw new Error("PROVISION_OWNER_EMAIL must be a real internal email address");
  }
  const password = requiredValue(
    environment.PROVISION_OWNER_PASSWORD,
    "PROVISION_OWNER_PASSWORD",
  );
  if (password.length < 12 || password.toLowerCase().includes("replace-with")) {
    throw new Error("PROVISION_OWNER_PASSWORD must contain at least 12 characters");
  }

  return {
    databaseUrl,
    expectedDatabase,
    email,
    password,
    name: requiredValue(environment.PROVISION_OWNER_NAME, "PROVISION_OWNER_NAME"),
  };
}

async function assertConnectedDatabase(tx, expectedDatabase) {
  const [identity] = await tx.$queryRaw`
    SELECT current_database() AS "databaseName"
  `;
  if (identity?.databaseName !== expectedDatabase) {
    throw new Error("Connected database does not match PROVISION_OWNER_DATABASE");
  }
}

export async function provisionOwnerAdmin(prisma, environment) {
  const input = ownerProvisioningInput(environment);
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(
    async (tx) => {
      await assertConnectedDatabase(tx, input.expectedDatabase);
      const ownerRole = await tx.roleDefinition.findUnique({
        where: { id: OWNER_ROLE_ID },
        select: { id: true, isOwner: true },
      });
      if (!ownerRole?.isOwner) {
        throw new Error(
          "Owner role is not ready; apply all production migrations before provisioning",
        );
      }

      const existingOwner = await tx.user.findFirst({
        where: {
          OR: [{ role: "ADMIN" }, { accessRole: { isOwner: true } }],
        },
        select: { email: true },
      });
      if (existingOwner) {
        throw new Error("Refusing provisioning because an owner Admin already exists");
      }
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
        throw new Error("Refusing provisioning because the email is already in use");
      }

      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          emailVerified: true,
          role: "ADMIN",
          roleDefinitionId: ownerRole.id,
          status: "ACTIVE",
          credentialSetupRequired: true,
          banned: false,
          locationId: null,
        },
        select: { id: true, email: true, name: true },
      });
      await tx.account.create({
        data: {
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: passwordHash,
        },
      });
      return user;
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await provisionOwnerAdmin(prisma, process.env);
    console.log(`Owner Admin created for ${user.email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Owner provisioning failed");
    process.exit(1);
  });
}
