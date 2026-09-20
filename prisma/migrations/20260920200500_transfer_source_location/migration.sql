-- A transfer now records where the stock came from. Existing rows all moved
-- stock out of the Stock Room, so they are backfilled with it before the
-- column becomes required.
ALTER TABLE "StockTransfer" ADD COLUMN "sourceId" TEXT;

UPDATE "StockTransfer"
SET "sourceId" = (
  SELECT "id" FROM "Location"
  WHERE "code" = 'SR' AND "type" = 'WAREHOUSE'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "sourceId" IS NULL;

ALTER TABLE "StockTransfer" ALTER COLUMN "sourceId" SET NOT NULL;

CREATE INDEX "StockTransfer_sourceId_status_idx" ON "StockTransfer"("sourceId", "status");

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Returned stock goes back to whichever location dispatched it.
ALTER TABLE "StockTransferResolutionLine" RENAME COLUMN "restoreToSrQty" TO "restoreToSourceQty";
