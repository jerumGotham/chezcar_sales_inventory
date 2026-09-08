CREATE TABLE "BackjobItem" (
  "id" TEXT NOT NULL,
  "backjobId" TEXT NOT NULL,
  "originalSaleLineId" TEXT,
  "productId" TEXT,
  "productItemCode" TEXT,
  "productName" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "BackjobItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackjobItem_position_nonnegative" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "BackjobItem_backjobId_originalSaleLineId_key" ON "BackjobItem"("backjobId", "originalSaleLineId");
CREATE UNIQUE INDEX "BackjobItem_backjobId_position_key" ON "BackjobItem"("backjobId", "position");
CREATE INDEX "BackjobItem_originalSaleLineId_idx" ON "BackjobItem"("originalSaleLineId");
CREATE INDEX "BackjobItem_productId_idx" ON "BackjobItem"("productId");

ALTER TABLE "BackjobItem" ADD CONSTRAINT "BackjobItem_backjobId_fkey" FOREIGN KEY ("backjobId") REFERENCES "Backjob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobItem" ADD CONSTRAINT "BackjobItem_originalSaleLineId_fkey" FOREIGN KEY ("originalSaleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobItem" ADD CONSTRAINT "BackjobItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve every existing case, including legacy descriptions and original snapshots.
-- Header fields remain intact as first-item compatibility fields, not the aggregate.
INSERT INTO "BackjobItem" ("id", "backjobId", "originalSaleLineId", "productId", "productItemCode", "productName", "position")
SELECT 'backfill-' || "id", "id", "originalSaleLineId", "affectedProductId", "affectedProductItemCode",
       COALESCE("affectedProductName", "legacyProductDescription", 'Not recorded'), 0
FROM "Backjob";

UPDATE "RoleDefinition"
SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['backjobs:delete']::TEXT[]) AS grants(permission))
WHERE "isOwner" = true;
