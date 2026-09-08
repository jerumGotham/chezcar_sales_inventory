ALTER TABLE "CustomerWarranty"
ADD COLUMN "requestHash" TEXT,
ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerWarranty" ADD CONSTRAINT "CustomerWarranty_returned_quantity_check" CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "receivedQuantity");

CREATE TABLE "CustomerOrderSalespersonEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "previousSalespersonId" TEXT,
  "previousSalespersonName" TEXT,
  "previousSalespersonLocationId" TEXT,
  "previousSalespersonLocationCode" TEXT,
  "previousSalespersonLocationName" TEXT,
  "newSalespersonId" TEXT NOT NULL,
  "newSalespersonName" TEXT NOT NULL,
  "newSalespersonLocationId" TEXT NOT NULL,
  "newSalespersonLocationCode" TEXT NOT NULL,
  "newSalespersonLocationName" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerOrderSalespersonEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerOrderSalespersonEvent_orderId_occurredAt_idx" ON "CustomerOrderSalespersonEvent"("orderId", "occurredAt");
CREATE INDEX "InventoryMovement_locationId_occurredAt_idx" ON "InventoryMovement"("locationId", "occurredAt");

-- The prior createdAt addition backfilled legacy rows with its migration time.
-- Keep legacy server-recorded time unknown and default only future inserts.
ALTER TABLE "InventoryMovement" ADD COLUMN "serverRecordedAt" TIMESTAMP(3);
ALTER TABLE "InventoryMovement" ALTER COLUMN "serverRecordedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "CustomerOrderSalespersonEvent" ADD CONSTRAINT "CustomerOrderSalespersonEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerOrderSalespersonEvent" ADD CONSTRAINT "CustomerOrderSalespersonEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_warranty_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('chezcar.operational_data_reset', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Warranty audit records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION reject_customer_order_salesperson_event_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('chezcar.operational_data_reset', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Customer Order salesperson events are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CustomerOrderSalespersonEvent_immutable" BEFORE UPDATE OR DELETE ON "CustomerOrderSalespersonEvent" FOR EACH ROW EXECUTE FUNCTION reject_customer_order_salesperson_event_mutation();
