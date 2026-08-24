# ADR 0003: Accounting Reports Mismatches; Admin Corrects Sales

**Status:** Accepted
**Date:** 2026-08-24
**Accepted:** 2026-08-25

## Context

Accounting Staff needs to compare system sales with handwritten receipts. Giving Accounting direct edit access would make it difficult to distinguish the original branch entry from the accounting review and could silently alter stock. Actual cash/collection reconciliation is deferred until payment and daily-closing requirements are confirmed.

## Decision

1. Accounting Staff receives read access to sales and reconciliation information.
2. In the MVP, Accounting compares each sale's receipt identity, items, quantities, prices, discounts, payment, and total with the corresponding handwritten receipt.
3. Accounting may mark an individual sale as verified or create a reconciliation issue.
4. A reconciliation issue records the mismatch type, expected value, actual value, notes, reporter, and time.
5. Accounting cannot edit, delete, void, or replace a sale and cannot adjust inventory.
6. Admin reviews the issue and resolves it by confirming the original, voiding/reversing and replacing the sale, or posting another explicit correction.
7. The resolution links back to the issue and preserves all actors and timestamps.
8. Daily verified/unverified summaries are informational. Formal daily closing and actual cash/collection reconciliation are deferred.

## Consequences

### Positive

- Accounting remains independent from transaction entry and correction.
- Sales and inventory cannot be silently rewritten during reconciliation.
- The owner can see unresolved mismatches and their financial impact.

### Negative

- Admin must handle corrections reported by Accounting.
- Formal collection closing is not included in the MVP.

## Rejected Alternatives

- **Accounting edits the sale:** mixes validation with correction and can create unexplained stock changes.
- **Use comments only:** lacks status, ownership, and resolution tracking.
- **Delete and re-enter without reversal:** breaks the audit trail and inventory linkage.
