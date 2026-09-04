CREATE TABLE "ProductVehicleCompatibility" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "make" TEXT,
  "model" TEXT NOT NULL,
  "startYear" INTEGER,
  "endYear" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVehicleCompatibility_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductVehicleCompatibility_year_range_check"
    CHECK ("startYear" IS NULL OR "endYear" IS NULL OR "startYear" <= "endYear"),
  CONSTRAINT "ProductVehicleCompatibility_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProductVehicleCompatibility_productId_idx" ON "ProductVehicleCompatibility"("productId");
CREATE INDEX "ProductVehicleCompatibility_make_idx" ON "ProductVehicleCompatibility"("make");
CREATE INDEX "ProductVehicleCompatibility_model_idx" ON "ProductVehicleCompatibility"("model");
CREATE INDEX "ProductVehicleCompatibility_startYear_endYear_idx" ON "ProductVehicleCompatibility"("startYear", "endYear");
