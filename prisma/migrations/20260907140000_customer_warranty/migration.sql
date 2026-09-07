ALTER TYPE "NotificationRelatedType" ADD VALUE 'CUSTOMER_WARRANTY';

CREATE TYPE "CustomerWarrantyStatus" AS ENUM ('ASSESSMENT','APPROVED_REPAIR','APPROVED_REPLACEMENT','WAITING_STOCK','READY','RELEASED','COMPLETED','REJECTED','CANCELLED');
CREATE TYPE "CustomerWarrantyResolution" AS ENUM ('REPAIR','REPLACEMENT');

ALTER TABLE "Product" ADD COLUMN "warrantyDurationMonths" INTEGER;
ALTER TABLE "SaleLine" ADD COLUMN "warrantyDurationMonths" INTEGER;
ALTER TABLE "SaleLine" ADD COLUMN "warrantyExpiresAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD CONSTRAINT "Product_warranty_duration_positive" CHECK ("warrantyDurationMonths" IS NULL OR "warrantyDurationMonths" > 0);
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_warranty_duration_positive" CHECK ("warrantyDurationMonths" IS NULL OR "warrantyDurationMonths" > 0);

CREATE TABLE "CustomerWarranty" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "CustomerWarrantyStatus" NOT NULL DEFAULT 'ASSESSMENT',
  "resolution" "CustomerWarrantyResolution",
  "locationId" TEXT NOT NULL,
  "customerId" TEXT,
  "saleId" TEXT,
  "saleLineId" TEXT,
  "productId" TEXT,
  "replacementProductId" TEXT,
  "isLegacy" BOOLEAN NOT NULL DEFAULT false,
  "legacyCustomerName" TEXT,
  "legacySaleReference" TEXT,
  "legacyReason" TEXT,
  "customerName" TEXT NOT NULL,
  "locationCode" TEXT NOT NULL,
  "locationName" TEXT NOT NULL,
  "saleReference" TEXT,
  "receiptNumber" TEXT,
  "productItemCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "soldQuantity" INTEGER,
  "warrantyDurationMonths" INTEGER,
  "warrantyExpiresAt" TIMESTAMP(3),
  "claimQuantity" INTEGER NOT NULL,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "concern" TEXT NOT NULL,
  "assessmentNotes" TEXT,
  "replacementReason" TEXT,
  "replacementItemCode" TEXT,
  "replacementProductName" TEXT,
  "intakePhotoKey" TEXT NOT NULL,
  "intakePhotoType" TEXT NOT NULL,
  "intakePhotoName" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "targetDate" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerWarranty_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerWarranty_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "CustomerWarranty_claim_quantity_positive" CHECK ("claimQuantity" > 0),
  CONSTRAINT "CustomerWarranty_received_quantity_check" CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "claimQuantity"),
  CONSTRAINT "CustomerWarranty_warranty_duration_nonnegative" CHECK ("warrantyDurationMonths" IS NULL OR "warrantyDurationMonths" >= 0),
  CONSTRAINT "CustomerWarranty_concern_nonblank" CHECK (length(btrim("concern")) > 0),
  CONSTRAINT "CustomerWarranty_attribution_check" CHECK (("isLegacy" AND "saleId" IS NULL AND "saleLineId" IS NULL AND "legacyReason" IS NOT NULL) OR (NOT "isLegacy" AND "customerId" IS NOT NULL AND "saleId" IS NOT NULL AND "saleLineId" IS NOT NULL AND "productId" IS NOT NULL))
);

