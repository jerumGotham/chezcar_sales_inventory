import "server-only";

import { DEVELOPER_EMAILS } from "@/lib/server/developer-accounts";
import { prisma } from "@/lib/server/prisma";

/**
 * Developer accounts kept out of the audit trail entirely: no sign-in, failed
 * sign-in, sign-out, or workflow entry is written for them, and the derived
 * events /api/audit merges in from business tables are hidden from it too.
 * The business rows themselves (sales, movements, payments) are untouched.
 */
export const AUDIT_EXEMPT_EMAILS: ReadonlySet<string> = DEVELOPER_EMAILS;

export type AuditExemptUsers = { ids: Set<string>; labels: Set<string> };

let cached: AuditExemptUsers | null = null;

/**
 * The exempt accounts' ids, plus every label an entry may carry for them
 * (email for a failed sign-in, display name for everything else), lowercased.
 * Cached only once an account is found, so one created later is still picked up.
 */
export async function auditExemptUsers(): Promise<AuditExemptUsers> {
  if (cached) return cached;
  const users = await prisma.user.findMany({
    where: { email: { in: [...AUDIT_EXEMPT_EMAILS], mode: "insensitive" } },
    select: { id: true, name: true, email: true },
  });
  const resolved: AuditExemptUsers = {
    ids: new Set(users.map((user) => user.id)),
    labels: new Set([
      ...AUDIT_EXEMPT_EMAILS,
      ...users.flatMap((user) => [user.email.toLowerCase(), user.name.trim().toLowerCase()].filter(Boolean)),
    ]),
  };
  if (users.length > 0) cached = resolved;
  return resolved;
}

export function isAuditExemptLabel(exempt: AuditExemptUsers, label: string | null | undefined) {
  return Boolean(label) && exempt.labels.has(label!.trim().toLowerCase());
}
