ALTER TABLE "Product"
  ADD COLUMN "imageKey" TEXT,
  ADD COLUMN "imageType" TEXT;

CREATE UNIQUE INDEX "Product_imageKey_key" ON "Product"("imageKey");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_image_metadata_pair"
  CHECK (
    ("imageKey" IS NULL AND "imageType" IS NULL)
    OR
    ("imageKey" IS NOT NULL AND "imageType" IN ('image/jpeg', 'image/png', 'image/webp'))
  );
