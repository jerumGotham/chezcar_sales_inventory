-- An order amended before release can leave the customer having paid more than
-- the new total. The money goes back through the same ledger as any other
-- refund, and needs its own kind: the order was neither cancelled nor released,
-- so neither existing value describes it.
ALTER TYPE "RefundKind" ADD VALUE IF NOT EXISTS 'AMENDED_ORDER';
