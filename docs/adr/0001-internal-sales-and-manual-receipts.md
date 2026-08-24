# ADR 0001: Internal Sales Entry with Manual Receipts

**Status:** Accepted
**Date:** 2026-08-24
**Accepted:** 2026-08-25

## Context

Chezcar will continue issuing handwritten receipts to customers. The new system is intended for internal sales and inventory monitoring rather than customer-facing invoicing. The owner needs daily branch sales visibility, and every encoded sale must reduce the corresponding branch stock.

Allowing sales to remain only on paper would preserve the current visibility problem. Allowing posted sales to be freely edited or deleted would weaken the connection between receipts, sales totals, and stock movements.

## Decision

1. One internal system sale represents one handwritten receipt.
2. Branch Staff writes the handwritten receipt, releases the goods, then records the receipt identity and sale lines in the system.
3. Receipt identity is unique by branch, receipt booklet/series, and receipt number. Skipped/cancelled identities are recorded; duplicate or reused identities are blocked.
4. Posting the sale atomically creates the sale, deducts branch inventory, writes inventory movements, and records the actor/time. It never creates negative stock, including during offline synchronization.
5. Today's Admin dashboard totals and branch stock reflect the committed sale immediately without an end-of-day batch.
6. Accounting Staff may verify the complete receipt-linked sale or report a mismatch but cannot edit it.
7. Posted sales are corrected through explicit void/reversal and replacement actions, never silent edits or hard deletion.
8. The MVP does not print or replace the handwritten receipt.

## Consequences

### Positive

- Sales and stock remain connected.
- Admin can monitor daily branch sales remotely.
- Manual receipt numbers provide a reconciliation reference.
- Corrections remain traceable.

### Negative

- Branch Staff must reliably encode every receipt.
- Delayed encoding means dashboard sales and stock can temporarily lag physical activity.
- The dashboard and system stock lag physical activity until Branch Staff successfully posts the released sale.

## Deferred Details

- Formal daily cash/collection closing
- Customer return, exchange, and refund workflow

## Rejected Alternatives

- **End-of-day aggregate only:** too weak for item-level stock deduction and receipt reconciliation.
- **Accounting edits sales directly:** removes separation between validation and correction.
- **Hard-delete incorrect sales:** destroys auditability and can leave unexplained stock movements.
