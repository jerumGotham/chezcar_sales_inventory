DO $$
DECLARE invalid_balance_count INTEGER;
BEGIN
  SELECT count(*) INTO invalid_balance_count
  FROM "InventoryBalance"
  WHERE "onHand" < 0 OR "reserved" < 0 OR "onHand" - "reserved" < 0;

  IF invalid_balance_count > 0 THEN
    RAISE EXCEPTION 'Cannot add quarantine invariants: % InventoryBalance row(s) have negative or over-reserved stock', invalid_balance_count;
  END IF;
END $$;

ALTER TABLE "InventoryBalance"
ADD COLUMN "quarantined" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "InventoryBalance"
ADD CONSTRAINT "InventoryBalance_onHand_nonnegative" CHECK ("onHand" >= 0),
ADD CONSTRAINT "InventoryBalance_quarantined_nonnegative" CHECK ("quarantined" >= 0),
ADD CONSTRAINT "InventoryBalance_available_nonnegative" CHECK ("onHand" - "reserved" - "quarantined" >= 0);
