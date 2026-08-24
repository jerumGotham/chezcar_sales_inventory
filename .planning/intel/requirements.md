# Requirements

## REQ-sales-posting
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_7AC230E1_START
  Branch Staff enters the sale into the system, including the branch, receipt number, sold items, quantities, prices, and payment information required for monitoring.
  DATA_7AC230E1_END
- acceptance: DATA_B9851D4C_START
  Posting the sale atomically creates the sale and sale lines, deducts branch stock, records inventory movements, and records the user/time. A manual receipt number should be required and unique within its branch or receipt series. The server calculates totals. Posted sales cannot be directly edited or deleted; corrections use a void-and-replace or explicit correction flow with reason, actor, and timestamp.
  DATA_B9851D4C_END
- scope: branch sales, handwritten receipts, inventory

## REQ-warehouse-receiving
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_0DE72F81_START
  Admin or Stock Staff creates a warehouse receipt with a source/reference and item quantities.
  DATA_0DE72F81_END
- acceptance: DATA_A39CB620_START
  Posting the receipt increases warehouse inventory through inventory movement records. The system records who received and posted the stock and when.
  DATA_A39CB620_END
- scope: warehouse receiving, inventory movements

## REQ-transfer-dispatch
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_D17E68A4_START
  The MVP will control stock distribution from a central warehouse to branches.
  DATA_D17E68A4_END
- acceptance: DATA_2B97C041_START
  `IN_TRANSIT`: Stock has physically left the warehouse. Source `-D`; in-transit location `+D` for each dispatched product.
  DATA_2B97C041_END
- scope: warehouse-to-branch transfers, dispatch, in-transit inventory

## REQ-transfer-matched-receipt
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_54A1FE83_START
  On delivery, Branch Staff compares every transfer line against the physical items.
  DATA_54A1FE83_END
- acceptance: DATA_861B4D9E_START
  If all items and quantities match, Branch Staff clicks `Confirm Received - No Discrepancy`. The server posts the destination inventory increase, clears in-transit quantities, marks the transfer `RECEIVED`, and notifies Admin and Stock Staff.
  DATA_861B4D9E_END
- scope: matched transfer delivery, destination inventory

## REQ-transfer-discrepancy
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_3C0D59F2_START
  Branch Staff confirms the actual disposition of every dispatched line, including zero for a missing item, and selects a reason for every mismatch. Additional lines capture excess or wrong SKUs that were not on the original transfer.
  DATA_3C0D59F2_END
- acceptance: DATA_F4A62C18_START
  The transfer becomes `DISCREPANCY_REPORTED`; Admin and Stock Staff are notified. Resolution clears the complete original in-transit quantity, posts actual confirmed destination quantities, and explicitly allocates every difference to source restoration, loss, return, damaged stock, or a supplemental movement. It does not rewrite the original dispatched quantities.
  DATA_F4A62C18_END
- scope: transfer discrepancies, inventory conservation

## REQ-admin-discrepancy-approval
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_95EA407B_START
  Admin approval is not a free-form stock edit. It is one controlled review screen.
  DATA_95EA407B_END
- acceptance: DATA_6F18D3A0_START
  Admin chooses `Approve Resolution`, `Return for Recount`, or `Resolve as Matched`. Every submitted proposal has an immutable version/hash. Approval supplies that version/hash and revalidates it, the transfer version, and current ledger inside the database transaction. The system records proposer, approver, timestamps, notes, and posted movement IDs.
  DATA_6F18D3A0_END
- scope: Admin approval, discrepancy resolution

## REQ-general-stock-discrepancy
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_C573A9E2_START
  This flow covers differences discovered outside an incoming transfer, such as a cycle count, unrecorded sale, damage, loss, or encoding error.
  DATA_C573A9E2_END
- acceptance: DATA_1E8B60C4_START
  Submission creates a report only; it does not change inventory. Stock Staff investigates and records findings and a recommendation. Admin either rejects the report or posts an auditable inventory adjustment with a reason and linked report. Branch Staff is notified of the result.
  DATA_1E8B60C4_END
- scope: physical stock discrepancy, inventory adjustment

