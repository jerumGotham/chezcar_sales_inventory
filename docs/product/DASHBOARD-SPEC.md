# Role-Specific Dashboard Production Spec

**Status:** Accepted scope for dashboard production phase
**Last updated:** 2026-08-26
**Source:** Grill-with-docs dashboard decisions; ADR 0012

## Purpose

Replace prototype dashboard fixtures with role-specific operational dashboards backed by persisted sales, order, inventory, transfer, notification, and Accounting data.

## Global Rules

- Dashboard data polls every 30 seconds and refetches on window focus.
- Dashboard rows/cards link to the relevant workflow record or filtered page.
- Dashboard has no export/print behavior.
- Each dashboard includes unread notification preview and a link to the full Notifications page.
- Cards/tables are primary. Admin may include simple sales trend and branch performance charts.
- No profit or margin metrics until cost data is production-clean.

## Admin Dashboard

### KPIs

- Today total sales.
- Today transaction count.
- Today sales by branch.
- Month-to-date total sales.
- Month-to-date sales by branch.

### Exceptions

- Low available stock.
- Out of stock.
- Inactive with stock.
- Open transfer discrepancies.
- Pending Admin approvals.
- Aged reservations/orders.
- Future Accounting flagged mismatches.

### Charts

- Simple sales trend chart from persisted sales/order data.
- Simple branch performance chart from persisted sales/order data.

## Stock Staff Dashboard

- SR stock summary.
- Supplier receipts today/recent.
- Transfer drafts.
- Transfers for dispatch.
- In-transit transfers.
- Discrepancies needing investigation.
- Low/out stock across SR and branches.
- Unread notification preview.

## Branch Staff Dashboard

- Today assigned-branch sales.
- Today assigned-branch transaction count.
- Assigned-branch available stock summary.
- Low/out assigned-branch stock.
- Incoming transfers.
- Open orders/reservations.
- Ready-for-release orders.
- Unread notification preview.

## Accounting Dashboard

- Unverified transaction count.
- Verified today count.
- Flagged mismatch count/list.
- Sales by branch/date.
- Unread notification preview.

## Aged Order Rule

An order is aged when it is more than 7 days old and still in one of these statuses:

- `RESERVED`
- `WAITING_STOCK`
- `READY_FOR_RELEASE`

Aged orders are not auto-cancelled. They are dashboard attention items for manual follow-up.

## Deep Links

- Low/out stock links to Inventory with product/location/status filters.
- Transfer discrepancy or approval links to `/stock-transfers?transferId=...`.
- Aged order links to `/customer-orders?orderId=...`.
- Future Accounting mismatch links to the Accounting reconciliation record.

## Acceptance Criteria

1. Admin, Stock Staff, Branch Staff, and Accounting Staff see different dashboard content appropriate to their role.
2. Branch Staff dashboard never exposes another branch's sales, stock, orders, or transfers.
3. Dashboard data uses persisted sources once the corresponding workflow exists; fixture metrics must be removed as production sources are implemented.
4. Dashboard refreshes automatically by polling and on focus.
5. Unread notification preview uses persisted notifications.
6. All exception rows link to actionable records or filtered pages.
7. Admin sales KPIs show Today and Month-to-Date only for the first production pass.
8. No profit/margin metrics are displayed.
9. Dashboard export is absent; export lives in dedicated report/inventory/accounting surfaces.
