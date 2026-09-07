-- Split receiving quantities. Existing receipts predate discrepancy capture and are fully accepted.
ALTER TABLE "StockReceiptLine" ADD COLUMN "acceptedQuantity" INTEGER;
ALTER TABLE "StockReceiptLine" ADD COLUMN "quarantinedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockReceiptLine" ADD COLUMN "missingQuantity" INTEGER NOT NULL DEFAULT 0;
UPDATE "StockReceiptLine" SET "acceptedQuantity" = "quantity";
ALTER TABLE "StockReceiptLine" ALTER COLUMN "acceptedQuantity" SET NOT NULL;
ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_quantity_split_check"
  CHECK ("quantity" > 0 AND "acceptedQuantity" >= 0 AND "quarantinedQuantity" >= 0 AND "missingQuantity" >= 0
    AND "quantity" = "acceptedQuantity" + "quarantinedQuantity" + "missingQuantity");

CREATE TYPE "SupplierClaimStatus" AS ENUM ('DRAFT', 'PENDING', 'WAITING_REPLACEMENT', 'PARTIAL', 'REPLACEMENT_RECEIVED', 'REJECTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SupplierClaimReason" AS ENUM ('SUPPLIER_DAMAGE');
CREATE TYPE "SupplierClaimLineReason" AS ENUM ('DAMAGE', 'DEFECT', 'INCOMPLETE', 'WRONG_ITEM', 'WARRANTY');
CREATE TYPE "SupplierClaimSettlementType" AS ENUM ('REFUND', 'CREDIT');
ALTER TYPE "NotificationRelatedType" ADD VALUE 'SUPPLIER_CLAIM';

CREATE TABLE "SupplierClaim" (
  "id" TEXT NOT NULL, "reference" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "reason" "SupplierClaimReason" NOT NULL DEFAULT 'SUPPLIER_DAMAGE', "status" "SupplierClaimStatus" NOT NULL DEFAULT 'DRAFT',
  "supplierId" TEXT NOT NULL, "locationId" TEXT NOT NULL, "sourceReceiptId" TEXT, "customerWarrantyId" TEXT,
  "supplierName" TEXT NOT NULL, "locationCode" TEXT NOT NULL, "locationName" TEXT NOT NULL, "notes" TEXT, "targetDate" TIMESTAMP(3),
  "createdById" TEXT NOT NULL, "submittedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierClaim_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierClaimLine" (
  "id" TEXT NOT NULL, "claimId" TEXT NOT NULL, "productId" TEXT NOT NULL, "reason" "SupplierClaimLineReason" NOT NULL,
  "claimedQuantity" INTEGER NOT NULL, "quarantinedQuantity" INTEGER NOT NULL, "missingQuantity" INTEGER NOT NULL,
  "openQuarantinedQuantity" INTEGER NOT NULL, "openMissingQuantity" INTEGER NOT NULL,
  "productItemCode" TEXT NOT NULL, "productName" TEXT NOT NULL, "unitCost" DECIMAL(12,2) NOT NULL, "notes" TEXT,
  CONSTRAINT "SupplierClaimLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierClaimLine_quantities_check" CHECK ("claimedQuantity" > 0 AND "quarantinedQuantity" >= 0 AND "missingQuantity" >= 0 AND "claimedQuantity" = "quarantinedQuantity" + "missingQuantity" AND "openQuarantinedQuantity" >= 0 AND "openMissingQuantity" >= 0)
);
CREATE TABLE "SupplierClaimAction" (
  "id" TEXT NOT NULL, "claimId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "action" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
  "fromStatus" "SupplierClaimStatus" NOT NULL, "toStatus" "SupplierClaimStatus" NOT NULL, "detailsJson" JSONB, "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SupplierClaimAction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierClaimEvidence" (
  "id" TEXT NOT NULL, "claimId" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "fileName" TEXT NOT NULL, "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL, "caption" TEXT, "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierClaimEvidence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierClaimSettlement" (
  "id" TEXT NOT NULL, "claimId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "type" "SupplierClaimSettlementType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'PHP', "reference" TEXT NOT NULL, "notes" TEXT,
  "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SupplierClaimSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierClaimSettlement_amount_check" CHECK ("amount" > 0)
);
ALTER TABLE "InventoryMovement" ADD COLUMN "supplierClaimId" TEXT;
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_source_check";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_source_check" CHECK (
  ("type" IN ('MANUAL_ADJUSTMENT','CUSTOMER_ORDER_RELEASE','DIRECT_SALE','SALE_CORRECTION_REVERSAL','SALE_CORRECTION') AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL AND "supplierClaimId" IS NULL)
  OR ("transferId" IS NOT NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL AND "supplierClaimId" IS NULL)
  OR ("transferId" IS NULL AND "receiptId" IS NOT NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL AND "supplierClaimId" IS NULL)
  OR ("type" IN ('BACKJOB_PART_ISSUE','BACKJOB_PART_RETURN') AND "backjobPartId" IS NOT NULL AND "transferId" IS NULL AND "receiptId" IS NULL AND "warrantyId" IS NULL AND "supplierClaimId" IS NULL)
  OR ("type" IN ('WARRANTY_RECEIPT','WARRANTY_RELEASE') AND "warrantyId" IS NOT NULL AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "supplierClaimId" IS NULL)
  OR ("type" IN ('SUPPLIER_CLAIM_RETURN','SUPPLIER_CLAIM_REPAIR_SEND','SUPPLIER_CLAIM_REPLACEMENT_RECEIPT','SUPPLIER_CLAIM_REPAIRED_RECEIPT','SUPPLIER_CLAIM_WRITEOFF') AND "supplierClaimId" IS NOT NULL AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL)
);

CREATE UNIQUE INDEX "SupplierClaim_reference_key" ON "SupplierClaim"("reference");
CREATE UNIQUE INDEX "SupplierClaim_idempotencyKey_key" ON "SupplierClaim"("idempotencyKey");
CREATE UNIQUE INDEX "SupplierClaim_sourceReceiptId_key" ON "SupplierClaim"("sourceReceiptId");
CREATE INDEX "SupplierClaim_locationId_status_createdAt_idx" ON "SupplierClaim"("locationId", "status", "createdAt");
CREATE INDEX "SupplierClaim_targetDate_status_idx" ON "SupplierClaim"("targetDate", "status");
CREATE INDEX "SupplierClaim_supplierId_createdAt_idx" ON "SupplierClaim"("supplierId", "createdAt");
CREATE INDEX "SupplierClaim_customerWarrantyId_idx" ON "SupplierClaim"("customerWarrantyId");
CREATE UNIQUE INDEX "SupplierClaimLine_claimId_productId_key" ON "SupplierClaimLine"("claimId", "productId");
CREATE UNIQUE INDEX "SupplierClaimAction_claimId_idempotencyKey_key" ON "SupplierClaimAction"("claimId", "idempotencyKey");
CREATE INDEX "SupplierClaimAction_claimId_createdAt_idx" ON "SupplierClaimAction"("claimId", "createdAt");
CREATE UNIQUE INDEX "SupplierClaimEvidence_storageKey_key" ON "SupplierClaimEvidence"("storageKey");
CREATE INDEX "SupplierClaimEvidence_claimId_createdAt_idx" ON "SupplierClaimEvidence"("claimId", "createdAt");
CREATE UNIQUE INDEX "SupplierClaimSettlement_claimId_idempotencyKey_key" ON "SupplierClaimSettlement"("claimId", "idempotencyKey");
CREATE INDEX "SupplierClaimSettlement_claimId_createdAt_idx" ON "SupplierClaimSettlement"("claimId", "createdAt");
CREATE INDEX "InventoryMovement_supplierClaimId_idx" ON "InventoryMovement"("supplierClaimId");

ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_sourceReceiptId_fkey" FOREIGN KEY ("sourceReceiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_customerWarrantyId_fkey" FOREIGN KEY ("customerWarrantyId") REFERENCES "CustomerWarranty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaimLine" ADD CONSTRAINT "SupplierClaimLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SupplierClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaimLine" ADD CONSTRAINT "SupplierClaimLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaimAction" ADD CONSTRAINT "SupplierClaimAction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SupplierClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaimAction" ADD CONSTRAINT "SupplierClaimAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaimEvidence" ADD CONSTRAINT "SupplierClaimEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SupplierClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaimEvidence" ADD CONSTRAINT "SupplierClaimEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaimSettlement" ADD CONSTRAINT "SupplierClaimSettlement_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "SupplierClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierClaimSettlement" ADD CONSTRAINT "SupplierClaimSettlement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_supplierClaimId_fkey" FOREIGN KEY ("supplierClaimId") REFERENCES "SupplierClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "RoleDefinition" SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['supplier-claims:view','supplier-claims:create','supplier-claims:manage','supplier-claims:return-stock','supplier-claims:receive-replacement','supplier-claims:repair-stock','supplier-claims:record-monetary-resolution','supplier-claims:approve-writeoff','supplier-claims:close','supplier-claims:evidence','supplier-claims:print']::TEXT[]) AS grants(permission)) WHERE "isOwner" = true;
UPDATE "RoleDefinition" SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['supplier-claims:view','supplier-claims:create','supplier-claims:manage','supplier-claims:return-stock','supplier-claims:receive-replacement','supplier-claims:repair-stock','supplier-claims:evidence','supplier-claims:print']::TEXT[]) AS grants(permission)) WHERE "key" = 'stock-staff';
UPDATE "RoleDefinition" SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['supplier-claims:view','supplier-claims:create','supplier-claims:evidence','supplier-claims:print']::TEXT[]) AS grants(permission)) WHERE "key" = 'branch-staff';
UPDATE "RoleDefinition" SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['supplier-claims:view','supplier-claims:record-monetary-resolution','supplier-claims:print']::TEXT[]) AS grants(permission)) WHERE "key" = 'accounting-staff';
