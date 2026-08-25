# Stock Transfer Flow Note

**Status:** Implemented durable core workflow. The current slice has server authorization, PostgreSQL transactions, transfer/movement audit records, and a live menu. Real-time notifications, offline capture, photo evidence upload, and dedicated damaged/return locations remain deferred.

## Purpose

Inventory answers, "What stock is available at this location?" Stock Transfers is a separate workflow for moving stock from Stock Room (`SR`) to one destination branch and tracking its physical receipt.

## Role Access

| Role | Access |
| --- | --- |
| Admin | View every transfer and discrepancy; approve and post the final discrepancy resolution. |
| Stock Staff | View `SR` transfer work; create and dispatch `SR`-to-branch transfers; investigate discrepancies and submit findings. |
| Branch Staff | View only transfers sent to the assigned branch; confirm an exact receipt or submit a discrepancy report. |
| Accounting Staff | No Stock Transfers access. |

Branch Staff cannot edit dispatched quantities or directly adjust stock. Stock Staff cannot post the final discrepancy resolution. Admin approval is required before the linked stock outcome is posted.

## Planned Flow

1. Stock Staff creates and dispatches a multi-item transfer from `SR` to a branch.
2. Dispatch deducts stock from `SR` and records matching stock as in transit.
3. The destination Branch Staff compares the physical delivery with every dispatched line.
4. If every line matches, Branch Staff confirms receipt; the system moves stock from in transit to the destination branch.
5. If any line differs, Branch Staff submits actual quantities, reasons, notes, and required evidence. The transfer becomes `DISCREPANCY_REPORTED`; disputed stock is unavailable for sale.
6. Stock Staff investigates and submits findings or a resolution proposal.
7. Admin reviews and posts the final resolution. The system clears the in-transit quantity and creates all destination, restoration, loss, damaged, return, or supplemental movements in one authorized transaction.

## Implementation Boundary

The separate sidebar menu, transfer pages, APIs, database models, stock movement ledger, notifications, and audit history should be implemented together. Visibility in the menu is not authorization; every transfer action must enforce the role and location scope on the server.

See [ADR 0002](../adr/0002-transfer-discrepancy-resolution.md), [Product Requirements](PRODUCT-REQUIREMENTS.md), and [Provisional Data Model](PROVISIONAL-DATA-MODEL.md) for the governing requirements.
