# Chezcar Domain Glossary

**Status:** Working glossary
**Last updated:** 2026-08-26

| Term | Working definition |
| --- | --- |
| Admin | The single owner account in the MVP, with visibility across all branches and authority to manage non-Admin users, master data, corrections, and discrepancy resolution. Posted transactions remain auditable even for Admin. |
| Accounting Staff | A business-wide read/reconciliation role that compares every system sale line, quantity, price, discount, payment, and total with its handwritten receipt. It may verify or report mismatches but cannot edit sales or stock. Formal daily cash-collection closing is deferred. |
| Actual Received Quantity | The physical quantity counted by an individually authenticated Branch Staff user assigned to the destination branch. It may differ from the dispatched quantity. |
| Available Stock | Sellable quantity at one location after excluding stock in non-sellable states. The MVP never permits a posted sale to make stock negative, including during offline synchronization. In-transit stock is separately accountable and is unavailable at both source and destination until receipt is posted. |
| Branch | A retail location that sells items and receives stock from the central Stock Room. |
| Branch Staff | A branch-scoped user who records sales, views branch inventory, confirms transfer receipt, and reports discrepancies. This role cannot directly adjust stock balances. |
| Customer Order | A branch customer commitment for reserved stock, reserved stock with downpayment, or waiting-stock/special-order fulfillment. It requires customer identity and is completed through final release. |
| Correction | A new auditable action that fixes a posted transaction without rewriting its original history. |
| Daily Reconciliation | An informational dashboard summary of individual receipt-level verification for a branch and date. It is not a submitted closing. Formal daily closing and actual-cash reconciliation are deferred. |
| Discrepancy | In the MVP, a difference between an `SR` transfer dispatch and the destination branch's physical count or item identity. Standalone cycle-count and general physical-stock discrepancy workflows are deferred. |
| Discrepancy Report | A branch-submitted record containing the actual disposition of every dispatched line, any additional wrong/excess SKU lines, discrepancy type, notes, reporter, and time. It is not itself a direct inventory adjustment. |
| Discrepancy Resolution | An Admin-authorized decision that clears the original in-transit balance and posts confirmed destination, restoration, variance, loss, return, damaged, or supplemental movements. Stock Staff investigates and recommends in the MVP. |
| Discount | A free-form amount or percentage entered by Branch Staff on a sale. The posted sale preserves base price, discount, and final price for Accounting verification; no discount reason or prior approval is required in the MVP. |
| Handwritten Receipt | The customer-facing manual receipt used by the business. The internal system records its receipt number but does not replace or print it in the MVP. |
| In Transit | Stock that has left `SR` but has not yet been accepted into destination branch stock. The transfer remains `IN_TRANSIT` while the branch physically checks it; there is no separate `DELIVERED` status. |
| Inventory Adjustment | An authorized stock movement used to correct a confirmed count or variance. Branch Staff cannot create a posted adjustment directly. |
| Inventory Balance | The current quantity derived from or maintained consistently with recorded inventory movements for one product and location. |
| Inventory Correction | An Admin-only manual inventory adjustment with required reason/note, used for wrong opening balance, found/lost/damaged stock, or physical count mismatch not tied to a transfer. |
| Inventory Movement | An immutable increase or decrease linked to a reason and source transaction, such as Stock Room receipt, sale, transfer dispatch, transfer receipt, reversal, or variance. |
| Manual Receipt Number | The identifier from the handwritten receipt linked to an internal downpayment, final order release, or direct sale. It is globally unique across the company in the locked production workflow. |
| Reservation | A customer order state that holds available branch stock by increasing reserved quantity while keeping physical on-hand stock unchanged until final release. |
| Master Data | Relatively stable records such as products, prices, branches, and users. These may be edited or deactivated according to role permissions. |
| Non-sellable Stock | Physically accountable stock that cannot be sold, including damaged goods pending resolution. Damage, return, loss, and write-off remain explicit movement reasons or resolution outcomes rather than separate sellable balances. |
| Needs Review | A synchronized or aged offline operation that represents a real physical event but cannot be posted automatically and requires authenticated Admin or Stock Staff investigation. It is never silently discarded. |
| Notification | A durable per-user server record that alerts a responsible user about an actionable workflow event or final outcome. Read state belongs to the recipient user. Notification creation is partial evidence that the system attempted to inform the user, while the business audit remains the stock-transfer timeline and inventory movements. Browser push, realtime delivery, escalation, and cross-user notification audit are deferred. |
| Offline Operation | A branch-scoped action recorded on a registered device while the cloud server cannot be reached and queued for later synchronization. |
| Offline Sale Submission | Immutable server intake of an authenticated offline-sale command. It becomes a canonical sale only when validation, including the non-negative-stock rule, succeeds; otherwise it remains evidence in `NEEDS_REVIEW`. |
| Offline Snapshot | The last synchronized products, branch stock, transfers, and notifications stored locally with a visible timestamp. It may be stale. |
| Pending Sync | A local operation that has not yet been accepted by the cloud server and must not be presented as globally completed. If it ages beyond the allowed synchronization period, it is preserved and routed to `NEEDS_REVIEW` rather than discarded or posted automatically. |
| Primary Offline Device | The physical branch device operationally assigned the one logical server activation permitted to synchronize offline sales and transfer receipt/discrepancy evidence. Browser storage alone cannot cryptographically prove physical-device uniqueness. |
| Product | A sellable or historically accountable item identified by a unique item code. Active products require a positive current price; inactive products remain visible for inventory/history but cannot be selected for new business flows. |
| Posted Sale | A finalized internal sale that has created sale lines and stock deduction movements. It cannot be silently edited or hard-deleted. |
| Reconciliation Issue | A mismatch reported by Accounting Staff between any system sale line, quantity, price, discount, payment, total, or receipt identity and the handwritten receipt. Admin resolves it through verification, void, replacement, or correction. |
| Received Transfer | A transfer for which assigned Branch Staff submitted a complete physical count and confirmed that every item and quantity matches the `SR` dispatch. A mismatch does not become `RECEIVED`; it enters the discrepancy path. There is no separate `CONFIRMED` status. |
| Stock Card | Chronological inventory movement history for one product and location. |
| Stock Room | The central non-retail inventory location identified by `SR`. All MVP replenishment enters the Stock Room before Stock Staff dispatches stock to a branch. |
| Stock Staff | Central inventory user who operates Stock Room receiving and dispatch, views destination-branch stock and receipt evidence for transfer investigation, investigates discrepancies, and recommends resolutions. This role cannot record branch sales or directly manage ordinary branch stock. Admin performs final discrepancy posting in the MVP. |
| Stock Transfer | A Stock Staff-initiated allocation of one or more products from `SR` to a branch. The MVP has no branch-request or branch-to-branch transfer path. |
| System Sale | The internal electronic record encoded after the handwritten receipt is written and goods are released. A successful posting immediately updates system sales totals and deducts branch inventory. |
| User Account | An individual employee identity. Shared branch credentials are not allowed because every business action must remain attributable to one person. |
| Sync Operation | A queued command identified by device and idempotency key, with a canonical request hash, activation epoch, type, status, dependencies, occurrence time, and business payload. |
| Variance Movement | A separate inventory movement recording a confirmed missing, excess, damaged, loss, or correction quantity during discrepancy resolution. |
| Void and Replace | The recommended correction pattern for a materially incorrect sale: reverse the original through an auditable void, then post a corrected sale. |
| Warehouse | Legacy synonym for Stock Room. Owner-facing language should use Stock Room and code `SR`. |

## Naming Decisions Still Open

- Whether the UI should use `SKU`, `Item Code`, or another business term from the Excel sheet
