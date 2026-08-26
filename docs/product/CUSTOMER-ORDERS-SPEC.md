# Customer Orders Production Spec

**Status:** Accepted scope for next backend phase
**Last updated:** 2026-08-26
**Source:** Grill-with-docs customer sales/order decisions; ADR 0009

## Purpose

Implement the production backend foundation for customer records and customer orders before direct POS sales and Accounting verification are built. The system records internal sales/order facts after Branch Staff writes the manual receipt or receives an order through walk-in, Messenger, Facebook, or messages.

## In Scope

- Customer records required for customer orders.
- Guest customer support for direct walk-in sales later.
- Customer order creation for:
  - reserved without downpayment;
  - reserved with downpayment;
  - waiting stock / special order.
- Immediate stock reservation when branch stock is available.
- Downpayment amount plus globally unique manual receipt number.
- Final release with final manual receipt number and remaining balance.
- Cancellation rules for no-DP and DP orders.
- Inventory reservation/release updates in server transactions.
- Durable audit fields for actor and timestamps.

## Out of Scope

- Inquiry-only CRM/leads.
- Direct POS sale posting in this phase.
- Accounting verify/flag UI in this phase, except fields should not block later reconciliation.
- Partial release.
- Automatic reservation expiry.
- Full multi-payment/refund ledger.
- Customer-facing order portal or receipt printing.

## Actors And Authorization

| Actor | Allowed actions |
| --- | --- |
| Branch Staff | Create customer orders for assigned branch; reserve available assigned-branch stock; release own-branch ready orders; cancel own-branch no-DP orders. |
| Admin | View all orders; cancel any no-DP order; cancel DP orders with refund/cancellation note; perform future corrections. |
| Accounting Staff | Later: view, verify, and flag transactions only. No edit authority. |
| Stock Staff | No customer-order mutation authority in this phase. |

## Required Domain Records

### Customer

- `id`
- `name` required
- `mobile` optional but recommended
- optional channel/source note, e.g. walk-in, Messenger, Facebook
- status/active flag if needed
- timestamps

### Customer Order

- `id`
- human-readable reference
- branch/location
- customer
- status: `RESERVED`, `WAITING_STOCK`, `READY_FOR_RELEASE`, `COMPLETED`, `CANCELLED`
- order type: no-DP reservation, DP reservation, waiting stock/special order
- lines with product snapshot, quantity, base unit price, final unit price, discount/override amount
- optional downpayment amount
- optional downpayment manual receipt number
- optional final manual receipt number
- expected remaining balance
- cancellation/refund note for Admin DP cancellation
- created/released/cancelled actor and timestamps

### Manual Receipt Registry

Manual receipt numbers are globally unique. The implementation can enforce this through unique nullable fields on order/payment records or a separate receipt registry table. Use the simpler approach only if it still prevents duplicate DP and final receipt numbers across all branches.

## Inventory Rules

1. Reservation creation with available branch stock:
   - validate `onHand - reserved >= quantity`;
   - increment `reserved`;
   - leave `onHand` unchanged.
2. Waiting-stock order creation:
   - do not reserve inventory;
   - status starts as `WAITING_STOCK`.
3. Final release/completion:
   - validate final receipt number is globally unique;
   - validate remaining balance equals order total minus downpayment;
   - decrement `onHand`;
   - decrement `reserved` if previously reserved;
   - create inventory movement records;
   - mark order `COMPLETED`.
4. Cancellation:
   - release reserved stock if reserved;
   - no-DP cancellation allowed to assigned Branch Staff or Admin;
   - DP cancellation is Admin-only and requires refund/cancellation note.

## UI Requirements

- Customer order create form must clearly separate:
  - reserved without DP;
  - reserved with DP;
  - waiting stock/special order.
- For DP orders, DP amount and manual receipt number are required.
- Show available stock and reserved impact before creating a reservation.
- Order list must expose aged/open reservations because there is no auto-expiry.
- Release action must show total, DP, expected remaining balance, and require final receipt number.
- Cancel action must explain whether stock reservation will be released.
- DP cancellation must be Admin-only and require a refund/cancellation note.

## Acceptance Criteria

1. Branch Staff cannot create, view, release, or cancel orders outside their assigned branch.
2. Customer order creation requires customer identity.
3. No-DP and DP reservations increment `reserved` when available stock exists.
4. Waiting-stock orders do not reserve stock.
5. Duplicate manual receipt numbers are rejected globally for DP and final receipts.
6. Release deducts `onHand`, clears reservation, records final receipt and balance, and marks completed in one transaction.
7. Cancellation releases reservation in one transaction.
8. Branch Staff cannot cancel DP orders; Admin can with required note.
9. Accounting Staff cannot mutate customer orders.
10. Audit fields preserve actor and timestamp for create, release, and cancellation.
