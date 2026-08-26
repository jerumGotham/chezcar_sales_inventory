# ADR 0009: Customer Orders and Manual-Receipt Sales

**Status:** Accepted
**Date:** 2026-08-26

## Context

Chezcar branches still issue handwritten/manual receipts. The internal system must reflect real sales activity after branch staff writes the receipt, not replace the receipt process yet. Some customers buy immediately in-store, while others order through Messenger, Facebook, or messages and may reserve stock with or without downpayment.

The next production backend phase starts with customer records and customer orders because reservations, downpayments, release, cancellation, inventory reservation, and later Accounting verification depend on this workflow.

## Decision

1. Support both direct walk-in sales and customer orders. Direct walk-in sales may use a Guest customer; customer orders require customer identity.
2. Customer orders support three order types:
   - reserved without downpayment;
   - reserved with downpayment;
   - waiting stock / special order.
3. Inquiry-only leads are out of scope for now.
4. If stock is available at the assigned branch, creating a reservation immediately increments `InventoryBalance.reserved`; `onHand` remains unchanged.
5. No automatic reservation expiry is implemented. Staff/Admin must complete or cancel reservations manually. Open and aged reservations must be visible in lists/dashboards.
6. Downpayment capture stores amount plus globally unique manual receipt number. A full multi-payment ledger is deferred.
7. Final release stores final manual receipt number plus remaining balance collected. The server derives and validates the expected balance from order total minus downpayment.
8. Manual receipt numbers are globally unique across downpayment and final sale receipts.
9. Customer order statuses are exactly:
   - `RESERVED`
   - `WAITING_STOCK`
   - `READY_FOR_RELEASE`
   - `COMPLETED`
   - `CANCELLED`
10. No partial release and no automatic expired status for the first production implementation.
11. Accounting Staff can verify or flag transactions but cannot edit sales, orders, payments, or stock. Accounting correction is a later Admin/Branch correction workflow.
12. Sale/order lines snapshot product current price and allow discount/override. Historical posted lines do not change when product prices change.
13. Stock deduction timing:
   - direct sale deducts `onHand` immediately;
   - order creation only reserves stock;
   - final order release decrements `onHand`, decrements `reserved`, and records completion;
   - cancellation decrements `reserved` if stock was reserved.
14. Branch Staff can cancel no-DP orders for their own branch. Admin can cancel no-DP orders anywhere.
15. Orders with downpayment can be cancelled by Admin only and require a refund/cancellation note. Refund cash ledger is deferred.
16. Build Customer + Order backend first, then direct sales/POS posting and Accounting verification on top of the same receipt and inventory rules.

## Consequences

### Positive

- Reservations are operationally meaningful because they reduce available stock.
- Manual receipts remain the customer-facing source while the app gains internal tracking.
- Downpayment handling is simple but still searchable by receipt number.
- Accounting can reconcile without gaining mutation authority.
- Stock movement timing matches physical reality: reserved stock is still on hand until release.

### Negative

- No automatic expiry means stale reservations require dashboard/list visibility and manual discipline.
- Global receipt uniqueness is strict and may need Admin correction if branches use overlapping receipt booklets.
- No partial release means multi-stage fulfillment must wait or be split into separate orders.
- DP cancellation lacks a full refund ledger until payments are modeled more completely.

## Rejected Alternatives

- **Inquiry-only records now:** adds CRM scope before core sales/order posting is reliable.
- **Reserve only with downpayment:** lets no-DP reservations oversell and makes the reservation status misleading.
- **Deduct stock on order creation:** physical stock is still at the branch and should remain on hand until release.
- **Branch cancellation of DP orders:** money/refund handling needs Admin authority in the first implementation.
- **Full payment ledger immediately:** useful later, but too large for the first customer-order backend slice.
