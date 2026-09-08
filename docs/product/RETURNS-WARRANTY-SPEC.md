# Returns and Warranty Production Spec

**Status:** Core Backjob, Customer Warranty, Supplier Claim, split receiving, and inventory actions implemented
**Last updated:** 2026-09-08
**Source:** Owner grill-with-docs decisions; ADR 0016

## Purpose

Record and monitor Backjobs, Customer Warranty cases, and Supplier Claims while keeping every physical stock action explicit, authorized, and auditable.

## Shared Rules

- Creating, assessing, approving, or changing a case status does not by itself change inventory.
- Every physical receipt, issue, return, replacement, repair release, or write-off posts an immutable inventory movement in the same database transaction as its workflow action.
- Cases have a generated reference number, owning branch/location, status history, notes, photos/attachments, assigned personnel, approvals, target dates, and printable claim detail.
- Customer Warranty intake photos are optional at creation. Supplier Claim damage/defect submissions still require at least one uploaded photo; a PDF alone is insufficient. Backjob photos remain optional.
- Active stages require an operational target: Backjobs require a schedule; approved warranties and submitted Supplier Claims require a follow-up/resolution target date. Rescheduling requires a reason and remains in history so overdue reporting is reliable.
- Quarantine is a non-sellable quantity bucket within each location, not a separate Location record.
- `available = onHand - reserved - quarantined`.
- Quarantined stock remains physically included in `onHand` until it leaves the location through customer return, replacement, supplier return, or write-off.
- Actions use dedicated capabilities and effective location scope. A branch may return stock directly to a supplier; routing through `SR` is not required.

## Backjob

A Backjob is remedial installation/service work linked normally to the original sale and customer. Admin may document an exception for legacy transactions that are not in the system.

The 2026-09-08 source revision supports multiple original purchased SaleLines in one persisted `Backjob.items` aggregate, all from the same posted Sale and customer. Items share the concern, schedule, coverage, work, and parts plan; selected SaleLines are not quantities of affected units. Existing one-line/legacy cases are retained by additive backfill. Capability `backjobs:delete` is owner-granted by convention and may be delegated through Role Permissions; it permits only unused `DRAFT` cases in the actor's location scope, with no stock, financial, attachment, scheduling, or work evidence. `PENDING` is coverage only and does not make scheduled/in-progress cases deletable. Migration/client generation and verification remain pending. See `docs/BACKJOB-ITEMS-AND-DELETE.md`.

The case records the concern, product/service, schedule, assigned Installer, work performed, photos, notes, parts issued/returned, coverage decision, chargeable amount when applicable, and completion details.

- Service-only work has no inventory movement.
- Stock is deducted when parts are physically issued, not when they are merely planned or when the Backjob is later completed.
- Unused issued parts return through a separate auditable movement.
- A chargeable Backjob must create or link a proper sale/payment transaction; an amount in a note is not a financial record.
- Because Installers do not require login accounts, authorized Branch Staff records completion, work evidence, parts disposition, and customer acknowledgement. Admin may reopen or correct the case with an audit trail.

Suggested lifecycle:

`DRAFT` -> `SCHEDULED` -> `IN_PROGRESS` -> `COMPLETED`

Exceptional terminal states are `CANCELLED` and `REJECTED`. Parts may be issued only to an active case and all issued quantities must be reconciled as used or returned before completion.

## Customer Warranty

A Customer Warranty is linked normally to an original verified system sale and receipt. Admin may create a documented legacy exception. The claim line references the original sale line and tracks cumulative claimed/replaced quantity so it cannot exceed the purchased quantity unless Admin overrides with a reason.

The create form's Purchased item dropdown searches the loaded sale lines by receipt number, customer name, or product. Its primary label contains only receipt number and customer name, never the internal sale reference. Separate product code/name and purchased quantity appear in option context and below the selection, so lines sharing a receipt remain distinguishable. For a system-sale claim, the form derives the read-only case/intake location from the selected line's sale, including when the selection changes or is cleared; no unrelated manual location is submitted. The server still authorizes the location, requires it to match the original sale, and checks that it is active. Legacy claims retain manual location selection. This selector/location revision is source-only and has not been runtime-verified.

"Legacy claim" means an owner-recorded claim without a linked system sale: customer name, product, exception reason, warranty period, and coverage explanation are entered manually; the original receipt/sale reference is optional. Create/detail screens describe this as "Sale not recorded in this system". It does not mean an expired warranty or a Supplier Claim.

Creation accepts no photo and detail shows "No intake photo attached" rather than a broken evidence link. When a file is selected, its preview/name can be removed before submission; this clears only browser selection and never deletes persisted evidence. Supplied photos retain their existing content/type/size checks. **Deployment prerequisite:** apply the authored `20260908180000_optional_warranty_intake_photo` nullability migration and regenerate Prisma Client. Neither was run in this source-only update (see `docs/DATABASE.md`).

Products may have an optional warranty duration. A claim snapshots the warranty basis and computed eligibility. If the product had no duration when sold, Admin must enter and justify the claim-specific warranty basis; later product edits do not alter existing claims.

Suggested lifecycle:

`FOR_ASSESSMENT` -> `APPROVED_FOR_REPAIR` or `APPROVED_FOR_REPLACEMENT`

Replacement cases then use:

`WAITING_FOR_REPLACEMENT_STOCK` -> `READY_FOR_CUSTOMER_RELEASE` -> `REPLACEMENT_RELEASED` -> `COMPLETED`

Rejected and cancelled cases remain auditable. Customer refund and exchange-to-another-sale workflows are deferred; current customer resolutions are repair or replacement.

Inventory rules:

