# ADR 0010: Product Master Management

**Status:** Accepted
**Date:** 2026-08-26

## Context

Products are already persisted and used by inventory, Stock Room receiving, transfers, and future customer orders/sales. Product master data must be controlled enough for production use without adding a full catalog governance system before sales/order workflows are ready.

## Decision

1. Admin can manage product basics plus current selling price: item code, name, category, brand, description, current selling price, and active/inactive status.
2. Do not add `ProductPriceVersion` yet. Sales/order lines must snapshot base and final prices at transaction time.
3. Only Admin can create, edit, deactivate, reactivate, or delete products.
4. Stock Staff can view active and inactive products but cannot mutate master data.
5. `itemCode` is hard-unique and is the product identity. Similar product names are allowed; similarity warnings are deferred.
6. `itemCode` can be edited only while the product has no operational usage.
7. Admin can deactivate a product even if it has on-hand or reserved stock. Deactivation blocks new use but does not hide or erase stock.
8. Existing reserved orders for a deactivated product can still be completed or cancelled.
9. Reactivation requires a valid current price greater than zero.
10. Active products require current price greater than zero. Inactive products may have null price.
11. Hard delete is allowed only when the product has never been used and has no inventory balance rows.
12. Product edits do not create workflow notifications.
13. Product audit for the first production implementation uses actor fields, not a full old/new change log.
14. Product list filters must include item code/name search, category, brand, active/inactive status, and stock status.
15. Category and brand remain free-text fields, with filter options derived from existing products.

## Consequences

### Positive

- Master-data mutation authority is clear and centralized under Admin.
- Stock Staff can still see inactive-with-stock items for operational context.
- Product deletion is safe because any operational presence blocks hard delete.
- Current-price editing is simple while sale/order price snapshots protect historical transactions.

### Negative

- Price-change history is not available until a later price-version model or audit log is added.
- Free-text category/brand values can drift without normalization.
- Deactivated products with stock require separate inventory follow-up and visibility.

## Rejected Alternatives

- **Let Stock Staff edit products:** creates master-data/pricing risk from operational receiving work.
- **Require stock zero before deactivation:** prevents stopping future sale/use of discontinued or problematic products.
- **Hard delete used products:** breaks audit and historical references.
- **Full product change audit immediately:** desirable later but larger than needed for first production catalog management.
