import "server-only";

import { z } from "zod";

import { assertCapability, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

export const SYSTEM_LOG_LEVELS = ["ERROR", "WARN", "INFO"] as const;
export type SystemLogLevel = (typeof SYSTEM_LOG_LEVELS)[number];

export type SystemLogEntry = {
  id: string;
  occurredAt: string;
  level: SystemLogLevel;
  source: string;
  message: string;
  detail: string | null;
  actor: string;
};

/**
 * What the application recorded going wrong, kept because the container's own
 * output goes to Docker and the application cannot read it back. A reported
 * "internal server error" is answerable from here: which route, what the
 * database or the code actually said, and who was signed in at the time.
 *
 * Writing must never break the request it describes, so a failure here is
 * reported to the container log and swallowed.
 */
export async function recordSystemLog(input: {
  level: SystemLogLevel;
  source: string;
  message: string;
  detail?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        level: input.level,
        source: input.source.slice(0, 200),
        message: input.message.slice(0, 2_000),
        // A stack is worth keeping but not worth unbounded storage.
        detail: input.detail ? input.detail.slice(0, 8_000) : null,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel?.trim() || "-",
      },
    });
  } catch (error) {
    console.error("[system-log] failed to record entry", input.source, error);
  }
}

/** Turns a thrown value into the two fields the log stores. */
export function describeError(error: unknown): { message: string; detail: string | null } {
  if (error instanceof Error) {
    return {
      message: `${error.name}: ${error.message}`,
      detail: error.stack ?? null,
    };
  }
  return { message: String(error), detail: null };
}

export const systemLogQuerySchema = z.object({
  level: z.preprocess((value) => value === "" ? undefined : value, z.enum(["all", ...SYSTEM_LOG_LEVELS]).default("all")),
  search: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().max(200).optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listSystemLogs(actor: AuthContext, rawQuery: unknown) {
  assertCapability(actor, "system:monitor");
  const query = systemLogQuerySchema.parse(rawQuery);

  const where = {
    ...(query.level === "all" ? {} : { level: query.level }),
    ...(query.search
      ? {
          OR: [
            { message: { contains: query.search, mode: "insensitive" as const } },
            { source: { contains: query.search, mode: "insensitive" as const } },
            { detail: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, totalItems, counts] = await Promise.all([
    prisma.systemLog.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.systemLog.count({ where }),
    // The tallies are of everything, not of the filtered page, so the counts
    // on the level buttons do not change as the filter is used.
    prisma.systemLog.groupBy({ by: ["level"], _count: { _all: true } }),
  ]);

  const byLevel = Object.fromEntries(counts.map((row) => [row.level, row._count._all])) as Partial<Record<SystemLogLevel, number>>;

  return {
    data: rows.map((row): SystemLogEntry => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      level: row.level,
      source: row.source,
      message: row.message,
      detail: row.detail,
      actor: row.actorLabel,
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / query.pageSize), 1),
      errors: byLevel.ERROR ?? 0,
      warnings: byLevel.WARN ?? 0,
      info: byLevel.INFO ?? 0,
    },
  };
}
