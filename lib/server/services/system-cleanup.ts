import "server-only";

import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { assertCapability, type AuthContext } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { recordAuditLog } from "@/lib/server/services/audit-log";

/**
 * What the application can safely clear from inside its own container: files
 * and rows it wrote itself and nothing points at any more. It cannot reach the
 * host -- Docker images, other containers, the operating system's memory -- so
 * those are left to the server, and the console says so instead of offering a
 * button that would do nothing.
 */
export const CLEANUP_TASKS = ["orphan-receipt-photos", "orphan-product-images", "old-backups", "old-system-logs", "expired-sessions"] as const;
export type CleanupTask = (typeof CLEANUP_TASKS)[number];

export type CleanupItem = {
  task: CleanupTask;
  label: string;
  description: string;
  count: number;
  /** Bytes on disk freed by clearing it; null for database rows. */
  bytes: number | null;
};

const UPLOAD_KEY = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
/*
 * An upload is written to disk a moment before its row points at it. A file
 * younger than this may be one whose save is still in flight, so it is never
 * counted as an orphan.
 */
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const BACKUPS_KEPT = 2;
const SYSTEM_LOG_DAYS = 30;

function root(variable: string, fallback: string) {
  return path.resolve(/*turbopackIgnore: true*/ process.env[variable] ?? path.join(process.cwd(), "data", fallback));
}

const RECEIPT_ROOT = () => root("RECEIPT_STORAGE_PATH", "receipt-photos");
const PRODUCT_IMAGE_ROOT = () => root("PRODUCT_IMAGE_STORAGE_PATH", "product-images");
const BACKUP_ROOT = () => root("BACKUP_STORAGE_PATH", "backups");

async function filesIn(directory: string, accept: (name: string) => boolean) {
  try {
    const names = (await readdir(/*turbopackIgnore: true*/ directory)).filter(accept);
    return Promise.all(names.map(async (name) => {
      const info = await stat(path.join(/*turbopackIgnore: true*/ directory, name));
      return { name, bytes: info.size, modifiedMs: info.mtimeMs };
    }));
  } catch {
    // No directory yet means nothing has been written there.
    return [];
  }
}

async function orphanReceiptPhotos() {
  const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
  const candidates = (await filesIn(RECEIPT_ROOT(), (name) => UPLOAD_KEY.test(name))).filter((file) => file.modifiedMs < cutoff);
  if (candidates.length === 0) return [];
  const keys = candidates.map((file) => file.name);
  // Both places a receipt photo can be held: a sale's review and a payment.
  const [reviews, payments] = await Promise.all([
    prisma.saleAccountingReview.findMany({ where: { receiptPhotoKey: { in: keys } }, select: { receiptPhotoKey: true } }),
    prisma.payment.findMany({ where: { receiptPhotoKey: { in: keys } }, select: { receiptPhotoKey: true } }),
  ]);
  const used = new Set([...reviews, ...payments].map((row) => row.receiptPhotoKey));
  return candidates.filter((file) => !used.has(file.name));
}

async function orphanProductImages() {
  const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
  const candidates = (await filesIn(PRODUCT_IMAGE_ROOT(), (name) => UPLOAD_KEY.test(name))).filter((file) => file.modifiedMs < cutoff);
  if (candidates.length === 0) return [];
  const products = await prisma.product.findMany({ where: { imageKey: { in: candidates.map((file) => file.name) } }, select: { imageKey: true } });
  const used = new Set(products.map((row) => row.imageKey));
  return candidates.filter((file) => !used.has(file.name));
}

async function oldBackups() {
  const backups = (await filesIn(BACKUP_ROOT(), (name) => name.endsWith(".dump"))).sort((a, b) => b.modifiedMs - a.modifiedMs);
  return backups.slice(BACKUPS_KEPT);
}

function systemLogCutoff() {
  return new Date(Date.now() - SYSTEM_LOG_DAYS * 24 * 60 * 60 * 1000);
}

function sum(files: Array<{ bytes: number }>) {
  return files.reduce((total, file) => total + file.bytes, 0);
}

export async function scanCleanup(actor: AuthContext): Promise<CleanupItem[]> {
  assertCapability(actor, "system:monitor");
  const now = new Date();
  const [receipts, images, backups, logs, sessions, verifications] = await Promise.all([
    orphanReceiptPhotos(),
    orphanProductImages(),
    oldBackups(),
    prisma.systemLog.count({ where: { occurredAt: { lt: systemLogCutoff() } } }),
    prisma.session.count({ where: { expiresAt: { lt: now } } }),
    prisma.verification.count({ where: { expiresAt: { lt: now } } }),
  ]);
  return [
    { task: "orphan-receipt-photos", label: "Unused receipt photos", description: "Photos that were replaced or deleted and no sale or payment uses any more.", count: receipts.length, bytes: sum(receipts) },
    { task: "orphan-product-images", label: "Unused product images", description: "Images replaced on a product and no longer shown anywhere.", count: images.length, bytes: sum(images) },
    { task: "old-backups", label: "Old database backups", description: `Every backup except the newest ${BACKUPS_KEPT}. Download any you want to keep first.`, count: backups.length, bytes: sum(backups) },
    { task: "old-system-logs", label: "Old error log entries", description: `Error log entries older than ${SYSTEM_LOG_DAYS} days.`, count: logs, bytes: null },
    { task: "expired-sessions", label: "Expired sign-ins", description: "Sign-in sessions and links that have already expired. Nobody is signed out.", count: sessions + verifications, bytes: null },
  ];
}

async function removeFiles(directory: string, files: Array<{ name: string; bytes: number }>) {
  let count = 0;
  let bytes = 0;
  for (const file of files) {
    try {
      await unlink(path.join(/*turbopackIgnore: true*/ directory, file.name));
      count += 1;
      bytes += file.bytes;
    } catch {
      // Already gone, or held open: skipped rather than failing the rest.
    }
  }
  return { count, bytes };
}

export async function runCleanup(actor: AuthContext, tasks: readonly CleanupTask[]) {
  assertCapability(actor, "system:cleanup");
  const results: Array<{ task: CleanupTask; count: number; bytes: number | null }> = [];
  const now = new Date();

  for (const task of new Set(tasks)) {
    // Each task re-reads what it clears at the moment it runs, never a list
    // the browser sent, so nothing can be named for deletion from outside.
    if (task === "orphan-receipt-photos") {
      results.push({ task, ...(await removeFiles(RECEIPT_ROOT(), await orphanReceiptPhotos())) });
    } else if (task === "orphan-product-images") {
      results.push({ task, ...(await removeFiles(PRODUCT_IMAGE_ROOT(), await orphanProductImages())) });
    } else if (task === "old-backups") {
      results.push({ task, ...(await removeFiles(BACKUP_ROOT(), await oldBackups())) });
    } else if (task === "old-system-logs") {
      const deleted = await prisma.systemLog.deleteMany({ where: { occurredAt: { lt: systemLogCutoff() } } });
      results.push({ task, count: deleted.count, bytes: null });
    } else if (task === "expired-sessions") {
      const [sessions, verifications] = await Promise.all([
        prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
        prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
      ]);
      results.push({ task, count: sessions.count + verifications.count, bytes: null });
    }
  }

  const freedBytes = results.reduce((total, result) => total + (result.bytes ?? 0), 0);
  await recordAuditLog({
    category: "Access",
    action: "System Cleanup",
    actorId: actor.userId,
    details: results.map((result) => `${result.task}: ${result.count}`).join(", ") || "Nothing selected",
    facts: [{ label: "Disk freed (bytes)", value: String(freedBytes) }],
  });
  return { results, freedBytes };
}
