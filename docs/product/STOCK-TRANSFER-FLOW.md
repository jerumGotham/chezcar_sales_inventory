# Stock Transfer Flow Note

**Status:** Implemented durable core workflow. The current slice has server authorization, PostgreSQL transactions, transfer/movement audit records, persisted real-time notifications, and a live menu. Offline capture, photo evidence upload, and dedicated damaged/return locations remain deferred.

## Purpose

Inventory answers, "What stock is available at this location?" Stock Transfers is a separate workflow for moving stock from Stock Room (`SR`) to one destination branch and tracking its physical receipt.

## Role Access

| Role | Access |
| --- | --- |
| Admin | View every transfer; cover Stock Staff source-side actions when needed; approve and post the final discrepancy resolution. |
| Stock Staff | View `SR` transfer work; create, dispatch, and cancel in-transit `SR`-to-branch transfers; investigate discrepancies and submit findings. |
| Branch Staff | View only transfers sent to the assigned branch; confirm an exact receipt or submit a discrepancy report. |
| Accounting Staff | No Stock Transfers access. |

Branch Staff cannot edit dispatched quantities or directly adjust stock. Admin may create, edit, finalize, dispatch, and investigate transfers as operational cover for Stock Staff. Stock Staff cannot post the final discrepancy resolution. Admin approval is required before the linked stock outcome is posted.

Transfer records are authorized by source or destination. A user assigned to active `SR` with the relevant transfer action capability can create and manage outbound records to any active branch; this workflow-specific reach does not grant access to that branch's inventory, sales, orders, reports, or other business data. A destination-side user can see and act only on transfers whose destination is one of their active assignments.

## Planned Flow

1. Stock Staff creates a private multi-item draft from `SR` to a branch using searchable active products whose server-derived `SR` availability (`onHand - reserved`) is positive. Draft creation sends no notification; finalizing the draft alerts Stock Room staff who can dispatch it.
2. Dispatch deducts stock from `SR` and records matching stock as in transit.
3. Before the branch records a receipt or discrepancy, Stock Staff may cancel the complete in-transit transfer with a required reason. The dispatch remains immutable, compensating movements restore the stock to `SR`, and the transfer becomes `CANCELLED`.
4. Authorized source staff or the assigned destination Branch Staff may print the read-only in-transit receiving checklist. Printing does not update workflow state or inventory.
5. The destination Branch Staff compares the physical delivery with every dispatched line.
6. If every line matches, Branch Staff confirms receipt; the system moves stock from in transit to the destination branch.
7. If any line differs, Branch Staff submits actual quantities, reasons, notes, and required evidence. The transfer becomes `DISCREPANCY_REPORTED`; disputed stock is unavailable for sale.
8. Stock Staff investigates and submits findings or a resolution proposal.
9. Admin reviews and posts the final resolution. The system clears the in-transit quantity and creates all destination, restoration, loss, damaged, return, or supplemental movements in one authorized transaction.

## Implementation Boundary

The separate sidebar menu, transfer pages, APIs, database models, stock movement ledger, notifications, and audit history should be implemented together. Visibility in the menu is not authorization; every transfer action must enforce the role and location scope on the server.

See [ADR 0002](../adr/0002-transfer-discrepancy-resolution.md), [Product Requirements](PRODUCT-REQUIREMENTS.md), and [Provisional Data Model](PROVISIONAL-DATA-MODEL.md) for the governing requirements.
