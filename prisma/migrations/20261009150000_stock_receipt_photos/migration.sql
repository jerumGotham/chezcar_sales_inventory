-- A supplier delivery receipt can carry up to five photos too, in ReceiptPhoto.
-- Additive: one nullable column, its key and index, and the owner check widened.

-- AlterTable
ALTER TABLE "ReceiptPhoto" ADD COLUMN     "stockReceiptId" TEXT;

-- CreateIndex
CREATE INDEX "ReceiptPhoto_stockReceiptId_idx" ON "ReceiptPhoto"("stockReceiptId");

-- AddForeignKey
ALTER TABLE "ReceiptPhoto" ADD CONSTRAINT "ReceiptPhoto_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Still exactly one owner, now out of four.
ALTER TABLE "ReceiptPhoto" DROP CONSTRAINT "ReceiptPhoto_single_owner";
ALTER TABLE "ReceiptPhoto" ADD CONSTRAINT "ReceiptPhoto_single_owner"
  CHECK (num_nonnulls("paymentId", "saleReviewId", "transferId", "stockReceiptId") = 1);
