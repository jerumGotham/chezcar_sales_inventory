-- CreateTable
CREATE TABLE "ProductBranchPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductBranchPrice_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "ProductBranchPrice_locationId_idx" ON "ProductBranchPrice"("locationId");
-- CreateIndex
CREATE UNIQUE INDEX "ProductBranchPrice_productId_locationId_key" ON "ProductBranchPrice"("productId", "locationId");
-- AddForeignKey
ALTER TABLE "ProductBranchPrice" ADD CONSTRAINT "ProductBranchPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProductBranchPrice" ADD CONSTRAINT "ProductBranchPrice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
