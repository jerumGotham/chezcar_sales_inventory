ALTER TYPE "NotificationRelatedType" ADD VALUE 'BACKJOB';

CREATE TYPE "BackjobStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED');
CREATE TYPE "BackjobCoverage" AS ENUM ('PENDING', 'COVERED', 'CHARGEABLE');
CREATE TYPE "BackjobAcknowledgementMethod" AS ENUM ('SIGNED', 'VERBAL', 'DECLINED');

CREATE TABLE "Backjob" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "BackjobStatus" NOT NULL DEFAULT 'DRAFT',
  "coverage" "BackjobCoverage" NOT NULL DEFAULT 'PENDING',
  "locationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "originalSaleId" TEXT,
  "originalSaleLineId" TEXT,
  "affectedProductId" TEXT,
  "chargeSaleId" TEXT,
  "isLegacy" BOOLEAN NOT NULL DEFAULT false,
  "legacyReference" TEXT,
  "legacyReason" TEXT,
  "legacyProductDescription" TEXT,
  "originalSaleReference" TEXT,
  "originalReceiptNumber" TEXT,
  "customerName" TEXT NOT NULL,
  "customerMobile" TEXT,
  "affectedProductItemCode" TEXT,
  "affectedProductName" TEXT,
  "locationCode" TEXT NOT NULL,
  "locationName" TEXT NOT NULL,
  "concern" TEXT NOT NULL,
  "notes" TEXT,
  "installerId" TEXT,
  "installerName" TEXT,
  "installerLocationId" TEXT,
  "installerLocationCode" TEXT,
  "installerLocationName" TEXT,
  "scheduledFor" TIMESTAMP(3),
  "workPerformed" TEXT,
  "completionNotes" TEXT,
  "chargeableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "acknowledgementMethod" "BackjobAcknowledgementMethod",
  "acknowledgedByName" TEXT,
  "acknowledgementNote" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "completedById" TEXT,
  "cancelledById" TEXT,
  "rejectedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Backjob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Backjob_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "Backjob_concern_nonblank" CHECK (length(btrim("concern")) > 0),
  CONSTRAINT "Backjob_snapshot_nonblank" CHECK (length(btrim("customerName")) > 0 AND length(btrim("locationCode")) > 0 AND length(btrim("locationName")) > 0),
  CONSTRAINT "Backjob_charge_nonnegative" CHECK ("chargeableAmount" >= 0)
);

CREATE TABLE "BackjobPart" (
  "id" TEXT NOT NULL,
  "backjobId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productItemCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "plannedQuantity" INTEGER NOT NULL DEFAULT 0,
  "issuedQuantity" INTEGER NOT NULL DEFAULT 0,
  "usedQuantity" INTEGER,
  "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackjobPart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackjobPart_quantities_check" CHECK ("plannedQuantity" >= 0 AND "issuedQuantity" >= 0 AND ("usedQuantity" IS NULL OR "usedQuantity" >= 0) AND "returnedQuantity" >= 0 AND "returnedQuantity" <= "issuedQuantity" AND ("usedQuantity" IS NULL OR "usedQuantity" + "returnedQuantity" <= "issuedQuantity"))
);

