ALTER TABLE "SaleAccountingReview"
  ADD COLUMN "evidencePendingNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "evidenceReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "evidenceUploadedAt" TIMESTAMP(3);

CREATE INDEX "SaleAccountingReview_evidenceReminderSentAt_receiptPhotoKey_idx"
  ON "SaleAccountingReview"("evidenceReminderSentAt", "receiptPhotoKey");
