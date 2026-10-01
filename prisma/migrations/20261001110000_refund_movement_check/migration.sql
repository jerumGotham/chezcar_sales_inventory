-- InventoryMovement_source_check pairs each movement type with the source record
-- it must carry. A refund return and a quarantine release have no transfer,
-- receipt, backjob, warranty or claim behind them, so they belong with the other
-- standalone types; without this they are rejected at write time.
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_source_check";

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_source_check" CHECK (
  (
    type = ANY (ARRAY[
      'MANUAL_ADJUSTMENT'::"InventoryMovementType",
      'CUSTOMER_ORDER_RELEASE'::"InventoryMovementType",
      'DIRECT_SALE'::"InventoryMovementType",
      'SALE_CORRECTION_REVERSAL'::"InventoryMovementType",
      'SALE_CORRECTION'::"InventoryMovementType",
      'SALE_REFUND_RETURN'::"InventoryMovementType",
      'SALE_REFUND_QUARANTINE'::"InventoryMovementType",
      'QUARANTINE_RELEASE'::"InventoryMovementType"
    ])
    AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL
    AND "warrantyId" IS NULL AND "supplierClaimId" IS NULL
  )
  OR ("transferId" IS NOT NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL AND "supplierClaimId" IS NULL)
  OR ("transferId" IS NULL AND "receiptId" IS NOT NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL AND "supplierClaimId" IS NULL)
  OR (
    type = ANY (ARRAY['BACKJOB_PART_ISSUE'::"InventoryMovementType", 'BACKJOB_PART_RETURN'::"InventoryMovementType"])
    AND "backjobPartId" IS NOT NULL AND "transferId" IS NULL AND "receiptId" IS NULL AND "warrantyId" IS NULL AND "supplierClaimId" IS NULL
  )
  OR (
    type = ANY (ARRAY['WARRANTY_RECEIPT'::"InventoryMovementType", 'WARRANTY_RELEASE'::"InventoryMovementType"])
    AND "warrantyId" IS NOT NULL AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "supplierClaimId" IS NULL
  )
  OR (
    type = ANY (ARRAY[
      'SUPPLIER_CLAIM_RETURN'::"InventoryMovementType",
      'SUPPLIER_CLAIM_REPAIR_SEND'::"InventoryMovementType",
      'SUPPLIER_CLAIM_REPLACEMENT_RECEIPT'::"InventoryMovementType",
      'SUPPLIER_CLAIM_REPAIRED_RECEIPT'::"InventoryMovementType",
      'SUPPLIER_CLAIM_WRITEOFF'::"InventoryMovementType"
    ])
    AND "supplierClaimId" IS NOT NULL AND "transferId" IS NULL AND "receiptId" IS NULL AND "backjobPartId" IS NULL AND "warrantyId" IS NULL
  )
);
