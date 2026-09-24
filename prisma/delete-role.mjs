import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Deletes a role by name. The application has no way to do this, and
 * User.roleDefinitionId is ON DELETE RESTRICT, so a role that still has people
 * on it cannot be removed at all: the database refuses and the transaction
 * fails. This reports who is on the role rather than letting that surface as a
 * constraint error.
 *
 * Reports only unless --apply is given, so the first run always shows what
 * would happen.
 *
 *   export DATABASE_URL='postgresql://<user>:<password>@<host>:<port>/<database>'
 *   node prisma/delete-role.mjs --name="Admin01"
 *   node prisma/delete-role.mjs --name="Admin01" --apply
 */

export async function deleteRoleByName(prisma, name, { apply = false } = {}) {
  const role = await prisma.roleDefinition.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, isOwner: true, isSystem: true, permissions: true },
  });

  if (!role) {
    const available = await prisma.roleDefinition.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    return { found: false, requested: name, existingRoles: available.map((entry) => entry.name) };
  }

  const users = await prisma.user.findMany({
    where: { roleDefinitionId: role.id },
    select: { email: true, status: true },
    orderBy: { email: "asc" },
  });

  const result = {
    found: true,
    role: { id: role.id, name: role.name, isOwner: role.isOwner, isSystem: role.isSystem, permissions: role.permissions.length },
    assignedUsers: users,
    deleted: false,
    applied: apply,
  };

  // The owner role is the one account that can reach everything; removing it
  // locks the business out of its own system with no way back in.
  if (role.isOwner) {
    result.refused = "This is the owner role. Deleting it would leave no account able to administer the system.";
    return result;
  }

  if (users.length > 0) {
    result.refused =
      `${users.length} user(s) are still on this role. Move them to another role first, ` +
      "then run this again.";
    return result;
  }

  if (!apply) {
    result.wouldDelete = true;
    return result;
  }

  await prisma.roleDefinition.delete({ where: { id: role.id } });
  result.deleted = true;
  return result;
}

async function main() {
  const nameArgument = process.argv.slice(2).find((argument) => argument.startsWith("--name="));
  if (!nameArgument) throw new Error('Pass --name="<role name>"');
  const name = nameArgument.slice("--name=".length).trim();
  if (!name) throw new Error("The role name cannot be empty");

  const prisma = new PrismaClient();
  try {
    const result = await deleteRoleByName(prisma, name, { apply: process.argv.includes("--apply") });
    console.log(JSON.stringify(result, null, 2));
    if (result.refused) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Role delete failed");
    process.exit(1);
  });
}
