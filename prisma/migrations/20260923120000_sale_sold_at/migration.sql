-- The day the goods changed hands, kept apart from the day the branch encoded
-- the receipt. Existing rows were encoded on the spot, so the two match.
ALTER TABLE "Sale" ADD COLUMN "soldAt" TIMESTAMP(3);
UPDATE "Sale" SET "soldAt" = "postedAt" WHERE "soldAt" IS NULL;
ALTER TABLE "Sale" ALTER COLUMN "soldAt" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "soldAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Sale_locationId_soldAt_idx" ON "Sale"("locationId", "soldAt");
