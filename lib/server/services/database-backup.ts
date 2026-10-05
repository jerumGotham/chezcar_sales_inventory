import "server-only";

import { spawn } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { assertCapability, type AuthContext } from "@/lib/server/authorization";
import { recordSystemLog } from "./system-log";

/**
 * A backup the owner can take without a terminal: pg_dump writes a custom-format
 * archive into the persistent volume, where Coolify keeps it, and the browser
 * downloads a copy. Restoring is deliberately not offered here -- it replaces
 * every row in the live database, and that belongs in a terminal with the
 * runbook open, not behind a button on a page someone is already signed in to.
 *
 * The archive restores with pg_restore on any machine:
 *   pg_restore --clean --if-exists --no-owner --dbname "<url>" <file>
 */

const MAX_KEPT = 5;

function backupRoot() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.BACKUP_STORAGE_PATH ?? path.join(process.cwd(), "data", "backups"),
  );
}

export type BackupFile = { name: string; bytes: number; createdAt: string };

export async function listBackups(actor: AuthContext): Promise<BackupFile[]> {
  assertCapability(actor, "system:backup");
  const directory = backupRoot();
  try {
    const entries = await readdir(/*turbopackIgnore: true*/ directory);
    const files = await Promise.all(
      entries
        .filter((name) => name.endsWith(".dump"))
        .map(async (name) => {
          const info = await stat(path.join(/*turbopackIgnore: true*/ directory, name));
          return { name, bytes: info.size, createdAt: info.mtime.toISOString() };
        }),
    );
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    // No directory yet simply means no backup has been taken.
    return [];
  }
}

/** Keeps the volume from filling with every backup ever taken. */
async function pruneOldBackups(directory: string) {
  const entries = (await readdir(/*turbopackIgnore: true*/ directory)).filter((name) => name.endsWith(".dump"));
  if (entries.length <= MAX_KEPT) return;
  const withTimes = await Promise.all(
    entries.map(async (name) => ({ name, at: (await stat(path.join(/*turbopackIgnore: true*/ directory, name))).mtimeMs })),
  );
  withTimes.sort((a, b) => b.at - a.at);
  for (const stale of withTimes.slice(MAX_KEPT)) {
    await unlink(path.join(/*turbopackIgnore: true*/ directory, stale.name)).catch(() => {});
  }
}

export class BackupError extends Error {
  constructor(readonly code: string, message: string, readonly status = 500) {
    super(message);
    this.name = "BackupError";
  }
}

export async function createBackup(actor: AuthContext): Promise<{ file: string; path: string; bytes: number }> {
  assertCapability(actor, "system:backup");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new BackupError("NO_DATABASE_URL", "DATABASE_URL is not set", 500);

  const directory = backupRoot();
  await mkdir(/*turbopackIgnore: true*/ directory, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `chezcar-${stamp}.dump`;
  const target = path.join(/*turbopackIgnore: true*/ directory, file);

  /*
   * The URL goes in the environment, never the argument list: arguments are
   * readable from the process table by anything else on the host, and it
   * carries the database password.
   */
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl", "--file", target, databaseUrl],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      reject(
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? new BackupError("PG_DUMP_MISSING", "pg_dump is not installed in this image", 500)
          : error,
      );
    });
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new BackupError("PG_DUMP_FAILED", stderr.trim().slice(0, 500) || `pg_dump exited with ${code}`, 500));
    });
  });

  const info = await stat(/*turbopackIgnore: true*/ target);
  await pruneOldBackups(directory).catch(() => {});
  await recordSystemLog({
    level: "INFO",
    source: "database backup",
    message: `Backup written: ${file} (${info.size} bytes)`,
    actorId: actor.userId,
  });
  return { file, path: target, bytes: info.size };
}

/** Resolves a requested file inside the backup directory, refusing anything else. */
export async function resolveBackupFile(actor: AuthContext, name: string): Promise<string> {
  assertCapability(actor, "system:backup");
  // A name is a name, never a path: "../../.env" is not a backup.
  if (!/^chezcar-[\w.-]+\.dump$/.test(name) || name.includes("..")) {
    throw new BackupError("INVALID_FILE", "That is not a backup file name", 400);
  }
  const target = path.join(/*turbopackIgnore: true*/ backupRoot(), name);
  try {
    await stat(/*turbopackIgnore: true*/ target);
  } catch {
    throw new BackupError("NOT_FOUND", "That backup no longer exists", 404);
  }
  return target;
}
