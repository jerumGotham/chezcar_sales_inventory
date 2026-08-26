ALTER TYPE "InventoryMovementType" ADD VALUE 'CUSTOMER_ORDER_RELEASE';
ALTER TYPE "InventoryMovementType" ADD VALUE 'DIRECT_SALE';

CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CustomerOrderStatus" AS ENUM ('RESERVED', 'WAITING_STOCK', 'READY_FOR_RELEASE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CustomerOrderType" AS ENUM ('RESERVATION_NO_DP', 'RESERVATION_WITH_DP', 'WAITING_STOCK');
CREATE TYPE "SaleStatus" AS ENUM ('POSTED', 'VOIDED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'CREDIT_CARD', 'SPLIT');
CREATE TYPE "AccountingReviewStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FLAGGED');

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mobile" TEXT,
  "email" TEXT,
  "address" TEXT,
  "source" TEXT,
  "notes" TEXT,
  "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualReceipt" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "orderId" TEXT,
  "saleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerOrder" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" "CustomerOrderStatus" NOT NULL DEFAULT 'RESERVED',
  "type" "CustomerOrderType" NOT NULL,
  "downpaymentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "downpaymentReceiptNumber" TEXT,
  "finalReceiptNumber" TEXT,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "remainingBalance" DECIMAL(12,2) NOT NULL,
  "expectedReleaseDate" TIMESTAMP(3),
  "source" TEXT,
  "notes" TEXT,
  "cancellationNote" TEXT,
  "createdById" TEXT NOT NULL,
  "releasedById" TEXT,
  "cancelledById" TEXT,
  "releasedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerOrder_amounts_check" CHECK ("downpaymentAmount" >= 0 AND "totalAmount" >= 0 AND "remainingBalance" >= 0)
);

CREATE TABLE "CustomerOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productItemCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "baseUnitPrice" DECIMAL(12,2) NOT NULL,
  "finalUnitPrice" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "CustomerOrderLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerOrderLine_values_check" CHECK ("quantity" > 0 AND "baseUnitPrice" >= 0 AND "finalUnitPrice" >= 0)
);

CREATE TABLE "Sale" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "manualReceiptNumber" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "customerId" TEXT,
  "orderId" TEXT,
  "status" "SaleStatus" NOT NULL DEFAULT 'POSTED',
  "paymentMethod" "PaymentMethod" NOT NULL,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "amountPaid" DECIMAL(12,2) NOT NULL,
  "notes" TEXT,
  "postedById" TEXT NOT NULL,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Sale_amounts_check" CHECK ("totalAmount" >= 0 AND "amountPaid" >= 0)
);

CREATE TABLE "SaleLine" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productItemCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleLine_values_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0)
);

CREATE TABLE "SaleAccountingReview" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "status" "AccountingReviewStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "mismatchCategory" TEXT,
  "notes" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "SaleAccountingReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualReceipt_number_key" ON "ManualReceipt"("number");
CREATE INDEX "ManualReceipt_orderId_idx" ON "ManualReceipt"("orderId");
CREATE INDEX "ManualReceipt_saleId_idx" ON "ManualReceipt"("saleId");
CREATE UNIQUE INDEX "CustomerOrder_reference_key" ON "CustomerOrder"("reference");
CREATE UNIQUE INDEX "CustomerOrder_downpaymentReceiptNumber_key" ON "CustomerOrder"("downpaymentReceiptNumber");
CREATE UNIQUE INDEX "CustomerOrder_finalReceiptNumber_key" ON "CustomerOrder"("finalReceiptNumber");
CREATE INDEX "CustomerOrder_locationId_status_idx" ON "CustomerOrder"("locationId", "status");
CREATE INDEX "CustomerOrder_customerId_idx" ON "CustomerOrder"("customerId");
CREATE INDEX "CustomerOrder_createdById_idx" ON "CustomerOrder"("createdById");
CREATE INDEX "CustomerOrderLine_orderId_idx" ON "CustomerOrderLine"("orderId");
CREATE INDEX "CustomerOrderLine_productId_idx" ON "CustomerOrderLine"("productId");
CREATE UNIQUE INDEX "Sale_reference_key" ON "Sale"("reference");
CREATE UNIQUE INDEX "Sale_manualReceiptNumber_key" ON "Sale"("manualReceiptNumber");
CREATE UNIQUE INDEX "Sale_orderId_key" ON "Sale"("orderId");
CREATE INDEX "Sale_locationId_postedAt_idx" ON "Sale"("locationId", "postedAt");
CREATE INDEX "Sale_postedById_idx" ON "Sale"("postedById");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");
CREATE INDEX "SaleLine_productId_idx" ON "SaleLine"("productId");
CREATE UNIQUE INDEX "SaleAccountingReview_saleId_key" ON "SaleAccountingReview"("saleId");
CREATE INDEX "SaleAccountingReview_status_idx" ON "SaleAccountingReview"("status");
CREATE INDEX "SaleAccountingReview_reviewedById_idx" ON "SaleAccountingReview"("reviewedById");
CREATE INDEX "Customer_name_idx" ON "Customer"("name");
CREATE INDEX "Customer_mobile_idx" ON "Customer"("mobile");
CREATE INDEX "Customer_createdById_idx" ON "Customer"("createdById");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleAccountingReview" ADD CONSTRAINT "SaleAccountingReview_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleAccountingReview" ADD CONSTRAINT "SaleAccountingReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
