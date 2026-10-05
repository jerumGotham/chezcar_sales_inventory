import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

/**
 * Creates a read-only support account and the role it uses.
 *
 * It exists so a problem a branch reports can be looked at directly -- the same
 * screens they see, the system console, the logs and a database backup --
 * without being able to change anything. Every capability it holds is a view,
 * a report, or a backup, so no business record can move through it. Viewing
 * writes no audit entry, so its work does not fill the audit trail; signing in
 * and out is still recorded, as it is for everyone.
 *
 * Nothing is hardcoded. The credential comes from the environment, so it never
 * reaches the repository:
 *
 *   export DATABASE_URL='postgresql://...'
 *   export ALLOW_SUPPORT_PROVISIONING=true
 *   export SUPPORT_DATABASE=chezcardb
 *   export SUPPORT_EMAIL=jerum@predatoroffroad.ph
 *   export SUPPORT_NAME='Jerum (support)'
 *   export SUPPORT_PASSWORD='...'
 *   node scripts/provision-support-account.mjs
 *
 * Re-running it updates the password and the capability set rather than
 * creating a second account.
 */

const ROLE_ID = "role-support-readonly";
const ROLE_KEY = "support-readonly";

/**
 * Views, reports and the system console. `locations:all` is here because a
 * support account that could only see one branch could not answer a question
 * about another. `system:backup` writes a file and reads the database; it
 * changes no business record, and taking a copy to debug against is the point
 * of the account.
 */
const READ_ONLY_CAPABILITIES = [
  "locations:all",
  "dashboard:view",
  "notifications:view",
  "customers:view",
  "customer-orders:view",
  "sales:view",
  "sales:verify:view",
  "sales:evidence:view",
  "products:view",
  "inventory:view",
  "inventory-availability:view",
  "inventory-movements:view",
  "stock-receipts:view",
  "stock-transfers:view",
  "stock-transfers:audit:view",
  "reports:sales",
  "reports:salesperson-sales",
  "reports:inventory-summary",
  "reports:stock-movement",
  "reports:returns-warranty",
  "offline-sales:snapshot",
  "audit:view",
  "system:monitor",
  "system:backup",
  "users:view",
  "branches:view",
  "suppliers:view",
  "personnel:view",
  "backjobs:view",
  "customer-warranties:view",
  "supplier-claims:view",
  "roles:view",
];

function required(value, name) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function supportProvisioningInput(environment) {
  if (environment.ALLOW_SUPPORT_PROVISIONING !== "true") {
    throw new Error("ALLOW_SUPPORT_PROVISIONING=true is required");
  }
  const databaseUrl = required(environment.DATABASE_URL, "DATABASE_URL");
  const expectedDatabase = required(environment.SUPPORT_DATABASE, "SUPPORT_DATABASE");
  let databaseName;
  try {
    const parsed = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error();
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  // The database is typed out and has to match, so the wrong target is refused
  // rather than quietly provisioned.
  if (databaseName !== expectedDatabase) {
    throw new Error(`Refusing: DATABASE_URL points at ${databaseName}, not the ${expectedDatabase} given`);
  }

  const email = required(environment.SUPPORT_EMAIL, "SUPPORT_EMAIL").toLowerCase();
  if (!email.includes("@")) throw new Error("SUPPORT_EMAIL must be an email address");
  const password = required(environment.SUPPORT_PASSWORD, "SUPPORT_PASSWORD");
  if (password.length < 12) {
    throw new Error("SUPPORT_PASSWORD must be at least 12 characters: this account can read every branch's records");
  }

  return {
    expectedDatabase,
    email,
    password,
    name: environment.SUPPORT_NAME?.trim() || "Support",
  };
}

export async function provisionSupportAccount(prisma, environment) {
  const input = supportProvisioningInput(environment);
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(
    async (tx) => {
      const [identity] = await tx.$queryRaw`SELECT current_database() AS "databaseName"`;
      if (identity?.databaseName !== input.expectedDatabase) {
        throw new Error("Connected database does not match SUPPORT_DATABASE");
      }

      const role = await tx.roleDefinition.upsert({
        where: { id: ROLE_ID },
        create: {
          id: ROLE_ID,
          key: ROLE_KEY,
          name: "Support (read only)",
          description: "Sees every screen, report, log and backup. Changes nothing.",
          // Not OWNER: the schema allows exactly one owner role and Admin
          // holds it. This account sees every branch through locations:all,
          // which is a grant, not ownership.
          scope: "BUSINESS_WIDE",
          permissions: READ_ONLY_CAPABILITIES,
          isOwner: false,
          isSystem: true,
        },
        // Re-running brings the capability set up to date with this file.
        update: { permissions: READ_ONLY_CAPABILITIES },
      });

      const existing = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (existing) {
        await tx.user.update({
          where: { id: existing.id },
          data: { name: input.name, roleDefinitionId: role.id, status: "ACTIVE", banned: false, locationId: null },
        });
        await tx.account.updateMany({
          where: { userId: existing.id, providerId: "credential" },
          data: { password: passwordHash },
        });
        return { email: input.email, created: false, capabilities: READ_ONLY_CAPABILITIES.length };
      }

      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          emailVerified: true,
          role: "ACCOUNTING_STAFF",
          roleDefinitionId: role.id,
          status: "ACTIVE",
          banned: false,
          locationId: null,
        },
        select: { id: true },
      });
      await tx.account.create({
        data: { accountId: user.id, providerId: "credential", userId: user.id, password: passwordHash },
      });
      return { email: input.email, created: true, capabilities: READ_ONLY_CAPABILITIES.length };
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await provisionSupportAccount(prisma, process.env);
    console.log(
      `${result.created ? "Created" : "Updated"} the read-only support account ${result.email} ` +
        `with ${result.capabilities} view capabilities.`,
    );
    console.log("It can change nothing: no posting, releasing, verifying, editing or deleting.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nFailed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
