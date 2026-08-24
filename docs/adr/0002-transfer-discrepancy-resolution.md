# ADR 0002: Preserve Transfers and Resolve Discrepancies Separately

**Status:** Proposed for stakeholder confirmation
**Date:** 2026-08-24

## Context

Stock Staff distributes products from a central warehouse to branches. Branch Staff must compare the transfer shown in the system with the physical delivery. Branch users are not allowed to directly edit stock, but they need a simple way to confirm a correct delivery or report missing, excess, damaged, or wrong items.

Editing the original transfer after dispatch would hide whether the warehouse record, transport, or physical receipt was wrong. Posting a generic stock adjustment without linking it to the transfer would also make investigation difficult.

## Decision

1. A dispatched transfer is an immutable record of what the warehouse says it sent.
2. Dispatch deducts source stock and records an in-transit movement.
3. Branch Staff can perform one of two controlled actions:
   - confirm that every item and quantity matches; or
   - submit the actual disposition of every dispatched line, plus any excess/wrong SKU lines and discrepancy reasons.
4. A matched confirmation posts destination stock automatically and closes the transfer.
5. A discrepancy creates a linked discrepancy report and notifies Admin and Stock Staff. It does not allow Branch Staff to set inventory directly.
6. Stock Staff investigates and prepares a read-only movement proposal for every affected item; submitting its immutable version/hash sets `PENDING_ADMIN_APPROVAL`.
7. Admin reviews original dispatch, branch count, evidence, findings, and the exact proposed ledger effects. Admin may approve the proposal, return it for recount, or resolve the report as a normal matched receipt.
8. Destination stock for a discrepant transfer is posted only during Admin resolution. Approval supplies and transactionally revalidates the immutable proposal version/hash, transfer version, and ledger state before posting. Resolving as matched still posts `transit -D` and `destination +D`; it omits only variance movements.
9. Resolution clears the complete original in-transit quantity, receives confirmed actual quantities, and creates separate source restoration, variance, loss, return, damaged, or supplemental movements as needed. No unexplained transit balance may remain.
10. The original dispatched quantities, reporter, investigator, proposal, approver, resolution, actors, reasons, timestamps, and posted movement IDs remain visible.

Admin approval is one fixed MVP control, not a configurable multi-level approval engine. If Admin performs the investigation personally, Admin may enter findings and approve on the same screen. Branch Staff never approves, and Stock Staff cannot perform final posting in the MVP.

## Inventory Movement Rule

- Dispatch quantity `D`: source `-D`, transit `+D`.
- Matched receipt: transit `-D`, destination `+D`.
- Discrepant receipt with actual `A`: transit `-D`, destination `+A`, and explicitly allocate `D-A` to restoration, loss, return, damaged stock, or another named resolution. Excess and wrong SKUs require their own identified source and paired movements.

Each resolution must conserve quantity across locations and explicit loss/write-off movements.

## Why a Separate Resolution Record

The transfer answers, "What did the warehouse dispatch?" The discrepancy report answers, "What did the branch physically count?" The resolution answers, "What did the authorized investigation conclude and post?" Keeping these facts separate preserves accountability while remaining simple for Branch Staff.

## Consequences

### Positive

- Branch Staff never directly adjusts stock.
- The source claim, destination count, and final resolution are all auditable.
- Double posting can be prevented with one idempotent resolution action.
- Notifications map cleanly to transfer states.

### Negative

- Discrepant stock is not immediately sellable in the system until reviewed.
- Stock Staff must investigate and Admin must resolve discrepancies promptly.
- Wrong and damaged items may eventually require a damaged/return location model.

## Simplified MVP State Flow

```text
DRAFT -> FOR_DISPATCH -> IN_TRANSIT
  -> RECEIVED
  -> DISCREPANCY_REPORTED -> UNDER_REVIEW -> PENDING_ADMIN_APPROVAL
     -> RESOLVED
     -> RECOUNT_REQUIRED -> UNDER_REVIEW
```

## Rejected Alternatives

- **Edit the transfer to match actual delivery:** erases the dispatch record and weakens investigation.
- **Let Branch Staff adjust stock:** violates the owner's centralized stock-control requirement.
- **Create an unrelated generic adjustment:** loses the causal link to the transfer.
- **Build a multi-level approval engine immediately:** unnecessary complexity for the initial workflow.