CREATE TABLE "CustomerWarrantyEvent" (
  "id" TEXT NOT NULL,
  "warrantyId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "fromStatus" "CustomerWarrantyStatus",
  "toStatus" "CustomerWarrantyStatus",
  "detailsJson" JSONB,
  "actorId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerWarrantyEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerWarrantyAction" (
  "id" TEXT NOT NULL,
  "warrantyId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerWarrantyAction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryMovement" ADD COLUMN "warrantyId" TEXT;
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_source_check";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_source_check" CHECK (
  ("type" IN ('MANUAL_ADJUSTMENT','CUSTOMER_ORDER_RELEASE','DIRECT_SALE','SALE_CORRECTION_REVERSAL','SALE_CORRECTION') AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL)
  OR ("transferId" IS NOT NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL)
  OR ("transferId" IS NULL AND "receiptId" IS NOT NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL)
  OR ("type" IN ('BACKJOB_PART_ISSUE','BACKJOB_PART_RETURN') AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NOT NULL AND "warrantyId" IS NULL)
  OR ("type" IN ('WARRANTY_RECEIPT','WARRANTY_RELEASE') AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NOT NULL)
);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warranty_sign_check" CHECK (("type" = 'WARRANTY_RECEIPT' AND "quantity" > 0) OR ("type" = 'WARRANTY_RELEASE' AND "quantity" < 0) OR "type" NOT IN ('WARRANTY_RECEIPT','WARRANTY_RELEASE'));

CREATE UNIQUE INDEX "CustomerWarranty_reference_key" ON "CustomerWarranty"("reference");
CREATE UNIQUE INDEX "CustomerWarranty_idempotencyKey_key" ON "CustomerWarranty"("idempotencyKey");
CREATE UNIQUE INDEX "CustomerWarranty_intakePhotoKey_key" ON "CustomerWarranty"("intakePhotoKey");
CREATE INDEX "CustomerWarranty_locationId_status_createdAt_idx" ON "CustomerWarranty"("locationId","status","createdAt");
CREATE INDEX "CustomerWarranty_targetDate_status_idx" ON "CustomerWarranty"("targetDate","status");
CREATE INDEX "CustomerWarranty_customerId_createdAt_idx" ON "CustomerWarranty"("customerId","createdAt");
CREATE INDEX "CustomerWarranty_saleLineId_idx" ON "CustomerWarranty"("saleLineId");
CREATE INDEX "CustomerWarrantyEvent_warrantyId_occurredAt_idx" ON "CustomerWarrantyEvent"("warrantyId","occurredAt");
CREATE UNIQUE INDEX "CustomerWarrantyAction_warrantyId_idempotencyKey_key" ON "CustomerWarrantyAction"("warrantyId","idempotencyKey");
CREATE INDEX "CustomerWarrantyAction_actorId_createdAt_idx" ON "CustomerWarrantyAction"("actorId","createdAt");
CREATE INDEX "InventoryMovement_warrantyId_idx" ON "InventoryMovement"("warrantyId");

ALTER TABLE "CustomerWarranty" ADD CONSTRAINT "CustomerWarranty_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarranty" ADD CONSTRAINT "CustomerWarranty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarranty" ADD CONSTRAINT "CustomerWarranty_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarranty" ADD CONSTRAINT "CustomerWarranty_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarranty" ADD CONSTRAINT "CustomerWarranty_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarranty" ADD CONSTRAINT "CustomerWarranty_replacementProductId_fkey" FOREIGN KEY ("replacementProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarranty" ADD CONSTRAINT "CustomerWarranty_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarrantyEvent" ADD CONSTRAINT "CustomerWarrantyEvent_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "CustomerWarranty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarrantyEvent" ADD CONSTRAINT "CustomerWarrantyEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarrantyAction" ADD CONSTRAINT "CustomerWarrantyAction_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "CustomerWarranty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerWarrantyAction" ADD CONSTRAINT "CustomerWarrantyAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "CustomerWarranty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "RoleDefinition" SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['customer-warranties:view','customer-warranties:create','customer-warranties:photos:add','customer-warranties:receive-quarantine','customer-warranties:assess','customer-warranties:approve','customer-warranties:release','customer-warranties:complete','customer-warranties:print']::TEXT[]) AS grants(permission)) WHERE "isOwner" = true;
UPDATE "RoleDefinition" SET "permissions" = ARRAY(SELECT DISTINCT permission FROM unnest("permissions" || ARRAY['customer-warranties:view','customer-warranties:create','customer-warranties:photos:add']::TEXT[]) AS grants(permission)) WHERE "key" = 'branch-staff';

CREATE FUNCTION reject_warranty_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Warranty audit records are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerWarrantyEvent_immutable" BEFORE UPDATE OR DELETE ON "CustomerWarrantyEvent" FOR EACH ROW EXECUTE FUNCTION reject_warranty_audit_mutation();
CREATE TRIGGER "CustomerWarrantyAction_immutable" BEFORE UPDATE OR DELETE ON "CustomerWarrantyAction" FOR EACH ROW EXECUTE FUNCTION reject_warranty_audit_mutation();
