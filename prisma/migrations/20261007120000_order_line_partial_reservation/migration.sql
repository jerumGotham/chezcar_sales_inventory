-- A waiting-stock order can now hold the units the branch has while it waits
-- for the rest, so each line records how much of it is held.
ALTER TABLE "CustomerOrderLine" ADD COLUMN "reservedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Orders already reserved hold every unit of every line. Waiting, released and
-- cancelled orders hold none, which is already true of InventoryBalance.reserved.
UPDATE "CustomerOrderLine" AS line
SET "reservedQuantity" = line."quantity"
FROM "CustomerOrder" AS o
WHERE o."id" = line."orderId"
  AND o."status" IN ('RESERVED', 'READY_FOR_RELEASE');

ALTER TABLE "CustomerOrderLine"
  ADD CONSTRAINT "CustomerOrderLine_reservedQuantity_range"
  CHECK ("reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity");
