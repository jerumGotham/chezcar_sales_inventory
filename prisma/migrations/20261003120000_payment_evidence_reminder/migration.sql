-- A payment receipt with no photo can be chased once from Receipt Verification.
-- Recording when that was done keeps the button from sending the same nudge
-- again every time somebody opens the row.
ALTER TABLE "Payment" ADD COLUMN "evidencePendingNotifiedAt" TIMESTAMP(3);
