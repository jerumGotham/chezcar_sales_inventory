# Product Management Production Spec

**Status:** Accepted scope for product master-data phase
**Last updated:** 2026-08-26
**Source:** Grill-with-docs product decisions; ADR 0010

## Purpose

Implement production-safe product master-data management for Admin while keeping Stock Staff product visibility intact for receiving, transfers, and inactive-with-stock follow-up.

## In Scope

- Admin create/edit/deactivate/reactivate/delete product actions.
- Product current price management without price-version history.
- Item-code uniqueness and edit locking after usage.
- Active/inactive status rules.
- Stock Staff read-only visibility of active and inactive products.
- Product list filters for search, category, brand, status, and stock status.
- Actor fields for product create/update/deactivate/reactivate.

## Out Of Scope

- Product price-version history.
- Full old/new product change audit log.
- Category and brand CRUD.
- Similar-product duplicate blocking.
- Product edit notifications.
- Hard delete of any product with inventory balances or usage.

## Product Rules

1. `itemCode` is required and globally unique.
2. `name` is required.
3. `price` is required and greater than zero for active products.
4. Inactive products may have null price.
5. `category` and `brand` are free-text optional fields.
6. `itemCode` becomes locked after any usage exists, including inventory balance, movement, receipt line, transfer line, customer order line, or sale line.
7. Active products are selectable for new receiving, transfer, customer order, and sale flows.
8. Inactive products are not selectable for new business flows.
9. Inactive products remain visible in inventory/product lists and history.
10. Existing reserved customer orders for a deactivated product may still be completed or cancelled.
11. Reactivation requires valid price greater than zero.
12. Hard delete is allowed only if the product has no inventory balance rows and no usage/history.

## Authorization

| Actor | Product access |
| --- | --- |
| Admin | Create, edit, deactivate, reactivate, delete, view all. |
| Stock Staff | View active and inactive products. No mutation. |
| Branch Staff | Product visibility only through assigned-branch inventory/order/sale flows. No master-data mutation. |
| Accounting Staff | Product visibility only through sales/order reconciliation. No master-data mutation. |

## List Filters

- Item code/name search.
- Category dropdown derived from existing product values.
- Brand dropdown derived from existing product values.
- Status: all, active, inactive.
- Stock status: has stock, no stock, inactive with stock.

## Required UI Behavior

- Deactivation with on-hand/reserved stock shows a warning that product remains visible but cannot be newly selected.
- Reactivation is blocked until price is present and greater than zero.
- Item-code input is disabled or blocked when usage exists.
- Delete action appears only when product is unused and has no inventory balances.
- Stock Staff product list clearly marks inactive products and inactive-with-stock products.

## Acceptance Criteria

1. Non-Admin users cannot create/edit/deactivate/reactivate/delete products through UI or API.
2. Active product save fails without price greater than zero.
3. Reactivation fails without price greater than zero.
4. Duplicate item code is rejected.
5. Item code cannot change after product usage exists.
6. Product with any inventory balance row cannot be deleted.
7. Product with any usage/history cannot be deleted.
8. Deactivated product remains visible but cannot be selected for new receiving/transfers/orders/sales.
9. Product list supports required filters.
10. Product mutation responses include updated actor/timestamp fields for accountability.
