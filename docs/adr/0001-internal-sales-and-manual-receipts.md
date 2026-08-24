# ADR 0001: Internal Sales Entry with Manual Receipts

**Status:** Proposed for stakeholder confirmation
**Date:** 2026-08-24

## Context

Chezcar will continue issuing handwritten receipts to customers. The new system is intended for internal sales and inventory monitoring rather than customer-facing invoicing. The owner needs daily branch sales visibility, and every encoded sale must reduce the corresponding branch stock.

Allowing sales to remain only on paper would preserve the current visibility problem. Allowing posted sales to be freely edited or deleted would weaken the connection between receipts, sales totals, and stock movements.

## Decision

1. One internal system sale represents one handwritten receipt.
2. Branch Staff records the manual receipt number and sale lines in the system.
3. Posting the sale atomically creates the sale, deducts branch inventory, writes inventory movements, and records the actor/time.
4. Today's Admin dashboard totals are calculated from posted sales.
5. Accounting Staff may verify the sale or report a mismatch but cannot edit it.
6. Posted sales are corrected through explicit void/reversal and replacement actions, never silent edits or hard deletion. Stock is restored automatically only for a cancellation before physical release or an encoding correction that establishes the correct physical quantity. Post-release returns require a separate inspected return movement.
7. The MVP does not print or replace the handwritten official receipt.

## Consequences

### Positive

- Sales and stock remain connected.
- Admin can monitor daily branch sales remotely.
- Manual receipt numbers provide a reconciliation reference.
- Corrections remain traceable.

### Negative

- Branch Staff must reliably encode every receipt.
- Delayed encoding means dashboard sales and stock can temporarily lag physical activity.
- Receipt numbering and correction rules need stakeholder confirmation.

## Deferred Details

- Whether encoding must happen before item release or immediately after writing the receipt
- Receipt-number uniqueness scope
- Payment methods and collection reconciliation depth
- Return/refund behavior beyond basic void/reversal

## Rejected Alternatives

- **End-of-day aggregate only:** too weak for item-level stock deduction and receipt reconciliation.
- **Accounting edits sales directly:** removes separation between validation and correction.
- **Hard-delete incorrect sales:** destroys auditability and can leave unexplained stock movements.