## REQ-sales-reconciliation
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_834F2CE7_START
  Accounting compares each system sale's receipt number and total against the corresponding handwritten receipt.
  DATA_834F2CE7_END
- acceptance: DATA_A5D7093F_START
  Accounting marks the individual sale as `VERIFIED` or creates a reconciliation issue with a mismatch reason, expected value, actual value, and notes. Admin reviews the issue and either confirms the system record, voids and replaces the sale, or records another explicit correction. The issue stores the reporter, resolver, timestamps, notes, and linked correction.
  DATA_A5D7093F_END
- scope: sales reconciliation, Accounting Staff, Admin corrections

## REQ-role-authorization
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_09C2EBF5_START
  Branch Staff cannot directly add, subtract, or overwrite inventory, cannot approve or resolve their own discrepancy report, and cannot view other branches unless explicitly authorized. Accounting Staff cannot edit, delete, void, or correct a sale and cannot adjust stock.
  DATA_09C2EBF5_END
- acceptance: DATA_B62E4F71_START
  Role and branch scope must be enforced on the server, not only by hidden UI controls. Notifications are not authorization. The server must independently enforce every action.
  DATA_B62E4F71_END
- scope: roles, authorization, branch scope

## REQ-dashboard-views
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_1B409E6C_START
  The owner, acting as Admin, can see sales and stock across every branch.
  DATA_1B409E6C_END
- acceptance: DATA_E7F23A8D_START
  Admin Dashboard includes today's total sales across all branches, today's sales by branch, transaction count by branch, recent sales and manual receipt numbers, current warehouse and branch stock, low-stock items, transfers for dispatch and in transit, open transfer discrepancies, and open sales reconciliation issues. Branch View includes current assigned-branch stock, incoming transfers, notifications, today's branch sales, and discrepancy status. Accounting View includes sales by date and branch and reconciliation counts/totals.
  DATA_E7F23A8D_END
- scope: dashboard, Admin, Branch Staff, Accounting Staff

## REQ-durable-notifications
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_F9E136A2_START
  MVP notifications are durable and realtime while connected.
  DATA_F9E136A2_END
- acceptance: DATA_24C7D8E1_START
  The business transaction inserts per-user notification rows or a transactional outbox row in the same PostgreSQL transaction. Each notification has an immutable ID plus a database-generated monotonic sequence cursor. Connected clients subscribe to an authenticated same-origin SSE stream. Clients poll for records after their last cursor as a correctness fallback and always fetch missed notifications after reconnecting.
  DATA_24C7D8E1_END
- scope: notifications, SSE, polling, PostgreSQL

## REQ-offline-pwa
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_5A701CDE_START
  The MVP will be an installable Progressive Web App (PWA). Cloud hosting remains the central system of record.
  DATA_5A701CDE_END
- acceptance: DATA_87E4B32A_START
  Offline users can open the cached application shell, view timestamped branch-scoped snapshots, create a branch sale, deduct it from the local stock view, record a transfer physical receipt report as `Pending Sync`, and view queued actions and conflicts. Administration, warehouse receiving and dispatch, final discrepancy resolution, direct inventory adjustment, sale corrections, and current cross-branch reports remain online-only.
  DATA_87E4B32A_END
- scope: offline operation, PWA, branch sales

## REQ-offline-storage
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_D2489AF0_START
  IndexedDB stores only the minimum branch-scoped product/price/stock snapshot and pending-operation queue.
  DATA_D2489AF0_END
- acceptance: DATA_0F6C52B9_START
  No password, reusable bearer token, Admin data, customer PII, or cross-branch data is cached. Each operation receives a client-generated aggregate ID and UUID idempotency key, server-issued device activation epoch, device/branch/user assertions, local occurrence time, operation type, expected record/version references, and payload. A visible sync state accompanies every queued action.
  DATA_0F6C52B9_END
- scope: IndexedDB, offline queue, data minimization

## REQ-sync-protocol
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_7D0EAC34_START
  The device sends queued operations to an authenticated sync endpoint. The server requires fresh online authentication before processing.
  DATA_7D0EAC34_END
