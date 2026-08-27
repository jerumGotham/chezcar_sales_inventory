CREATE TYPE "BranchMismatchResponse" AS ENUM (
  'ORIGINAL_ENCODING_CORRECT',
  'RECEIPT_CORRECTION_NEEDED'
);

ALTER TABLE "SaleAccountingReview"
  ADD COLUMN "branchResponse" "BranchMismatchResponse",
  ADD COLUMN "branchResponseNote" TEXT,
  ADD COLUMN "branchReplacementReceiptNumber" TEXT,
  ADD COLUMN "branchRespondedById" TEXT,
  ADD COLUMN "branchRespondedAt" TIMESTAMP(3);

CREATE INDEX "SaleAccountingReview_branchRespondedById_idx"
  ON "SaleAccountingReview"("branchRespondedById");

ALTER TABLE "SaleAccountingReview"
  ADD CONSTRAINT "SaleAccountingReview_branchRespondedById_fkey"
  FOREIGN KEY ("branchRespondedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
