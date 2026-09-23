-- Fitment years are now typed as free text. The column is additive: startYear
-- and endYear stay, because the product search compares them numerically.
ALTER TABLE "ProductVehicleCompatibility" ADD COLUMN "yearsLabel" TEXT;

-- Backfill from what the numbers already say, so existing rows show a label.
UPDATE "ProductVehicleCompatibility"
SET "yearsLabel" = CASE
  WHEN "startYear" IS NULL THEN NULL
  WHEN "endYear" IS NULL THEN "startYear"::text || ' up'
  WHEN "startYear" = "endYear" THEN "startYear"::text
  ELSE "startYear"::text || '-' || "endYear"::text
END
WHERE "yearsLabel" IS NULL;
