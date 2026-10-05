-- The system console: what the application itself recorded going wrong, and a
-- support account whose work stays out of the business audit trail.

-- Errors, warnings and notices the application raised, kept so a failure can be
-- read back long after the container that logged it to stdout is gone. Docker
-- holds those, and the application cannot reach its own container logs, so
-- anything worth reading later has to be written here when it happens.
CREATE TYPE "SystemLogLevel" AS ENUM ('ERROR', 'WARN', 'INFO');

CREATE TABLE "SystemLog" (
  "id"         TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "level"      "SystemLogLevel" NOT NULL,
  -- Where it came from: the route, job or script, so a report of "internal
  -- server error" can be traced without guessing.
  "source"     TEXT NOT NULL,
  "message"    TEXT NOT NULL,
  "detail"     TEXT,
  "actorId"    TEXT,
  "actorLabel" TEXT NOT NULL DEFAULT '-',
  CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SystemLog_occurredAt_idx" ON "SystemLog"("occurredAt");
CREATE INDEX "SystemLog_level_occurredAt_idx" ON "SystemLog"("level", "occurredAt");
CREATE INDEX "SystemLog_source_idx" ON "SystemLog"("source");