CREATE TABLE "BackjobEvent" (
  "id" TEXT NOT NULL,
  "backjobId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "fromStatus" "BackjobStatus",
  "toStatus" "BackjobStatus",
  "reason" TEXT,
  "detailsJson" JSONB,
  "actorId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackjobEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackjobScheduleHistory" (
  "id" TEXT NOT NULL,
  "backjobId" TEXT NOT NULL,
  "previousSchedule" TIMESTAMP(3),
  "newSchedule" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "actorId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackjobScheduleHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackjobAttachment" (
  "id" TEXT NOT NULL,
  "backjobId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "caption" TEXT,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackjobAttachment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryMovement" ADD COLUMN "backjobPartId" TEXT;
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_source_check";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_source_check" CHECK (
  ("type" IN ('MANUAL_ADJUSTMENT','CUSTOMER_ORDER_RELEASE','DIRECT_SALE','SALE_CORRECTION_REVERSAL','SALE_CORRECTION') AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL)
  OR ("transferId" IS NOT NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL)
  OR ("transferId" IS NULL AND "receiptId" IS NOT NULL AND "backjobPartId" IS NULL)
  OR ("type" IN ('BACKJOB_PART_ISSUE','BACKJOB_PART_RETURN') AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NOT NULL)
);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_backjob_sign_check" CHECK (("type" = 'BACKJOB_PART_ISSUE' AND "quantity" < 0) OR ("type" = 'BACKJOB_PART_RETURN' AND "quantity" > 0) OR "type" NOT IN ('BACKJOB_PART_ISSUE','BACKJOB_PART_RETURN'));

CREATE UNIQUE INDEX "Backjob_reference_key" ON "Backjob"("reference");
CREATE INDEX "Backjob_locationId_status_scheduledFor_idx" ON "Backjob"("locationId","status","scheduledFor");
CREATE INDEX "Backjob_customerId_createdAt_idx" ON "Backjob"("customerId","createdAt");
CREATE INDEX "Backjob_originalSaleId_idx" ON "Backjob"("originalSaleId");
CREATE INDEX "Backjob_originalSaleLineId_idx" ON "Backjob"("originalSaleLineId");
CREATE INDEX "Backjob_installerId_status_idx" ON "Backjob"("installerId","status");
CREATE UNIQUE INDEX "BackjobPart_backjobId_productId_key" ON "BackjobPart"("backjobId","productId");
CREATE INDEX "BackjobPart_productId_idx" ON "BackjobPart"("productId");
CREATE INDEX "BackjobEvent_backjobId_occurredAt_idx" ON "BackjobEvent"("backjobId","occurredAt");
CREATE INDEX "BackjobScheduleHistory_backjobId_recordedAt_idx" ON "BackjobScheduleHistory"("backjobId","recordedAt");
CREATE UNIQUE INDEX "BackjobAttachment_storageKey_key" ON "BackjobAttachment"("storageKey");
CREATE INDEX "BackjobAttachment_backjobId_uploadedAt_idx" ON "BackjobAttachment"("backjobId","uploadedAt");
CREATE INDEX "InventoryMovement_backjobPartId_idx" ON "InventoryMovement"("backjobPartId");

ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_originalSaleId_fkey" FOREIGN KEY ("originalSaleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_originalSaleLineId_fkey" FOREIGN KEY ("originalSaleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_affectedProductId_fkey" FOREIGN KEY ("affectedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_chargeSaleId_fkey" FOREIGN KEY ("chargeSaleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Backjob" ADD CONSTRAINT "Backjob_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobPart" ADD CONSTRAINT "BackjobPart_backjobId_fkey" FOREIGN KEY ("backjobId") REFERENCES "Backjob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobPart" ADD CONSTRAINT "BackjobPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobEvent" ADD CONSTRAINT "BackjobEvent_backjobId_fkey" FOREIGN KEY ("backjobId") REFERENCES "Backjob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobEvent" ADD CONSTRAINT "BackjobEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobScheduleHistory" ADD CONSTRAINT "BackjobScheduleHistory_backjobId_fkey" FOREIGN KEY ("backjobId") REFERENCES "Backjob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobScheduleHistory" ADD CONSTRAINT "BackjobScheduleHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobAttachment" ADD CONSTRAINT "BackjobAttachment_backjobId_fkey" FOREIGN KEY ("backjobId") REFERENCES "Backjob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackjobAttachment" ADD CONSTRAINT "BackjobAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_backjobPartId_fkey" FOREIGN KEY ("backjobPartId") REFERENCES "BackjobPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "RoleDefinition" SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['backjobs:view','backjobs:create','backjobs:update','backjobs:schedule','backjobs:complete','backjobs:parts:issue','backjobs:parts:return','backjobs:print']::TEXT[]) AS grants(permission)) WHERE "isOwner" = true;
UPDATE "RoleDefinition" SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['backjobs:view','backjobs:create','backjobs:update','backjobs:schedule','backjobs:complete','backjobs:parts:issue','backjobs:parts:return','backjobs:print']::TEXT[]) AS grants(permission)) WHERE "key" = 'branch-staff';
