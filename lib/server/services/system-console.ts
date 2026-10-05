import "server-only";

import { statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assertCapability, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

/**
 * What the server looks like right now, for the health check that used to mean
 * opening a terminal: how big the database has grown, how much room is left on
 * the volume the uploads land in, and what the host is carrying.
 */
export type SystemHealth = {
  readAt: string;
  database: {
    name: string;
    bytes: number;
    /** Biggest tables first, so growth has somewhere obvious to be chased. */
    tables: Array<{ name: string; bytes: number; rows: number }>;
  };
  storage: {
    /** The directory receipts and product images are written to. */
    path: string;
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usedPercent: number;
  } | null;
  memory: {
    /*
     * totalBytes is the host's, which is what a container sees; processBytes is
     * what this application is actually holding. Both are worth knowing: the
     * first says whether the machine is full, the second whether this app is
     * the reason.
     */
    totalBytes: number;
    freeBytes: number;
    usedPercent: number;
    processBytes: number;
  };
  cpu: {
    cores: number;
    /** One, five and fifteen minute load. Zero on platforms that do not report it. */
    loadAverage: [number, number, number];
    /** Load over cores: above 1 means work is queueing. */
    loadPerCore: number;
    processUptimeSeconds: number;
  };
};

function storageRoot() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.RECEIPT_STORAGE_PATH ?? path.join(process.cwd(), "data", "receipt-photos"),
  );
}

async function storageUsage(): Promise<SystemHealth["storage"]> {
  const directory = storageRoot();
  try {
    const stats = await statfs(/*turbopackIgnore: true*/ directory);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = totalBytes - freeBytes;
    return {
      path: directory,
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0,
    };
  } catch {
    // A platform or a path that cannot be measured says so rather than
    // reporting a zero that would read as a full disk.
    return null;
  }
}

export async function getSystemHealth(actor: AuthContext): Promise<SystemHealth> {
  assertCapability(actor, "system:monitor");

  const [size] = await prisma.$queryRaw<Array<{ name: string; bytes: bigint }>>`
    SELECT current_database() AS "name", pg_database_size(current_database()) AS "bytes"
  `;
  /*
   * pg_total_relation_size covers the table, its indexes and its TOAST, which
   * is what actually fills a disk. reltuples is the planner's estimate rather
   * than a count, which is the point: counting every row of every table to
   * draw a health screen would be its own problem.
   */
  const tables = await prisma.$queryRaw<Array<{ name: string; bytes: bigint; rows: number }>>`
    SELECT c.relname AS "name",
           pg_total_relation_size(c.oid) AS "bytes",
           GREATEST(c.reltuples, 0)::int AS "rows"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 15
  `;

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const cores = os.cpus().length || 1;
  const loadAverage = os.loadavg() as [number, number, number];

  return {
    readAt: new Date().toISOString(),
    database: {
      name: size?.name ?? "-",
      bytes: Number(size?.bytes ?? 0),
      tables: tables.map((table) => ({ name: table.name, bytes: Number(table.bytes), rows: table.rows })),
    },
    storage: await storageUsage(),
    memory: {
      totalBytes: totalMemory,
      freeBytes: freeMemory,
      usedPercent: totalMemory > 0 ? Math.round(((totalMemory - freeMemory) / totalMemory) * 1000) / 10 : 0,
      processBytes: process.memoryUsage().rss,
    },
    cpu: {
      cores,
      loadAverage,
      loadPerCore: Math.round((loadAverage[0] / cores) * 100) / 100,
      processUptimeSeconds: Math.round(process.uptime()),
    },
  };
}
