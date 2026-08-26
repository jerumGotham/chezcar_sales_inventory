# Inventory Production Spec

**Status:** Accepted scope for inventory balance/correction phase
**Last updated:** 2026-08-26
**Source:** Grill-with-docs inventory decisions; ADR 0011

## Purpose

Make inventory reliable for production by preserving business-workflow stock movements, exposing reservation-aware balances, adding Admin-only correction, and generating low-stock notifications from available stock.

## In Scope

- Role-scoped inventory balance views with `onHand`, `reserved`, and `available`.
- Admin all-location inventory visibility.
- Branch Staff assigned-branch current balances.
- Stock Staff `SR` and transfer-relevant branch inventory visibility.
- Operational stock status labels.
- Admin full stock card/history.
- Stock Staff limited stock card/history for `SR`, receiving, and transfers.
- Admin-only manual inventory correction.
- Low available / out-of-stock notifications based on available quantity.
- Admin-only reorder level editing.
- Admin-only CSV export.

## Out Of Scope

- Branch Staff stock card/history.
- Branch Staff or Stock Staff arbitrary manual corrections.
- Automatic reorder purchase orders.
- Damaged/return physical locations.
- General inventory cycle-count workflow.
- Accounting inventory screens outside sale/order reconciliation.

## Balance Definitions

- `onHand`: physical stock recorded at a location.
- `reserved`: stock held for customer orders and unavailable for new sale.
- `available`: `onHand - reserved`.
- In-transit transfer stock is accountable but not sellable at source or destination.

## Status Labels

| Status | Rule |
| --- | --- |
| Available | Active product with available quantity above reorder level. |
| Low Available | Active product with available quantity greater than zero and at/below reorder level. |
| Fully Reserved | Active product with `onHand > 0` and `available = 0` because reservations consume stock. |
| Out of Stock | Active product with no available stock. |
| Inactive With Stock | Inactive product with `onHand > 0` or `reserved > 0`. |
| In Transit | Incoming transfer quantity exists for the product/location context. |

## Manual Correction Rules

1. Admin selects product, location, quantity delta, and required reason/note.
2. Positive delta increases `onHand`.
3. Negative delta decreases `onHand`.
4. Negative delta is blocked if resulting `onHand < reserved`.
5. Correction writes an inventory movement and updates balance in the same transaction.
6. Branch Staff and Stock Staff cannot create manual corrections.
7. Correction notifies affected staff based on corrected location.

## Low-Stock Notification Rules

1. Low-stock state uses `available`, not `onHand`.
2. Notify when product/location crosses into `Low Available`.
3. Notify when product/location crosses into `Out of Stock`.
4. Do not create separate notifications for `Fully Reserved` in the first implementation.
5. Reorder-level changes can trigger low/out notifications only when the product/location crosses into low/out under the new threshold.
6. Avoid duplicate spam by tracking the previous alert state.

## Stock Card Access

| Actor | Stock card access |
| --- | --- |
| Admin | Full movement history for all products and locations. |
| Stock Staff | `SR` stock card plus receiving/transfer-related movements. |
| Branch Staff | No stock card/history in first implementation. Current assigned-branch balances only. |
| Accounting Staff | Movement visibility only through later sale/order reconciliation. |

## Filters

- Item code/name search.
- Category.
- Brand.
- Product status: active, inactive, all.
- Stock status.
- Role-scoped location selector/filter.

## CSV Export

- Admin-only.
- Exports current filtered balance rows.
- Includes product identity, category, brand, status, location, `onHand`, `reserved`, `available`, reorder level, and stock status.

## Acceptance Criteria

1. All inventory views calculate and display `onHand`, `reserved`, and `available` for authorized scopes.
2. Branch Staff cannot view other branch balances.
3. Branch Staff cannot access stock card/history.
4. Admin can view stock card/history across all locations.
5. Stock Staff sees only allowed `SR` and transfer/receiving history.
6. Admin correction requires reason/note and creates movement plus balance update atomically.
7. Negative correction that would make `onHand < reserved` is rejected.
8. Low/out notifications are created only on status crossing.
9. Reorder level editing is Admin-only.
10. CSV export is Admin-only and respects current filters.
