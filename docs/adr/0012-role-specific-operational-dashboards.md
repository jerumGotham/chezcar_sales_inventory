# ADR 0012: Role-Specific Operational Dashboards

**Status:** Accepted
**Date:** 2026-08-26

## Context

The dashboard must move from prototype fixtures toward production monitoring. Each fixed role has different urgent work: Admin needs company performance and exceptions, Stock Staff needs Stock Room/replenishment queues, Branch Staff needs assigned-branch sales/orders/incoming stock, and Accounting needs reconciliation queues.

Dashboard data must be accurate and actionable before advanced analytics are added.

## Decision

1. Build role-specific dashboards rather than one generic dashboard.
2. Use polling now, with a 30-second target interval and refetch on window focus. SSE/realtime can be added later.
3. Admin dashboard is a mixed executive overview: sales KPIs plus operational exceptions.
4. Admin sales KPIs default to Today and Month-to-Date.
5. Admin exceptions include low available stock, out of stock, inactive with stock, open discrepancies, pending Admin approvals, aged reservations/orders, and future Accounting flagged mismatches.
6. Aged reservation/order means `RESERVED`, `WAITING_STOCK`, or `READY_FOR_RELEASE` for more than 7 days.
7. Do not show profit or margin yet.
8. Low-stock dashboard rows link to filtered inventory/location detail.
9. Pending approval, discrepancy, aged order, and Accounting mismatch rows deep-link to their workflow records.
10. Dashboard has no export. Dedicated reports/inventory/accounting screens own export behavior.
11. Dashboards include an unread notification preview for all roles.
12. Dashboards prioritize cards/tables first. Admin may include simple sales trend and branch performance charts from real persisted sales/order data.
13. Branch Staff dashboard shows mixed branch operations: today branch sales, transaction count, available stock summary, low/out assigned-branch stock, incoming transfers, open orders/reservations, ready-for-release orders, and unread notifications.
14. Stock Staff dashboard shows mixed Stock Room and replenishment operations: SR stock summary, supplier receipts today/recent, transfer drafts, dispatch queue, in-transit transfers, discrepancies needing investigation, low/out stock across locations, and unread notifications.
15. Accounting dashboard shows mixed reconciliation: unverified count, verified today, flagged mismatches, sales by branch/date, and unread notifications.

## Consequences

### Positive

- Each role sees its actionable work immediately.
- Admin gets both performance and exception monitoring without switching pages.
- Polling gives production-usable freshness before SSE/realtime is implemented.
- Deep links connect dashboard exceptions to the records users must act on.

### Negative

- Dashboard implementation depends on customer orders, sales, inventory alerts, and Accounting verification becoming durable.
- Polling is less efficient than SSE but simpler and reliable for the first production pass.
- Charts are limited until persisted sales/order data exists.

## Rejected Alternatives

- **Admin-only dashboard:** leaves operational roles without focused home screens.
- **Same dashboard filtered by role:** makes each role's priorities less clear.
- **Profit/margin now:** cost data is not reliable enough for production dashboard claims.
- **Dashboard export:** exports belong in dedicated report/inventory/accounting surfaces.
