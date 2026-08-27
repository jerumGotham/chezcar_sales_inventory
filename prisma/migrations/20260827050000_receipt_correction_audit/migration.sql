ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_CORRECTION_REVERSAL';
ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_CORRECTION';

CREATE TYPE "AccountingResolutionAction" AS ENUM ('CONFIRMED_CORRECT', 'VOIDED_REPLACED');

ALTER TABLE "Sale"
  ADD COLUMN "correctionOfId" TEXT,
  ADD COLUMN "correctedById" TEXT,
  ADD COLUMN "correctedAt" TIMESTAMP(3);

ALTER TABLE "SaleAccountingReview"
  ADD COLUMN "comparisonJson" TEXT,
  ADD COLUMN "receiptPhotoKey" TEXT,
  ADD COLUMN "receiptPhotoType" TEXT,
  ADD COLUMN "resolutionAction" "AccountingResolutionAction",
  ADD COLUMN "resolutionNote" TEXT,
  ADD COLUMN "resolvedById" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

ALTER TABLE "SaleAccountingReview" DROP COLUMN "receiptPhotoUrl";

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Sale_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleAccountingReview"
  ADD CONSTRAINT "SaleAccountingReview_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Sale_correctionOfId_idx" ON "Sale"("correctionOfId");
CREATE INDEX "Sale_correctedById_idx" ON "Sale"("correctedById");
CREATE INDEX "SaleAccountingReview_resolvedById_idx" ON "SaleAccountingReview"("resolvedById");
