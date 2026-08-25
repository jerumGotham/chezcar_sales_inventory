ALTER TYPE "InventoryMovementType" ADD VALUE 'SUPPLIER_RECEIPT';

CREATE TABLE "StockReceipt" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "notes" TEXT,
  "locationId" TEXT NOT NULL,
  "receivedById" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockReceipt_reference_check" CHECK (length(btrim("reference")) > 0),
  CONSTRAINT "StockReceipt_supplier_check" CHECK (length(btrim("supplier")) > 0)
);

CREATE TABLE "StockReceiptLine" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "productItemCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  CONSTRAINT "StockReceiptLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockReceiptLine_quantity_check" CHECK ("quantity" > 0)
);

ALTER TABLE "InventoryMovement" ALTER COLUMN "transferId" DROP NOT NULL;
ALTER TABLE "InventoryMovement" ADD COLUMN "receiptId" TEXT;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_source_check"
  CHECK (("transferId" IS NOT NULL AND "receiptId" IS NULL) OR ("transferId" IS NULL AND "receiptId" IS NOT NULL));

CREATE UNIQUE INDEX "StockReceipt_reference_key" ON "StockReceipt"("reference");
CREATE INDEX "StockReceipt_locationId_receivedAt_idx" ON "StockReceipt"("locationId", "receivedAt");
CREATE INDEX "StockReceipt_receivedById_idx" ON "StockReceipt"("receivedById");
CREATE UNIQUE INDEX "StockReceiptLine_receiptId_productId_key" ON "StockReceiptLine"("receiptId", "productId");
CREATE INDEX "InventoryMovement_receiptId_idx" ON "InventoryMovement"("receiptId");

ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReceiptLine" ADD CONSTRAINT "StockReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
