UPDATE "SaleAccountingReview" AS review
SET
  status = 'UNVERIFIED',
  "reviewedById" = NULL,
  "reviewedAt" = NULL,
  "comparisonJson" = NULL,
  "mismatchCategory" = NULL,
  notes = NULL
FROM "Sale" AS sale
WHERE review."saleId" = sale.id
  AND sale."correctionOfId" IS NOT NULL
  AND sale.status = 'POSTED'
  AND review.status = 'VERIFIED'
  AND review."receiptPhotoKey" IS NULL;
