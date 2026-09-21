-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ORDER_DOWNPAYMENT', 'ORDER_PAYMENT', 'ORDER_FINAL', 'DIRECT_SALE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "locationId" TEXT NOT NULL,
    "customerId" TEXT,
    "orderId" TEXT,
    "saleId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "receiptBooklet" TEXT NOT NULL DEFAULT '',
    "receiptNumber" TEXT NOT NULL,
    "notes" TEXT,
    "salespersonId" TEXT,
    "salespersonName" TEXT,
    "salespersonLocationId" TEXT,
    "salespersonLocationCode" TEXT,
    "salespersonLocationName" TEXT,
    "collectedById" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStatus" "AccountingReviewStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "mismatchCategory" TEXT,
    "reviewNotes" TEXT,
    "receiptPhotoKey" TEXT,
    "receiptPhotoType" TEXT,
    "evidenceUploadedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "branchResponse" TEXT,
    "branchResponseNote" TEXT,
    "branchReplacementReceiptNumber" TEXT,
    "branchRespondedById" TEXT,
    "branchRespondedAt" TIMESTAMP(3),
    "resolutionAction" "AccountingResolutionAction",
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_saleId_key" ON "Payment"("saleId");

-- CreateIndex
CREATE INDEX "Payment_locationId_collectedAt_idx" ON "Payment"("locationId", "collectedAt");

-- CreateIndex
CREATE INDEX "Payment_locationId_reviewStatus_idx" ON "Payment"("locationId", "reviewStatus");

-- CreateIndex
CREATE INDEX "Payment_verifiedAt_idx" ON "Payment"("verifiedAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_salespersonId_verifiedAt_idx" ON "Payment"("salespersonId", "verifiedAt");

-- CreateIndex
CREATE INDEX "Payment_collectedById_idx" ON "Payment"("collectedById");

-- CreateIndex
CREATE INDEX "Payment_reviewedById_idx" ON "Payment"("reviewedById");

-- CreateIndex
CREATE INDEX "Payment_branchRespondedById_idx" ON "Payment"("branchRespondedById");

-- CreateIndex
CREATE INDEX "Payment_resolvedById_idx" ON "Payment"("resolvedById");

-- CreateIndex
CREATE INDEX "Payment_voidedById_idx" ON "Payment"("voidedById");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchRespondedById_fkey" FOREIGN KEY ("branchRespondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: one Payment row per posted sale receipt.
-- The amount is the sale's amountPaid, which for an order release is the balance
-- settled at release and for a direct sale is the full total. Downpayments are
-- backfilled separately below, so the two never overlap.
INSERT INTO "Payment" (
    "id", "reference", "kind", "status", "locationId", "customerId", "orderId", "saleId",
    "amount", "method", "receiptBooklet", "receiptNumber",
    "salespersonId", "salespersonName", "salespersonLocationId", "salespersonLocationCode", "salespersonLocationName",
    "collectedById", "collectedAt", "reviewStatus", "verifiedAt", "reviewedById", "reviewedAt",
    "receiptPhotoKey", "receiptPhotoType", "evidenceUploadedAt", "createdAt", "updatedAt"
)
SELECT
    'pay_' || replace(gen_random_uuid()::text, '-', ''),
    'PAY-' || gen_random_uuid()::text,
    CASE WHEN s."orderId" IS NULL THEN 'DIRECT_SALE'::"PaymentKind" ELSE 'ORDER_FINAL'::"PaymentKind" END,
    CASE WHEN s."status" = 'VOIDED' THEN 'VOIDED'::"PaymentStatus" ELSE 'ACTIVE'::"PaymentStatus" END,
    s."locationId", s."customerId", s."orderId", s."id",
    s."amountPaid", s."paymentMethod", s."receiptBooklet", s."manualReceiptNumber",
    s."salespersonId", s."salespersonName", s."salespersonLocationId", s."salespersonLocationCode", s."salespersonLocationName",
    s."postedById", s."postedAt",
    COALESCE(r."status", 'UNVERIFIED'::"AccountingReviewStatus"), r."verifiedAt", r."reviewedById", r."reviewedAt",
    r."receiptPhotoKey", r."receiptPhotoType", r."evidenceUploadedAt", s."createdAt", s."updatedAt"
FROM "Sale" s
LEFT JOIN "SaleAccountingReview" r ON r."saleId" = s."id";

-- Backfill: one Payment row per order that collected money before release.
-- "downpaymentAmount" is the running pre-release total, so a single row carries it.
-- A completed order's pre-release money was already inside a verified sale total, so
-- it is backfilled as verified on that sale's verification date: report totals for
-- history stay exactly what they were before this migration. Money collected on an
-- order that is still open or was cancelled is left UNVERIFIED and shows up in the
-- accounting queue for a real review.
INSERT INTO "Payment" (
    "id", "reference", "kind", "status", "locationId", "customerId", "orderId",
    "amount", "method", "receiptBooklet", "receiptNumber", "notes",
    "salespersonId", "salespersonName", "salespersonLocationId", "salespersonLocationCode", "salespersonLocationName",
    "collectedById", "collectedAt", "reviewStatus", "verifiedAt", "createdAt", "updatedAt"
)
SELECT
    'pay_' || replace(gen_random_uuid()::text, '-', ''),
    'PAY-' || gen_random_uuid()::text,
    'ORDER_DOWNPAYMENT'::"PaymentKind",
    'ACTIVE'::"PaymentStatus",
    o."locationId", o."customerId", o."id",
    o."downpaymentAmount",
    COALESCE(s."paymentMethod", 'CASH'::"PaymentMethod"),
    '',
    COALESCE(o."downpaymentReceiptNumber", 'LEGACY-' || o."reference"),
    CASE WHEN o."downpaymentReceiptNumber" IS NULL THEN 'Receipt number was not recorded before the payment ledger existed.' ELSE NULL END,
    o."salespersonId", o."salespersonName", o."salespersonLocationId", o."salespersonLocationCode", o."salespersonLocationName",
    o."createdById", o."createdAt",
    CASE WHEN o."status" = 'COMPLETED' AND r."verifiedAt" IS NOT NULL THEN 'VERIFIED'::"AccountingReviewStatus" ELSE 'UNVERIFIED'::"AccountingReviewStatus" END,
    CASE WHEN o."status" = 'COMPLETED' THEN r."verifiedAt" ELSE NULL END,
    o."createdAt", o."updatedAt"
FROM "CustomerOrder" o
LEFT JOIN "Sale" s ON s."orderId" = o."id"
LEFT JOIN "SaleAccountingReview" r ON r."saleId" = s."id"
WHERE o."downpaymentAmount" > 0;
