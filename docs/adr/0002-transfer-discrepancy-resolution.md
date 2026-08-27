# ADR 0002: Preserve Transfers and Resolve Discrepancies Separately

**Status:** Accepted
**Date:** 2026-08-24
**Accepted:** 2026-08-25

## Context

Stock Staff distributes products from the central Stock Room (`SR`) to branches. Branch Staff must compare the transfer shown in the system with the physical delivery. Branch users are not allowed to directly edit stock, but they need a simple way to confirm a correct delivery or submit a discrepancy form.

Editing the original transfer after dispatch would hide whether the Stock Room record, transport, or physical receipt was wrong. Posting a generic stock adjustment without linking it to the transfer would also make investigation difficult.

## Decision

1. Stock Staff normally initiates and dispatches transfers from `SR` to a branch. Admin may perform the same source-side actions as operational cover when Stock Staff is unavailable. Branch requests, branch-to-branch transfers, and direct supplier-to-branch receipts are deferred.
2. A dispatched transfer is an immutable record of what `SR` says it sent.
3. Dispatch deducts `SR` stock, records equal in-transit quantities, and notifies the destination branch in real time.
4. Assigned Branch Staff can perform one of two controlled actions:
   - confirm that every item and quantity matches; or
   - submit the actual disposition of every dispatched line, plus any excess/wrong SKU lines and discrepancy reasons.
5. A matched confirmation clears in-transit stock, posts destination stock automatically, marks the transfer `RECEIVED`, and notifies Stock Staff and Admin.
6. There is no separate `DELIVERED` or `CONFIRMED` status. `RECEIVED` means physically at the branch and confirmed matched.
7. A discrepancy form records actual quantities, reason, notes, and conditionally required photos; it notifies Admin and Stock Staff and does not let Branch Staff set inventory.
8. Disputed quantities remain unavailable for sale.
9. Stock Staff normally investigates and records findings; Admin may perform the investigation as operational cover. Admin performs the final linked stock correction.
10. Resolution clears the complete original in-transit quantity and accounts for every destination, restoration, non-sellable, loss/write-off, return, or supplemental movement.
11. Original dispatch, branch report, findings, Admin resolution, actors, reasons, timestamps, and movements remain visible.

Admin approval is one fixed MVP control, not a configurable approval engine. Branch Staff never approves, and Stock Staff cannot perform final posting in the MVP.

## Inventory Movement Rule

- Dispatch quantity `D`: source `-D`, transit `+D`.
- Matched receipt: transit `-D`, destination `+D`.
- Discrepant receipt with actual `A`: transit `-D`, destination `+A`, and explicitly allocate `D-A` to restoration, loss, return, damaged stock, or another named resolution. Excess and wrong SKUs require their own identified source and paired movements.

Each resolution must conserve quantity across locations and explicit loss/write-off movements.

## Why a Separate Resolution Record

The transfer answers, "What did the Stock Room dispatch?" The discrepancy report answers, "What did the branch physically count?" The resolution answers, "What did the authorized investigation conclude and post?" Keeping these facts separate preserves accountability while remaining simple for Branch Staff.

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
   -> DISCREPANCY_REPORTED -> UNDER_REVIEW -> RESOLVED
```

## Rejected Alternatives

- **Edit the transfer to match actual delivery:** erases the dispatch record and weakens investigation.
- **Let Branch Staff adjust stock:** violates the owner's centralized stock-control requirement.
- **Create an unrelated generic adjustment:** loses the causal link to the transfer.
- **Build a multi-level approval engine immediately:** unnecessary complexity for the initial workflow.
