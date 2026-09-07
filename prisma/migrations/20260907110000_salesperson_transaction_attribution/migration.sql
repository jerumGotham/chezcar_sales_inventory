ALTER TABLE "CustomerOrder"
ADD COLUMN "salespersonId" TEXT,
ADD COLUMN "salespersonName" TEXT,
ADD COLUMN "salespersonLocationId" TEXT,
ADD COLUMN "salespersonLocationCode" TEXT,
ADD COLUMN "salespersonLocationName" TEXT,
ADD COLUMN "salespersonUpdatedById" TEXT,
ADD COLUMN "salespersonUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Sale"
ADD COLUMN "salespersonId" TEXT,
ADD COLUMN "salespersonName" TEXT,
ADD COLUMN "salespersonLocationId" TEXT,
ADD COLUMN "salespersonLocationCode" TEXT,
ADD COLUMN "salespersonLocationName" TEXT;

ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_salesperson_snapshot_complete" CHECK (
  ("salespersonId" IS NULL AND "salespersonName" IS NULL AND "salespersonLocationId" IS NULL AND "salespersonLocationCode" IS NULL AND "salespersonLocationName" IS NULL)
  OR
  ("salespersonId" IS NOT NULL AND "salespersonName" IS NOT NULL AND length(btrim("salespersonName")) > 0 AND "salespersonLocationId" IS NOT NULL AND "salespersonLocationCode" IS NOT NULL AND length(btrim("salespersonLocationCode")) > 0 AND "salespersonLocationName" IS NOT NULL AND length(btrim("salespersonLocationName")) > 0)
);

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_salesperson_snapshot_complete" CHECK (
  ("salespersonId" IS NULL AND "salespersonName" IS NULL AND "salespersonLocationId" IS NULL AND "salespersonLocationCode" IS NULL AND "salespersonLocationName" IS NULL)
  OR
  ("salespersonId" IS NOT NULL AND "salespersonName" IS NOT NULL AND length(btrim("salespersonName")) > 0 AND "salespersonLocationId" IS NOT NULL AND "salespersonLocationCode" IS NOT NULL AND length(btrim("salespersonLocationCode")) > 0 AND "salespersonLocationName" IS NOT NULL AND length(btrim("salespersonLocationName")) > 0)
);

CREATE INDEX "CustomerOrder_salespersonId_createdAt_idx" ON "CustomerOrder"("salespersonId", "createdAt");
CREATE INDEX "CustomerOrder_salespersonUpdatedById_idx" ON "CustomerOrder"("salespersonUpdatedById");
CREATE INDEX "Sale_salespersonId_postedAt_idx" ON "Sale"("salespersonId", "postedAt");

ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_salespersonUpdatedById_fkey" FOREIGN KEY ("salespersonUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
