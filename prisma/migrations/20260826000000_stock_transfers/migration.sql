CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'FOR_DISPATCH', 'IN_TRANSIT', 'RECEIVED', 'DISCREPANCY_REPORTED', 'UNDER_REVIEW', 'RESOLVED');
CREATE TYPE "InventoryMovementType" AS ENUM ('TRANSFER_DISPATCH', 'TRANSFER_RECEIPT', 'TRANSFER_RESTORATION', 'TRANSFER_LOSS', 'TRANSFER_RESOLUTION');

CREATE TABLE "StockTransfer" (
  "id" TEXT NOT NULL, "reference" TEXT NOT NULL, "destinationId" TEXT NOT NULL,
  "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL, "finalizedById" TEXT, "dispatchedById" TEXT, "receivedById" TEXT,
  "finalizedAt" TIMESTAMP(3), "dispatchedAt" TIMESTAMP(3), "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StockTransferLine" (
  "id" TEXT NOT NULL, "transferId" TEXT NOT NULL, "productId" TEXT NOT NULL, "requestedQuantity" INTEGER NOT NULL,
  "dispatchedQuantity" INTEGER NOT NULL DEFAULT 0, "inTransitQuantity" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockTransferLine_quantity_check" CHECK ("requestedQuantity" > 0 AND "dispatchedQuantity" >= 0 AND "inTransitQuantity" >= 0)
);
CREATE TABLE "StockTransferDiscrepancy" ("id" TEXT NOT NULL, "transferId" TEXT NOT NULL, "reportedById" TEXT NOT NULL, "notes" TEXT NOT NULL, "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "StockTransferDiscrepancy_pkey" PRIMARY KEY ("id"));
CREATE TABLE "StockTransferDiscrepancyLine" ("id" TEXT NOT NULL, "discrepancyId" TEXT NOT NULL, "transferLineId" TEXT NOT NULL, "actualQuantity" INTEGER NOT NULL, "reason" TEXT NOT NULL, "notes" TEXT, CONSTRAINT "StockTransferDiscrepancyLine_pkey" PRIMARY KEY ("id"), CONSTRAINT "StockTransferDiscrepancyLine_quantity_check" CHECK ("actualQuantity" >= 0));
CREATE TABLE "StockTransferInvestigation" ("id" TEXT NOT NULL, "transferId" TEXT NOT NULL, "submittedById" TEXT NOT NULL, "findings" TEXT NOT NULL, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "StockTransferInvestigation_pkey" PRIMARY KEY ("id"));
CREATE TABLE "StockTransferResolution" ("id" TEXT NOT NULL, "transferId" TEXT NOT NULL, "postedById" TEXT NOT NULL, "notes" TEXT NOT NULL, "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "StockTransferResolution_pkey" PRIMARY KEY ("id"));
CREATE TABLE "StockTransferResolutionLine" ("id" TEXT NOT NULL, "resolutionId" TEXT NOT NULL, "transferLineId" TEXT NOT NULL, "destinationQty" INTEGER NOT NULL, "restoreToSrQty" INTEGER NOT NULL, "lossQty" INTEGER NOT NULL, CONSTRAINT "StockTransferResolutionLine_pkey" PRIMARY KEY ("id"), CONSTRAINT "StockTransferResolutionLine_quantity_check" CHECK ("destinationQty" >= 0 AND "restoreToSrQty" >= 0 AND "lossQty" >= 0));
CREATE TABLE "InventoryMovement" ("id" TEXT NOT NULL, "transferId" TEXT NOT NULL, "productId" TEXT NOT NULL, "locationId" TEXT, "quantity" INTEGER NOT NULL, "type" "InventoryMovementType" NOT NULL, "actorId" TEXT NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "StockTransfer_reference_key" ON "StockTransfer"("reference");
CREATE INDEX "StockTransfer_destinationId_status_idx" ON "StockTransfer"("destinationId", "status");
CREATE INDEX "StockTransfer_status_idx" ON "StockTransfer"("status");
CREATE UNIQUE INDEX "StockTransferLine_transferId_productId_key" ON "StockTransferLine"("transferId", "productId");
CREATE UNIQUE INDEX "StockTransferDiscrepancy_transferId_key" ON "StockTransferDiscrepancy"("transferId");
CREATE UNIQUE INDEX "StockTransferDiscrepancyLine_discrepancyId_transferLineId_key" ON "StockTransferDiscrepancyLine"("discrepancyId", "transferLineId");
CREATE UNIQUE INDEX "StockTransferInvestigation_transferId_key" ON "StockTransferInvestigation"("transferId");
CREATE UNIQUE INDEX "StockTransferResolution_transferId_key" ON "StockTransferResolution"("transferId");
CREATE UNIQUE INDEX "StockTransferResolutionLine_resolutionId_transferLineId_key" ON "StockTransferResolutionLine"("resolutionId", "transferLineId");
CREATE INDEX "InventoryMovement_transferId_idx" ON "InventoryMovement"("transferId");
CREATE INDEX "InventoryMovement_productId_locationId_idx" ON "InventoryMovement"("productId", "locationId");
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferDiscrepancy" ADD CONSTRAINT "StockTransferDiscrepancy_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferDiscrepancy" ADD CONSTRAINT "StockTransferDiscrepancy_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferDiscrepancyLine" ADD CONSTRAINT "StockTransferDiscrepancyLine_discrepancyId_fkey" FOREIGN KEY ("discrepancyId") REFERENCES "StockTransferDiscrepancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferDiscrepancyLine" ADD CONSTRAINT "StockTransferDiscrepancyLine_transferLineId_fkey" FOREIGN KEY ("transferLineId") REFERENCES "StockTransferLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferInvestigation" ADD CONSTRAINT "StockTransferInvestigation_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferInvestigation" ADD CONSTRAINT "StockTransferInvestigation_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferResolution" ADD CONSTRAINT "StockTransferResolution_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferResolution" ADD CONSTRAINT "StockTransferResolution_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferResolutionLine" ADD CONSTRAINT "StockTransferResolutionLine_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "StockTransferResolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferResolutionLine" ADD CONSTRAINT "StockTransferResolutionLine_transferLineId_fkey" FOREIGN KEY ("transferLineId") REFERENCES "StockTransferLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
