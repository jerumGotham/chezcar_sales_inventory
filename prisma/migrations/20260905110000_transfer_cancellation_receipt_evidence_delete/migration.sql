ALTER TYPE "StockTransferStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "InventoryMovementType" ADD VALUE 'TRANSFER_CANCELLATION';

ALTER TABLE "StockTransfer"
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "RoleDefinition"
SET permissions = ARRAY(
  SELECT DISTINCT permission
  FROM unnest(
    permissions ||
    CASE
      WHEN key IN ('admin', 'stock-staff') AND NOT ('stock-transfers:cancel' = ANY(permissions))
      THEN ARRAY['stock-transfers:cancel']::TEXT[]
      ELSE ARRAY[]::TEXT[]
    END ||
    CASE
      WHEN key IN ('admin', 'branch-staff', 'accounting-staff') AND NOT ('sales:evidence:delete' = ANY(permissions))
      THEN ARRAY['sales:evidence:delete']::TEXT[]
      ELSE ARRAY[]::TEXT[]
    END
  ) AS permission
),
version = version + 1,
"updatedAt" = CURRENT_TIMESTAMP
WHERE key IN ('admin', 'stock-staff', 'branch-staff', 'accounting-staff');
