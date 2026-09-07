ALTER TABLE "SaleAccountingReview" ADD COLUMN "verifiedAt" TIMESTAMP(3);

UPDATE "SaleAccountingReview"
SET "verifiedAt" = CASE
  WHEN "resolutionAction" = 'CONFIRMED_CORRECT' THEN "resolvedAt"
  ELSE "reviewedAt"
END
WHERE "status" = 'VERIFIED';

CREATE INDEX "SaleAccountingReview_verifiedAt_idx" ON "SaleAccountingReview"("verifiedAt");

ALTER TABLE "InventoryMovement" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");
