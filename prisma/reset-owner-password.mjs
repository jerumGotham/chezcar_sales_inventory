import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

function requiredValue(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function ownerPasswordResetInput(environment) {
  if (environment.ALLOW_OWNER_PASSWORD_RESET !== "true") {
    throw new Error("ALLOW_OWNER_PASSWORD_RESET=true is required");
  }

  const databaseUrl = requiredValue(environment.DATABASE_URL, "DATABASE_URL");
  const expectedDatabase = requiredValue(
    environment.RESET_OWNER_DATABASE,
    "RESET_OWNER_DATABASE",
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
    throw new Error("DATABASE_URL does not match RESET_OWNER_DATABASE");
  }

  const email = requiredValue(environment.RESET_OWNER_EMAIL, "RESET_OWNER_EMAIL")
    .toLowerCase();
  if (!email.includes("@")) {
    throw new Error("RESET_OWNER_EMAIL must be a real account email address");
  }
  const password = requiredValue(
    environment.RESET_OWNER_PASSWORD,
    "RESET_OWNER_PASSWORD",
  );
  if (password.length < 12 || password.toLowerCase().includes("replace-with")) {
    throw new Error("RESET_OWNER_PASSWORD must contain at least 12 characters");
  }

  return { databaseUrl, expectedDatabase, email, password };
}

async function assertConnectedDatabase(tx, expectedDatabase) {
  const [identity] = await tx.$queryRaw`
    SELECT current_database() AS "databaseName"
  `;
  if (identity?.databaseName !== expectedDatabase) {
    throw new Error("Connected database does not match RESET_OWNER_DATABASE");
  }
}

export async function resetOwnerPassword(prisma, environment) {
  const input = ownerPasswordResetInput(environment);
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(
    async (tx) => {
      await assertConnectedDatabase(tx, input.expectedDatabase);

      const user = await tx.user.findUnique({
        where: { email: input.email },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          banned: true,
          accessRole: { select: { isOwner: true } },
        },
      });
      if (!user) {
        throw new Error("Refusing reset because no account uses that email address");
      }
      if (!user.accessRole?.isOwner) {
        // A non-owner password is reset by a signed-in Admin in User Management,
        // where the action is authorized and written to the audit trail.
        throw new Error("Refusing reset because that account does not hold the owner role");
      }

      // Better Auth keeps the password on the credential account, not the user.
      const updated = await tx.account.updateMany({
        where: { userId: user.id, providerId: "credential" },
        data: { password: passwordHash },
      });
      if (updated.count === 0) {
        await tx.account.create({
          data: {
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: passwordHash,
          },
        });
      }

      // A locked-out owner must be able to sign in again with the new password.
      await tx.user.update({
        where: { id: user.id },
        data: { credentialSetupRequired: false, banned: false, status: "ACTIVE" },
      });

      // Existing sessions keep working unless they are cleared, so the old
      // password cannot be used to open a new one while a stale tab stays in.
      const { count: revokedSessions } = await tx.session.deleteMany({
        where: { userId: user.id },
      });

      return {
        email: user.email,
        name: user.name,
        reactivated: user.status !== "ACTIVE" || user.banned,
        revokedSessions,
      };
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await resetOwnerPassword(prisma, process.env);
    console.log(
      `Owner password reset for ${result.email}. ` +
        `Signed-out sessions: ${result.revokedSessions}.` +
        (result.reactivated ? " The account was also reactivated." : ""),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Owner password reset failed");
    process.exit(1);
  });
}
