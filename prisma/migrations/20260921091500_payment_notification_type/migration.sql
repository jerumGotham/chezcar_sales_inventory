-- A payment receipt mismatch has to reach the branch that issued it, so the
-- notification needs to point at the payment rather than at a sale.
ALTER TYPE "NotificationRelatedType" ADD VALUE IF NOT EXISTS 'PAYMENT';
