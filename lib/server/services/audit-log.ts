import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AuditCategory } from "@/lib/contracts/audit";
import { prisma } from "@/lib/server/prisma";

export type AuditLogInput = {
  category: AuditCategory;
  action: string;
  actorId?: string | null;
  actorLabel?: string;
  reference?: string;
  locationLabel?: string;
  details: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Writes one audit row. Auditing must never break the action it records, so a
 * failure here is logged and swallowed rather than rolled back into the caller.
 * Pass the transaction client when the record must live or die with its change.
 */
export async function recordAuditLog(input: AuditLogInput, db: Db = prisma): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        category: input.category,
        action: input.action,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? "",
        reference: input.reference?.trim() || "-",
        locationLabel: input.locationLabel?.trim() || "-",
        details: input.details,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record entry", input.category, input.action, error);
  }
}
