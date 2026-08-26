ALTER TABLE "Product" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Product" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "Product" ADD COLUMN "deactivatedById" TEXT;
ALTER TABLE "Product" ADD COLUMN "reactivatedById" TEXT;

CREATE INDEX "Product_createdById_idx" ON "Product"("createdById");
CREATE INDEX "Product_updatedById_idx" ON "Product"("updatedById");
CREATE INDEX "Product_deactivatedById_idx" ON "Product"("deactivatedById");
CREATE INDEX "Product_reactivatedById_idx" ON "Product"("reactivatedById");

ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_reactivatedById_fkey" FOREIGN KEY ("reactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "InventoryMovementType" ADD VALUE 'MANUAL_ADJUSTMENT';
ALTER TYPE "NotificationRelatedType" ADD VALUE 'INVENTORY_BALANCE';

ALTER TABLE "InventoryMovement" ADD COLUMN "reference" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "remarks" TEXT;
