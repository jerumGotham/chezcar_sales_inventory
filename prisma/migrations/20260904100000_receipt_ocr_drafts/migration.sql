ALTER TABLE "SaleAccountingReview"
  ADD COLUMN "receiptOcrStatus" TEXT,
  ADD COLUMN "receiptOcrJson" TEXT,
  ADD COLUMN "receiptOcrError" TEXT,
  ADD COLUMN "receiptOcrAt" TIMESTAMP(3);

ALTER TABLE "SaleAccountingReview"
  ADD CONSTRAINT "SaleAccountingReview_receiptOcrStatus_check"
  CHECK ("receiptOcrStatus" IS NULL OR "receiptOcrStatus" IN ('PENDING', 'COMPLETE', 'FAILED'));