- Case creation has no stock effect.
- An authorized user with receive-to-quarantine permission confirms physical return; this increases `onHand` and `quarantined` at the case location.
- During assessment, an authorized release user may return an unrepaired received item to the customer with positive quantity and a required reason. This decrements `onHand` and `quarantined`, records `returnedQuantity` and an immutable `WARRANTY_RELEASE`, remains in assessment, and cannot consume quantity allocated to a Supplier Claim.
- Once any intake quantity has been returned to the customer, the case cannot switch to repair or replacement approval; all remaining intake must be resolved before rejection or cancellation.
- An approved replacement may use available branch stock immediately without waiting for supplier resolution.
- Releasing a replacement decreases `onHand` and available stock at the release location.
- Replacement defaults to the original product. Admin may approve an equivalent product with a required reason; both original and replacement identities are preserved.
- Creation combines the client idempotency key with a stable fingerprint of actor, normalized request fields, and intake-evidence content hash or null when omitted. An identical retry returns the existing case without retaining a duplicate upload; different content or photo presence under the same key is rejected as a conflict.
- If the SaleLine has no warranty-duration snapshot, only Owner Admin may establish a claim-specific duration and documented basis. The same Owner Admin plus reason rule applies to cumulative quantity above the sold quantity and equivalent-product replacement.
- Repair and replacement approval require a future operational target. Reject/cancel is blocked while current quarantine custody remains unresolved; historical intake alone does not block closure after explicit customer return or Supplier Claim disposition.

## Supplier Claim

Supplier Damage is not a separate transaction type. Damage, defect, incomplete delivery, wrong delivery, and supplier-covered customer warranty are issue reasons within one Supplier Claim workflow.

A Supplier Claim links to an active Supplier, owning branch/location, source receiving or Customer Warranty when applicable, affected products/quantities, quarantined physical quantity, required damage/defect evidence, supplier reference, requested resolution, supplier response, target follow-up date, monetary references, and status history.

A Customer Warranty creates or prompts a Supplier Claim only after the issue is confirmed as supplier-covered. The Customer Warranty and Supplier Claim have independent linked statuses:

- Customer: `APPROVED_FOR_REPLACEMENT`, `WAITING_FOR_REPLACEMENT_STOCK`, or `READY_FOR_CUSTOMER_RELEASE`.
- Supplier: `CLAIM_PENDING`, `WAITING_FOR_SUPPLIER_REPLACEMENT`, `PARTIALLY_RESOLVED`, `SUPPLIER_REPLACEMENT_RECEIVED`, `REJECTED`, or `COMPLETED`.

Supported supplier resolutions are replacement, repair, cash refund, credit memo, partial resolution, rejection, and approved write-off.

- Returning stock to a supplier decreases both `onHand` and `quarantined` at the claim location.
- A supplier replacement increases `onHand` only when physically received at the claim branch/location. It is sellable unless inspection places it in quarantine.
- Cash refunds and credit memos record amount, currency, reference, notes, server-recorded time, and explicit resolved product quantities through an Accounting-authorized action. They reduce outstanding missing quantities only; they do not change inventory, unit cost, supplier balance, or a general ledger in this scope.
- Missing delivery quantity creates a claim but no quarantine movement because no physical item was received.
- Claim creation, workflow actions, and refund/credit settlements use payload-checked idempotency: identical retries return the stored outcome, while same-key/different-payload reuse is rejected.
- Submission requires a future follow-up target and photo evidence when any line is damage/defect. Rejection may close missing quantities, but is blocked until all quarantined stock has been returned, released/repaired, or written off through an explicit physical action.

## Supplier Receiving

Supplier Maintenance and active-Supplier selection in current Stock Room receiving are implemented. Future claims will reuse the same stable Supplier identity. Supplier records include identity, contact details, active status, and audit metadata.

Receiving supports line-level split quantities:

- Accepted sellable quantity.
- Physically received quarantined/damaged/wrong quantity.
- Missing quantity.

Posting increases `onHand` for accepted plus quarantined physical quantities, increases `quarantined` only for the quarantined split, and may create a linked draft Supplier Claim immediately. A line with missing quantity only does not create or update a balance, change unit cost, or create an inventory movement.

## Authorization

Capabilities should distinguish at least:

- View and create Returns/Warranty cases.
- Schedule and complete Backjobs.
- Receive customer returns into quarantine.
- Issue and return Backjob parts.
- Assess and approve Customer Warranty repair/replacement.
- Release an approved customer replacement.
- View, create, and manage Supplier Claims.
- Return quarantined stock to a supplier.
- Receive supplier replacement stock.
- Record supplier refund/credit resolution.
- Approve write-off.
- Close/reopen cases and print claim detail.
- View, create, update, and deactivate Suppliers.

Branch Staff may create branch concerns and record Backjob work when authorized. Stock-focused users handle quarantine and supplier stock actions when authorized. Accounting records monetary supplier resolutions. Admin approves equivalent replacements, warranty quantity overrides, and write-offs. Exact access remains capability-based, not hard-coded to role names.

## Acceptance Criteria

1. Cases and approvals never change stock without a separate confirmed physical action.
2. Quarantined stock is location-scoped, included in on-hand, and excluded from available stock.
3. Backjob parts deduct on issue and unused parts return through movements.
4. Customer replacements can use available branch stock before supplier resolution.
5. Supplier-covered warranties link to, but remain distinct from, Supplier Claims.
6. Split receiving never adds missing quantities to inventory.
7. Supplier replacement adds stock only when physically received at the claim location.
8. Refund and credit memo resolutions have no inventory or general-ledger effect in this scope.
9. Warranty replacement quantity is cumulatively bounded by original purchased quantity unless Admin overrides with reason.
10. Every stock mutation, approval, override, status change, and monetary resolution preserves actor, time, reason, and source reference.
11. Required case evidence and active-stage target dates are validated before the relevant submission or approval transition.
