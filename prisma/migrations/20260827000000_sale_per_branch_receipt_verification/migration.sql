-- AlterEnum: AccountingReviewStatus rename FLAGGED -> MISMATCH_REPORTED (additive, preserves UNVERIFIED/VERIFIED)
ALTER TYPE "AccountingReviewStatus" RENAME VALUE 'FLAGGED' TO 'MISMATCH_REPORTED';

-- AlterEnum: NotificationRelatedType add SALE (non-blocking, additive)
ALTER TYPE "NotificationRelatedType" ADD VALUE IF NOT EXISTS 'SALE';

-- AlterTable: Sale add receiptBooklet and version with defaults for backfill
ALTER TABLE "Sale" ADD COLUMN "receiptBooklet" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Sale" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Drop global unique on manualReceiptNumber and replace with per-branch composite
DROP INDEX IF EXISTS "Sale_manualReceiptNumber_key";
CREATE UNIQUE INDEX "Sale_locationId_receiptBooklet_manualReceiptNumber_key" ON "Sale"("locationId", "receiptBooklet", "manualReceiptNumber");

-- Ensure version check (non-negative)
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_version_check" CHECK ("version" >= 1);

-- AlterTable: ManualReceipt add locationId and receiptBooklet with defaults
ALTER TABLE "ManualReceipt" ADD COLUMN "locationId" TEXT;
ALTER TABLE "ManualReceipt" ADD COLUMN "receiptBooklet" TEXT NOT NULL DEFAULT '';

-- Backfill already handled via DEFAULT ''; existing rows now have receiptBooklet = '' and locationId = NULL

-- Drop global unique on number and replace with per-branch composite
DROP INDEX IF EXISTS "ManualReceipt_number_key";
CREATE UNIQUE INDEX "ManualReceipt_locationId_receiptBooklet_number_key" ON "ManualReceipt"("locationId", "receiptBooklet", "number");
CREATE INDEX "ManualReceipt_locationId_idx" ON "ManualReceipt"("locationId");

-- Foreign key for ManualReceipt.locationId
ALTER TABLE "ManualReceipt" ADD CONSTRAINT "ManualReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
