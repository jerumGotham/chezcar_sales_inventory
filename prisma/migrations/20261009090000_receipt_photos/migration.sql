-- A receipt can need more than one picture. Payments and sales keep their first
-- photo where they always have; the rest, and every stock transfer dispatch
-- photo, live in ReceiptPhoto. Additive: nothing existing moves.

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "dispatchReceiptNumber" TEXT;

-- CreateTable
CREATE TABLE "ReceiptPhoto" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "saleReviewId" TEXT,
    "transferId" TEXT,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptPhoto_key_key" ON "ReceiptPhoto"("key");

-- CreateIndex
CREATE INDEX "ReceiptPhoto_paymentId_idx" ON "ReceiptPhoto"("paymentId");

-- CreateIndex
CREATE INDEX "ReceiptPhoto_saleReviewId_idx" ON "ReceiptPhoto"("saleReviewId");

-- CreateIndex
CREATE INDEX "ReceiptPhoto_transferId_idx" ON "ReceiptPhoto"("transferId");

-- AddForeignKey
ALTER TABLE "ReceiptPhoto" ADD CONSTRAINT "ReceiptPhoto_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptPhoto" ADD CONSTRAINT "ReceiptPhoto_saleReviewId_fkey" FOREIGN KEY ("saleReviewId") REFERENCES "SaleAccountingReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptPhoto" ADD CONSTRAINT "ReceiptPhoto_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptPhoto" ADD CONSTRAINT "ReceiptPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A photo belongs to exactly one receipt: a payment, a sale's review, or a
-- stock transfer's dispatch.
ALTER TABLE "ReceiptPhoto" ADD CONSTRAINT "ReceiptPhoto_single_owner"
  CHECK (num_nonnulls("paymentId", "saleReviewId", "transferId") = 1);
