# ADR 0014: Accounting Verification and Void-and-Replace Correction

**Status:** Accepted
**Date:** 2026-08-26
**Amended:** 2026-09-05

## Context

Branch Staff encodes a manual-receipt sale after the handwritten receipt is written and goods are released. Accounting Staff must verify every encoded sale against its handwritten receipt. The current sales implementation (`lib/server/services/customer-sales.ts`) is durable but has no verification state, no mismatch workflow, and no correction pattern. `PRODUCT-REQUIREMENTS.md:145` Workflow 2 requires verification, structured mismatch reporting, and Admin-authorized correction without rewriting history.

## Decision

### 1. Receipt identity uniqueness

- Receipt identity is unique **per branch** (`locationId + receiptBooklet + receiptNumber`), not globally. Different branches may reuse the same number.
- Enforce a hard DB unique constraint; duplicate posting returns 409 `DUPLICATE_RECEIPT`.
- Skipped/cancelled receipt identities are out of scope for this ADR (deferred).

### 2. Verification actor

- `ACCOUNTING_STAFF` or `ADMIN` can verify or report a mismatch. `BRANCH_STAFF` cannot perform initial verification, but must submit the assigned-branch double-check before a reported mismatch can be resolved.

### 3. Sale verification states

- `UNVERIFIED` (default on creation) → `VERIFIED` (Accounting marks correct) → terminal.
- `UNVERIFIED` → `MISMATCH_REPORTED` (Accounting files structured mismatch).
- `MISMATCH_REPORTED` → Branch confirms original encoding → `VERIFIED` via Admin/Accounting “confirm correct”.
- `MISMATCH_REPORTED` → Branch confirms correction and supplies replacement receipt number → `VOIDED` + linked `REPLACEMENT` via Admin.

### 4. Mismatch categories

Closed enum for MVP:
`PRICE_MISMATCH`, `QUANTITY_MISMATCH`, `ITEM_MISMATCH`, `TOTAL_MISMATCH`, `RECEIPT_NOT_FOUND`, `OTHER`.
Stored per mismatch report with required `notes`, comparison snapshot, and optional receipt-photo storage key.

### 5. Evidence

- Accounting verification and mismatch reporting require a photo of the handwritten receipt. The database stores only a generated evidence key and MIME type; the file is served through an authorized route from the configured persistent storage path.

### 6. Notifications

- On `MISMATCH_REPORTED`, create durable per-user notifications for all active `ADMIN` users and active `BRANCH_STAFF` assigned to the sale branch.
- A Branch response notifies active Admin and Accounting users.
- On correction/confirm, notify the same set.

### 7. Void-and-replace correction

- Never mutate a posted sale in place. On “Fix with correction”, create a new `Sale` row linked via `correctionOfId` (or `voidedSaleId`), mark original `VOIDED`, post compensating inventory movements (reverse original deduction, apply corrected deduction) in one transaction.
- “Confirm correct” keeps original, marks mismatch `RESOLVED_MISTAKEN`, and transitions sale to `VERIFIED`.
- Corrected replacement starts **UNVERIFIED** and requires its own receipt photo and Accounting review. The voided original remains queryable for audit but has no actionable evidence-pending state.
- Only `ADMIN` can post the stock-changing void-and-replace correction. `ACCOUNTING_STAFF` may close only a mismatch where Branch confirmed that the original encoding is correct. Branch Staff submits evidence and the replacement receipt identity but cannot mutate sale or inventory facts.

### 8. Server rules preserved

- No negative stock on correction (validate corrected quantities against branch `onHand`).
- Server-calculated authoritative totals.
- Idempotent retry, actor/time recorded, immutable movements.

### 9. Branch-originated wrong-submission request

- Before posting, POS presents the exact branch, customer, receipt, payment, lines, totals, and immediate stock effect for confirmation.
- Branch Staff may report a wrong assigned-branch direct-sale submission through a separate `SaleCorrectionRequest`; this is not Accounting verification and does not require receipt evidence.
- Request creation records reason/note/actor/time, notifies Admin, leaves the sale posted, and creates no inventory movement.
- Accounting review is blocked while the request is pending.
- Admin may keep the sale without stock effect, or void it and restore every original line through `SALE_CORRECTION_REVERSAL` movements in one transaction. Branch Staff never receives edit, delete, void, or stock-adjustment authority.
- A real sale with incorrect receipt-backed encoding still uses the mismatch and void-and-replace flow rather than void-only.

## Consequences

### Positive

- Receipt uniqueness prevents double-encoding.
- Audit history preserved; voided sales remain queryable.
- Branch confirmation makes the correction decision explicit without opening sale or stock mutation to Branch Staff.

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
