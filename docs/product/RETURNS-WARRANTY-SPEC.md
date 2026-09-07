# Returns and Warranty Production Spec

**Status:** Core Backjob, Customer Warranty, Supplier Claim, split receiving, and inventory actions implemented
**Last updated:** 2026-09-07
**Source:** Owner grill-with-docs decisions; ADR 0016

## Purpose

Record and monitor Backjobs, Customer Warranty cases, and Supplier Claims while keeping every physical stock action explicit, authorized, and auditable.

## Shared Rules

- Creating, assessing, approving, or changing a case status does not by itself change inventory.
- Every physical receipt, issue, return, replacement, repair release, or write-off posts an immutable inventory movement in the same database transaction as its workflow action.
- Cases have a generated reference number, owning branch/location, status history, notes, photos/attachments, assigned personnel, approvals, target dates, and printable claim detail.
- Customer Warranty and Supplier Claim damage/defect submissions require at least one photo. Backjob photos are optional.
- Active stages require an operational target: Backjobs require a schedule; approved warranties and submitted Supplier Claims require a follow-up/resolution target date. Rescheduling requires a reason and remains in history so overdue reporting is reliable.
- Quarantine is a non-sellable quantity bucket within each location, not a separate Location record.
- `available = onHand - reserved - quarantined`.
- Quarantined stock remains physically included in `onHand` until it leaves the location through replacement, supplier return, or write-off.
- Actions use dedicated capabilities and effective location scope. A branch may return stock directly to a supplier; routing through `SR` is not required.

## Backjob

A Backjob is remedial installation/service work linked normally to the original sale and customer. Admin may document an exception for legacy transactions that are not in the system.

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

Products may have an optional warranty duration. A claim snapshots the warranty basis and computed eligibility. If the product had no duration when sold, Admin must enter and justify the claim-specific warranty basis; later product edits do not alter existing claims.

Suggested lifecycle:

`FOR_ASSESSMENT` -> `APPROVED_FOR_REPAIR` or `APPROVED_FOR_REPLACEMENT`

Replacement cases then use:

`WAITING_FOR_REPLACEMENT_STOCK` -> `READY_FOR_CUSTOMER_RELEASE` -> `REPLACEMENT_RELEASED` -> `COMPLETED`

Rejected and cancelled cases remain auditable. Customer refund and exchange-to-another-sale workflows are deferred; current customer resolutions are repair or replacement.

Inventory rules:

- Case creation has no stock effect.
- An authorized user with receive-to-quarantine permission confirms physical return; this increases `onHand` and `quarantined` at the case location.
- An approved replacement may use available branch stock immediately without waiting for supplier resolution.
- Releasing a replacement decreases `onHand` and available stock at the release location.
- Replacement defaults to the original product. Admin may approve an equivalent product with a required reason; both original and replacement identities are preserved.

## Supplier Claim

Supplier Damage is not a separate transaction type. Damage, defect, incomplete delivery, wrong delivery, and supplier-covered customer warranty are issue reasons within one Supplier Claim workflow.

A Supplier Claim links to an active Supplier, owning branch/location, source receiving or Customer Warranty when applicable, affected products/quantities, quarantined physical quantity, required damage/defect evidence, supplier reference, requested resolution, supplier response, target follow-up date, monetary references, and status history.

A Customer Warranty creates or prompts a Supplier Claim only after the issue is confirmed as supplier-covered. The Customer Warranty and Supplier Claim have independent linked statuses:

- Customer: `APPROVED_FOR_REPLACEMENT`, `WAITING_FOR_REPLACEMENT_STOCK`, or `READY_FOR_CUSTOMER_RELEASE`.
- Supplier: `CLAIM_PENDING`, `WAITING_FOR_SUPPLIER_REPLACEMENT`, `PARTIALLY_RESOLVED`, `SUPPLIER_REPLACEMENT_RECEIVED`, `REJECTED`, or `COMPLETED`.

Supported supplier resolutions are replacement, repair, cash refund, credit memo, partial resolution, rejection, and approved write-off.

- Returning stock to a supplier decreases both `onHand` and `quarantined` at the claim location.
- A supplier replacement increases `onHand` only when physically received at the claim branch/location. It is sellable unless inspection places it in quarantine.
- Cash refunds and credit memos record amount, date, reference, and proof through an Accounting-authorized action. They do not change inventory and do not post a general ledger or supplier balance in this scope.
- Missing delivery quantity creates a claim but no quarantine movement because no physical item was received.

## Supplier Receiving

Supplier Maintenance and active-Supplier selection in current Stock Room receiving are implemented. Future claims will reuse the same stable Supplier identity. Supplier records include identity, contact details, active status, and audit metadata.

Receiving supports line-level split quantities:

- Accepted sellable quantity.
- Physically received quarantined/damaged/wrong quantity.
- Missing quantity.

Posting increases sellable and quarantined balances only for physically received quantities and may create a linked Supplier Claim immediately. It must not treat missing quantity as received inventory.

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
