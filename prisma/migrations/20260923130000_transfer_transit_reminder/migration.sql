-- Spaces the in-transit reminders evenly instead of re-sending on every sweep.
ALTER TABLE "StockTransfer" ADD COLUMN "transitReminderAt" TIMESTAMP(3);

CREATE INDEX "StockTransfer_status_dispatchedAt_idx" ON "StockTransfer"("status", "dispatchedAt");
