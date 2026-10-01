-- Money going back to a customer. Payment holds one row per receipt issued for
-- money received and `Payment.saleId` is unique, so a refund cannot be another
-- Payment row; it is a ledger of its own. Reports subtract it on the day the
-- money went back, so a period already reported does not change underneath.

-- CreateEnum
CREATE TYPE "RefundKind" AS ENUM ('CANCELLED_ORDER', 'POSTED_SALE');

-- CreateEnum
CREATE TYPE "RefundDisposition" AS ENUM ('RESELLABLE', 'QUARANTINED');

-- AlterEnum: stock coming back on a refund, and the way out of quarantine that
-- did not exist before. Without QUARANTINE_RELEASE a quarantined unit could
-- never be sold again.
ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_REFUND_RETURN';
ALTER TYPE "InventoryMovementType" ADD VALUE 'SALE_REFUND_QUARANTINE';
ALTER TYPE "InventoryMovementType" ADD VALUE 'QUARANTINE_RELEASE';

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "RefundKind" NOT NULL,
    "locationId" TEXT NOT NULL,
    "stockLocationId" TEXT,
    "customerId" TEXT,
    "orderId" TEXT,
    "saleId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "acknowledgementNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "salespersonId" TEXT,
    "salespersonName" TEXT,
    "salespersonLocationId" TEXT,
    "salespersonLocationCode" TEXT,
    "salespersonLocationName" TEXT,
    "refundedById" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundLine" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productItemCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "disposition" "RefundDisposition" NOT NULL,
    CONSTRAINT "RefundLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Refund_reference_key" ON "Refund"("reference");
CREATE INDEX "Refund_locationId_refundedAt_idx" ON "Refund"("locationId", "refundedAt");
CREATE INDEX "Refund_stockLocationId_idx" ON "Refund"("stockLocationId");
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");
CREATE INDEX "Refund_saleId_idx" ON "Refund"("saleId");
CREATE INDEX "Refund_customerId_idx" ON "Refund"("customerId");
CREATE INDEX "Refund_salespersonId_refundedAt_idx" ON "Refund"("salespersonId", "refundedAt");
CREATE INDEX "Refund_refundedById_idx" ON "Refund"("refundedById");
CREATE INDEX "RefundLine_refundId_idx" ON "RefundLine"("refundId");
CREATE INDEX "RefundLine_productId_idx" ON "RefundLine"("productId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
