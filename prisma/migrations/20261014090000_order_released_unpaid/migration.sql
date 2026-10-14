-- An order whose goods have left the branch while money is still owed.
-- COMPLETED used to mean both "released" and "settled", which left nowhere to
-- record a release on credit. Additive: no existing row changes status.
ALTER TYPE "CustomerOrderStatus" ADD VALUE IF NOT EXISTS 'RELEASED_UNPAID';
