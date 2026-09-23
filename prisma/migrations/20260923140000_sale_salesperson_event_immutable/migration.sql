-- A sale's salesperson history is audit evidence, exactly like the customer
-- order one beside it, so it gets the same immutability. The guarded local
-- data reset sets chezcar.operational_data_reset and is let through.
CREATE FUNCTION reject_sale_salesperson_event_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('chezcar.operational_data_reset', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Sale salesperson events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SaleSalespersonEvent_immutable" BEFORE UPDATE OR DELETE ON "SaleSalespersonEvent" FOR EACH ROW EXECUTE FUNCTION reject_sale_salesperson_event_mutation();
