import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { BackupError, createBackup, listBackups, resolveBackupFile } from "@/lib/server/services/database-backup";
import { describeError, recordSystemLog } from "@/lib/server/services/system-log";

export const dynamic = "force-dynamic";

function failed(error: unknown) {
  if (error instanceof BackupError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return null;
}

/** Lists what has been kept, or streams one file back when `file` is given. */
export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "system:backup");
    const name = new URL(request.url).searchParams.get("file");
    if (!name) return Response.json({ data: await listBackups(actor) }, { headers: { "Cache-Control": "no-store" } });

    const target = await resolveBackupFile(actor, name);
    // Streamed rather than read into memory: a dump outgrows the container.
    const body = Readable.toWeb(createReadStream(target)) as ReadableStream;
    return new Response(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const known = failed(error) ?? authorizationErrorResponse(error);
    if (known) return known;
    const { message, detail } = describeError(error);
    await recordSystemLog({ level: "ERROR", source: "GET /api/system/backup", message, detail });
    return Response.json({ error: { code: "SERVER_ERROR", message: "Unable to read the backups" } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "system:backup");
    return Response.json({ data: await createBackup(actor) });
  } catch (error) {
    const known = failed(error) ?? authorizationErrorResponse(error);
    if (known) return known;
    const { message, detail } = describeError(error);
    await recordSystemLog({ level: "ERROR", source: "POST /api/system/backup", message, detail });
    return Response.json({ error: { code: "SERVER_ERROR", message: "Unable to take the backup" } }, { status: 500 });
  }
}
