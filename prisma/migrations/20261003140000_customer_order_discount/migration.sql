-- A customer order takes one discount on the whole order, the way a POS sale
-- already does, instead of a price typed over line by line. Existing orders
-- have none: their lines carry whatever was agreed, and totalAmount already
-- reflects it, so a zero default leaves every stored total exactly as it is.
ALTER TABLE "CustomerOrder" ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
