# ADR 0011: Inventory Balances, Corrections, and Alerts

**Status:** Accepted
**Date:** 2026-08-26

## Context

Chezcar inventory should normally change through real business workflows: supplier receiving into Stock Room, SR-to-branch transfers, branch receipt/discrepancy resolution, customer order release, and direct sales. Branch Staff must not directly adjust stock because stock-changing actions need auditability and central control.

Production inventory also needs a controlled exception path for wrong opening balances, physical-count mismatches not tied to a transfer, damaged/lost/found stock, and other corrections.

## Decision

1. Normal inventory changes happen only through business workflows:
   - supplier receipt into `SR`;
   - stock transfer dispatch from `SR`;
   - branch exact receipt;
   - Admin transfer discrepancy resolution;
   - customer order release and direct sale;
   - Admin-only manual correction.
2. Branch Staff cannot manually adjust stock.
3. Stock Staff can receive supplier stock into `SR` and dispatch transfers from `SR`, but cannot manually adjust arbitrary balances.
4. Admin can post manual inventory corrections with required reason/note.
5. Manual correction writes an inventory movement and updates the balance in one transaction.
6. Negative corrections cannot reduce `onHand` below `reserved`.
7. Inventory views show `onHand`, `reserved`, and `available` where the role is authorized.
8. Admin sees all locations. Branch Staff sees assigned branch. Stock Staff sees `SR` and transfer-relevant branch inventory. Accounting inventory visibility is limited to later sale/order reconciliation needs.
9. Inventory status labels are `Available`, `Low Available`, `Fully Reserved`, `Out of Stock`, `Inactive With Stock`, and `In Transit`.
10. Stock card/history is role-scoped:
   - Admin sees full stock card/history for all products and locations;
   - Stock Staff sees `SR` stock card and transfer/receiving-related movements;
   - Branch Staff sees current assigned-branch balances only;
   - Accounting sees stock movements only through sale/order reconciliation later.
11. Low-stock alerts are based on `available = onHand - reserved`.
12. Persistent low-stock notifications are created only when a product/location crosses into `Low Available` or `Out of Stock`.
13. Reorder level edits are Admin-only.
14. A reorder-level edit creates low/out notifications only if the current stock crosses into a low/out state under the new threshold.
15. Inventory filters must include search, category, brand, product active/inactive status, stock status, and role-scoped location.
16. Admin manual corrections notify affected staff:
   - branch correction notifies Branch Staff assigned to that branch;
   - SR correction notifies Stock Staff assigned to `SR`;
   - Stock Staff may also be notified for replenishment-relevant low/out branch results.
17. Admin-only CSV export is included for inventory balances.

## Consequences

### Positive

- Inventory balances stay tied to auditable business events.
- Branch Staff cannot bypass stock controls.
- Admin has a practical correction path for production data issues.
- Available-stock alerts reflect reservations, not just physical count.
- Role-specific stock card access avoids exposing unnecessary audit detail to branches.

### Negative

- Admin availability is required for manual corrections.
- Low-stock notifications require state-crossing tracking to avoid spam.
- Stock Staff cannot directly fix branch balances even when operationally aware of an issue.
- CSV export must be scoped carefully to Admin only.

## Rejected Alternatives

- **No manual correction:** production data issues would have no controlled fix path.
- **Stock Staff direct arbitrary adjustment:** weakens centralized stock control.
- **Branch Staff adjustment:** violates the requirement that branches cannot directly edit stock.
- **Low-stock based on on-hand:** ignores reservations and can miss sellable-stock shortages.
- **Full stock card for Branch Staff:** adds clutter and exposes broader audit detail before needed.
