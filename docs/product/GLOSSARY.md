# Chezcar Domain Glossary

**Status:** Working glossary
**Last updated:** 2026-08-24

| Term | Working definition |
| --- | --- |
| Admin | The owner role with visibility across all branches and authority to manage users, master data, corrections, and discrepancy resolution. Posted transactions remain auditable even for Admin. |
| Accounting Staff | A read/reconciliation role that compares each system sale with its handwritten receipt. It may verify or report mismatches but cannot edit sales or stock. Cash-collection reconciliation is deferred. |
| Actual Received Quantity | The physical quantity counted by Branch Staff when a transfer arrives. It may differ from the dispatched quantity. |
| Available Stock | `max(sellable on-hand - reserved, 0)` at one location. Book on-hand may be negative only for a flagged offline physical-sale conflict. In-transit stock is a separate location/state included only in enterprise-wide totals and is not subtracted again after dispatch. |
| Branch | A retail location that sells items and receives stock from the central warehouse. |
| Branch Staff | A branch-scoped user who records sales, views branch inventory, confirms transfer receipt, and reports discrepancies. This role cannot directly adjust stock balances. |
| Correction | A new auditable action that fixes a posted transaction without rewriting its original history. |
| Daily Reconciliation | A dashboard summary of receipt-level verification for a branch and date. A distinct daily closing and actual-cash reconciliation workflow is deferred. |
| Discrepancy | A difference between system records and physical reality, including transfer-delivery mismatches, cycle-count variance, damage, loss, an unrecorded sale, or an encoding error. |
| Discrepancy Report | A branch-submitted record containing the actual disposition of every dispatched line, any additional wrong/excess SKU lines, discrepancy type, notes, reporter, and time. It is not itself a direct inventory adjustment. |
| Discrepancy Resolution | An Admin-authorized decision that clears the original in-transit balance and posts confirmed destination, restoration, variance, loss, return, damaged, or supplemental movements. Stock Staff investigates and recommends in the MVP. |
| Handwritten Receipt | The customer-facing manual receipt used by the business. The internal system records its receipt number but does not replace or print it in the MVP. |
| In Transit | Stock that has left the source warehouse but has not yet been accepted into destination branch stock. |
| Inventory Adjustment | An authorized stock movement used to correct a confirmed count or variance. Branch Staff cannot create a posted adjustment directly. |
| Inventory Balance | The current quantity derived from or maintained consistently with recorded inventory movements for one product and location. |
| Inventory Movement | An immutable increase or decrease linked to a reason and source transaction, such as warehouse receipt, sale, transfer dispatch, transfer receipt, reversal, or variance. |
| Manual Receipt Number | The identifier from the handwritten receipt linked to one internal sale. Its uniqueness scope remains to be confirmed. |
| Master Data | Relatively stable records such as products, prices, branches, and users. These may be edited or deactivated according to role permissions. |
| Needs Review | A synchronized operation that represents a real physical event but conflicts with canonical server state and requires Admin or Stock Staff investigation. |
| Notification | A durable per-user server record with an immutable ID and monotonic sequence cursor. Role/branch audiences are expanded deterministically at event time. SSE, polling, and optional browser push are delivery channels. |
| Offline Operation | A branch-scoped action recorded on a registered device while the cloud server cannot be reached and queued for later synchronization. |
| Offline Sale Submission | Immutable server intake of an authenticated offline-sale command. It becomes a canonical sale automatically only after validation; otherwise it remains evidence in `NEEDS_REVIEW`. |
| Offline Snapshot | The last synchronized products, branch stock, transfers, and notifications stored locally with a visible timestamp. It may be stale. |
| Pending Sync | A local operation that has not yet been accepted by the cloud server and must not be presented as globally completed. |
| Primary Offline Device | The physical branch device operationally assigned the one logical server activation permitted to synchronize normal offline sales. Browser storage alone cannot cryptographically prove physical-device uniqueness. |
| Posted Sale | A finalized internal sale that has created sale lines and stock deduction movements. It cannot be silently edited or hard-deleted. |
| Reconciliation Issue | A mismatch reported by Accounting Staff between a system sale and its handwritten receipt. Admin resolves it through verification, void, replacement, or correction. |
| Stock Card | Chronological inventory movement history for one product and location. |
| Stock Staff | Central inventory user who receives warehouse stock, prepares and dispatches transfers, investigates discrepancies, and recommends resolutions. Admin performs final discrepancy posting in the MVP. |
| Stock Transfer | A controlled movement of one or more products from the central warehouse to a branch. |
| System Sale | The internal electronic record entered after a handwritten receipt. Posting it updates dashboard sales and deducts branch inventory. |
| Sync Operation | A queued command identified by device and idempotency key, with a canonical request hash, activation epoch, type, status, dependencies, occurrence time, and business payload. |
| Variance Movement | A separate inventory movement recording a confirmed missing, excess, damaged, loss, or correction quantity during discrepancy resolution. |
| Void and Replace | The recommended correction pattern for a materially incorrect sale: reverse the original through an auditable void, then post a corrected sale. |
| Warehouse | The central stock location from which Stock Staff distributes inventory to branches. |

## Naming Decisions Still Open

- Whether the UI should use `SKU`, `Item Code`, or another business term from the Excel sheet
- Whether the warehouse is modeled as a location type or as a special branch
- Whether `Delivered`, `Received`, and `Confirmed` have distinct operational meanings
- Whether accounting works with individual `Sale Verification` records or a `Daily Closing` record
