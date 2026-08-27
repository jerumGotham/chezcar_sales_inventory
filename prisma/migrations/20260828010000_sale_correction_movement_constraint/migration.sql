ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_source_check";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_source_check"
  CHECK (
    ("type" IN (
      'MANUAL_ADJUSTMENT',
      'CUSTOMER_ORDER_RELEASE',
      'DIRECT_SALE',
      'SALE_CORRECTION_REVERSAL',
      'SALE_CORRECTION'
    ) AND "transferId" IS NULL AND "receiptId" IS NULL)
    OR ("transferId" IS NOT NULL AND "receiptId" IS NULL)
    OR ("transferId" IS NULL AND "receiptId" IS NOT NULL)
  );