- acceptance: DATA_C81F439E_START
  The server validates authorization, branch scope, active device epoch, operation type, schema version, product/price versions, receipt identity, and payload. The database enforces uniqueness on `(deviceId, idempotencyKey)`. The same key and request hash returns the stored result; the same key with a different hash is a hard conflict. SyncOperation intake/result and canonical business writes commit atomically per operation.
  DATA_C81F439E_END
- scope: offline synchronization, idempotency, authentication

## REQ-offline-sale-conflicts
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_42AE690D_START
  An offline sale is different because the customer may already have received the physical item and handwritten receipt.
  DATA_42AE690D_END
- acceptance: DATA_B301F7C8_START
  Every authenticated submission is retained as an immutable `OfflineSaleSubmission`. Invalid or duplicate submissions enter `NEEDS_REVIEW`. If a genuine physical sale fails only because canonical stock is insufficient, the controlled offline exception posts the sale with `stockConflict=true`; book on-hand may become negative only for this exception, available-to-sell is clamped to zero, and a critical discrepancy is created.
  DATA_B301F7C8_END
- scope: offline sales, stock conflict, discrepancy

## REQ-offline-transfer-report
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_638B5D0A_START
  Offline mode records physical evidence only: transfer ID/version, dispatched-line versions, actual disposition for every line, additional wrong/excess SKU lines, notes, and occurrence time.
  DATA_638B5D0A_END
- acceptance: DATA_EA4C8196_START
  A matched report completes the transfer automatically only if it is still `IN_TRANSIT`, versions match, and no receipt report was already accepted. A unique once-only receipt command prevents duplicate completion. A later conflicting report is preserved as evidence and returns `NEEDS_REVIEW`.
  DATA_EA4C8196_END
- scope: offline transfer reports, idempotency

## REQ-audit-integrity
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_16F9B27E_START
  Preserve an audit trail for sales, transfers, discrepancies, and corrections.
  DATA_16F9B27E_END
- acceptance: DATA_7B3EC04A_START
  Every stock change has an immutable inventory movement. Posted sales and dispatched/completed transfers cannot be hard-deleted. Corrections and reversals link to the original transaction and require a reason. Transfer receipt and discrepancy resolution are idempotent. Source and destination changes run in one database transaction where applicable.
  DATA_7B3EC04A_END
- scope: audit trail, inventory movements, transactions

## REQ-mvp-transfer-definition-of-done
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_90D4E5C2_START
  Stock transfer and discrepancy handling are required MVP capabilities.
  DATA_90D4E5C2_END
- acceptance: DATA_A4B75F19_START
  The MVP is not operationally complete until warehouse receiving, multi-item transfer dispatch, in-transit movements, branch notification, matched receipt, discrepant receipt, Stock Staff investigation, Admin resolution, complete in-transit clearing, final role-scoped status/history, persistence, authorization, audit history, and transaction tests work.
  DATA_A4B75F19_END
- scope: MVP completion, transfers, discrepancies

## REQ-deployment-operations
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_2E1C9A83_START
  Host the application through Coolify on the owner's Hetzner infrastructure.
  DATA_2E1C9A83_END
- acceptance: DATA_C4097E5B_START
  Use a dedicated domain with HTTPS. Store production credentials in Coolify secrets. Use PostgreSQL with automated backups. Run committed database migrations during deployment. Add health checks, application logs, and restore-tested database backups before go-live.
  DATA_C4097E5B_END
- scope: deployment, Coolify, Hetzner, PostgreSQL

## REQ-excel-import
- source: docs/product/PRODUCT-REQUIREMENTS.md
- description: DATA_BC8172D4_START
  The stakeholder will provide the current inventory spreadsheet later.
  DATA_BC8172D4_END
- acceptance: DATA_53E9A7F1_START
  Profile product/item codes and duplicates, names, categories, prices, units, warehouse and branch columns, quantities, negative values, statuses, and missing identifiers. Map the spreadsheet into canonical tables rather than copying it directly into the database schema. A physical count should ideally confirm opening stock before go-live.
  DATA_53E9A7F1_END
- scope: Excel import, canonical product data, opening stock
