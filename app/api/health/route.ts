import { readdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

type Migrations =
  | { checked: true; shipped: number; pending: number }
  /** The migration folder could not be read, so nothing can be claimed. */
  | { checked: false; shipped: null; pending: null };

function response(
  status: "ok" | "schema-behind" | "unavailable",
  httpStatus: number,
  migrations?: Migrations,
) {
  return Response.json(
    migrations ? { status, migrations } : { status },
    {
      status: httpStatus,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/*
 * What this build carries against what the database has actually run.
 *
 * Migrations are applied by Coolify's pre-deployment command, which can fail to
 * run while the deployment still reports success -- that happened on
 * 2026-10-03 and left a released build querying a column the database did not
 * have. A health check that only proves the database answers cannot see this,
 * so it compares the two lists and says how many migrations are outstanding.
 *
 * Only counts are returned. The names would tell an unauthenticated caller what
 * the schema is being changed into.
 */
async function migrationState(): Promise<Migrations> {
  let shipped: string[];
  try {
    const directory = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "prisma", "migrations");
    const entries = await readdir(/*turbopackIgnore: true*/ directory, { withFileTypes: true });
    shipped = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return { checked: false, shipped: null, pending: null };
  }

  const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
  `;
  const appliedNames = new Set(applied.map((row) => row.migration_name));
  return {
    checked: true,
    shipped: shipped.length,
    pending: shipped.filter((name) => !appliedNames.has(name)).length,
  };
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const migrations = await migrationState();
    // A build whose migrations have not run is not healthy: it will answer some
    // routes and throw on whatever the missing columns feed.
    if (migrations.checked && migrations.pending > 0) {
      return response("schema-behind", 503, migrations);
    }
    return response("ok", 200, migrations);
  } catch {
    return response("unavailable", 503);
  }
}
