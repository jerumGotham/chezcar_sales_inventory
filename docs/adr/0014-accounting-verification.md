# ADR 0014: Accounting Verification and Void-and-Replace Correction

**Status:** Accepted
**Date:** 2026-08-26

## Context

Branch Staff encodes a manual-receipt sale after the handwritten receipt is written and goods are released. Accounting Staff must verify every encoded sale against its handwritten receipt. The current sales implementation (`lib/server/services/customer-sales.ts`) is durable but has no verification state, no mismatch workflow, and no correction pattern. `PRODUCT-REQUIREMENTS.md:145` Workflow 2 requires verification, structured mismatch reporting, and Admin-authorized correction without rewriting history.

## Decision

### 1. Receipt identity uniqueness

- Receipt identity is unique **per branch** (`locationId + receiptBooklet + receiptNumber`), not globally. Different branches may reuse the same number.
- Enforce a hard DB unique constraint; duplicate posting returns 409 `DUPLICATE_RECEIPT`.
- Skipped/cancelled receipt identities are out of scope for this ADR (deferred).

### 2. Verification actor

- Only `ACCOUNTING_STAFF` can verify or report a mismatch. `BRANCH_STAFF` cannot verify own sales. `ADMIN` can view the queue and resolve mismatches but cannot perform initial verification.

### 3. Sale verification states

- `UNVERIFIED` (default on creation) → `VERIFIED` (Accounting marks correct) → terminal.
- `UNVERIFIED` → `MISMATCH_REPORTED` (Accounting files structured mismatch).
- `MISMATCH_REPORTED` → `VOIDED` + linked `REPLACEMENT` (correction) OR `VERIFIED` via Admin/Accounting “confirm correct”.

### 4. Mismatch categories

Closed enum for MVP:
`PRICE_MISMATCH`, `QUANTITY_MISMATCH`, `ITEM_MISMATCH`, `TOTAL_MISMATCH`, `RECEIPT_NOT_FOUND`, `OTHER`.
Stored per mismatch report with required `notes`, comparison snapshot, and optional receipt-photo storage key.

### 5. Evidence

- Accounting may attach an **optional** photo of the handwritten receipt. The database stores only a generated evidence key and MIME type; the file is served through an authorized route from the configured persistent storage path. Required photo for damage/materiality threshold is deferred.

### 6. Notifications

- On `MISMATCH_REPORTED`, create durable per-user notifications for: all `ADMIN` users + the `BRANCH_STAFF` who encoded the sale (attributable via `Sale.encodedById`).
- On correction/confirm, notify the same set.

### 7. Void-and-replace correction

- Never mutate a posted sale in place. On “Fix with correction”, create a new `Sale` row linked via `correctionOfId` (or `voidedSaleId`), mark original `VOIDED`, post compensating inventory movements (reverse original deduction, apply corrected deduction) in one transaction.
- “Confirm correct” keeps original, marks mismatch `RESOLVED_MISTAKEN`, and transitions sale to `VERIFIED`.
- Corrected replacement is **auto-VERIFIED**; no re-verification loop.
- Authorized actors for correction: `ADMIN` **or** `ACCOUNTING_STAFF` (owner/busy concern). `BRANCH_STAFF` and `STOCK_STAFF` cannot correct. Both actors share the same service with identical audit.

### 8. Server rules preserved

- No negative stock on correction (validate corrected quantities against branch `onHand`).
- Server-calculated authoritative totals.
- Idempotent retry, actor/time recorded, immutable movements.

## Consequences

### Positive

- Receipt uniqueness prevents double-encoding.
- Audit history preserved; voided sales remain queryable.
- Busy-owner bottleneck removed without opening correction to branch.

### Negative

- More sale rows and movements per correction.
- Two actors can correct — audit must record which one did.

## Rejected Alternatives

- **Global receipt uniqueness:** rejected; branches reuse booklet numbers in real operation.
- **In-place sale edit:** rejected; loses history and violates audit rules.
- **Admin-only correction:** rejected; creates delay when owner is busy.

## References

- `docs/product/PRODUCT-REQUIREMENTS.md:117` Workflow 1 Sales Rules
- `docs/product/PRODUCT-REQUIREMENTS.md:145` Workflow 2 Accounting Verification
- `lib/server/services/customer-sales.ts`
