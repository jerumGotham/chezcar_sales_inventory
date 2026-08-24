# Chezcar Internal Sales and Inventory MVP

**Status:** Working draft for stakeholder confirmation
**Last updated:** 2026-08-24
**Source:** Owner discussion and current UI prototype

> **Current-state warning:** The checked-in application is still a mock UI prototype. The authenticated roles, persistent sales, stock movements, transfer workflow, reconciliation, notifications, and deployment described below are proposed MVP requirements, not implemented behavior.

## Product Summary

Chezcar needs a simple cloud-based internal system for monitoring branch sales and inventory remotely. Customers will continue receiving handwritten receipts. Branch staff will encode each completed sale into the system after writing the receipt, and posting the sale will automatically deduct the sold quantities from that branch's stock.

The MVP will also control stock distribution from a central warehouse to branches. Branch users will view quantities, acknowledge incoming transfers, and report what was physically received, but they will not directly edit inventory balances. Stock Staff will investigate discrepancies and recommend a resolution; Admin will authorize and post the final inventory resolution in the initial MVP.

The owner, acting as Admin, can see sales and stock across every branch. Accounting Staff can compare encoded sales against handwritten receipts and report mismatches without changing sales themselves.

## Problem Statement

The business currently relies on manual receipts and spreadsheet-based inventory updates. Because branches are physically distant, the owner or central team must travel to investigate stock and sales discrepancies. This creates delayed visibility, weak accountability, and uncertainty about whether recorded sales and actual stock agree.

## Goals

1. Show the owner today's sales across all branches from one dashboard.
2. Deduct branch inventory automatically when a sale is posted.
3. Prevent branch users from directly changing stock quantities.
4. Track stock sent from the warehouse through dispatch and branch receipt.
5. Give branch staff a simple matched/discrepancy confirmation flow.
6. Preserve an audit trail for sales, transfers, discrepancies, and corrections.
7. Let Accounting Staff compare each encoded sale with its handwritten receipt.
8. Deploy the system to the owner's Coolify/Hetzner environment under a dedicated domain.
9. Keep essential branch sales and receiving-report workflows usable during temporary internet or server outages.
10. Deliver durable realtime notifications while users are online and catch them up after reconnecting.

## Non-Goals for the MVP

- Customer-facing ordering or account access
- Printing official receipts or invoices
- Replacing handwritten official receipts
- BIR-certified invoicing or accounting functionality
- Complex purchasing, supplier accounting, or general ledger features
- Fully offline administration, warehouse dispatch, master-data changes, or discrepancy resolution
- Customer orders, downpayments, job orders, and advanced CRM unless explicitly added after MVP confirmation
- Hard deletion of posted sales, inventory movements, or completed transfers

The business should confirm tax, receipt-retention, and accounting obligations with its qualified adviser. Calling the system internal does not by itself determine regulatory obligations.

## Roles

### Admin

The Admin represents the owner and has access to all branches.

- View all sales, stock, transfers, discrepancies, users, and audit history
- Manage branches, users, products, prices, and opening stock
- Create and dispatch transfers
- Review and perform the final posting of stock discrepancy resolutions
- Review sales reconciliation issues
- Void or correct posted transactions through controlled actions
- Manage Stock Staff, Branch Staff, and Accounting Staff access

Admin may add, edit, or deactivate master data. Posted transactions must be corrected or voided rather than hard-deleted.

### Stock Staff

- Receive and encode stock arriving at the central warehouse
- View warehouse and branch inventory
- Prepare and dispatch stock transfers to branches
- Receive branch matched/discrepancy notifications
- Investigate transfer discrepancies
- Investigate discrepancies and recommend a resolution to Admin
- View stock movement history

### Branch Staff

"View-only inventory" means Branch Staff cannot directly set or adjust a stock balance. They still need controlled operational actions.

- Encode a sale after issuing the handwritten receipt
- View products and available stock for their assigned branch
- View incoming and in-transit transfers for their branch
- Confirm that delivered stock matches the transfer
- Enter actual received quantities and report missing, excess, damaged, or wrong items
- View the result of discrepancy resolution
- Cannot directly add, subtract, or overwrite inventory
- Cannot approve or resolve their own discrepancy report
- Cannot view other branches unless explicitly authorized

### Accounting Staff

- View sales and receipt details for all authorized branches
- Filter sales by branch and date
- Compare each system sale with its handwritten receipt number and total
- Mark an individual sale as verified
- Report a mismatch with a reason and notes
- Cannot edit, delete, void, or correct a sale
- Cannot adjust stock

## MVP Workflow 1: Sales

1. A customer buys one or more items at a branch.
2. Branch Staff writes the official manual receipt.
3. Branch Staff enters the sale into the system, including the branch, receipt number, sold items, quantities, prices, and payment information required for monitoring.
4. The server validates that sufficient branch stock exists.
5. Posting the sale atomically creates the sale and sale lines, deducts branch stock, records inventory movements, and records the user/time.
6. The Admin dashboard updates today's sales totals for the branch and overall business.
7. The sale enters `UNVERIFIED` reconciliation status until Accounting Staff reviews it against the handwritten receipt.

### Sales Rules

- One posted system sale should correspond to one handwritten receipt.
- A manual receipt number should be required and unique within its branch or receipt series.
- The server calculates totals; the browser must not be the authority for total amounts.
- A sale must not silently drive stock negative. Insufficient stock should block posting and notify Admin/Stock Staff for investigation.
- Posted sales cannot be directly edited or deleted.
- Corrections use a void-and-replace or explicit correction flow with reason, actor, and timestamp.
- A cancellation before physical release or an encoding correction may restore stock through a recorded reversal. A post-release void or refund does not restore sellable stock automatically; it requires a separate inspected return movement, whose detailed workflow is deferred.

The exact timing of encoding relative to releasing the item remains a stakeholder confirmation. The current working assumption is: write the receipt, encode the sale immediately, then complete the internal transaction.

When a sale is physically completed while offline, it cannot be discarded later merely because the server's stock changed before synchronization. Offline sales follow the controlled exception in the Offline Operation section: the server records the real sale, flags any stock conflict, and creates an Admin reconciliation task.

## MVP Workflow 2: Warehouse Receipt

1. Stock arrives at the central warehouse.
2. Admin or Stock Staff creates a warehouse receipt with a source/reference and item quantities.
3. Posting the receipt increases warehouse inventory through inventory movement records.
4. The system records who received and posted the stock and when.

Supplier purchasing and accounts payable are outside the MVP. A text reference or uploaded document can be added later if needed.

## MVP Workflow 3: Warehouse-to-Branch Transfer

### Transfer Lifecycle

| Status | Meaning | Inventory effect |
| --- | --- | --- |
| `DRAFT` | Stock Staff is preparing the transfer | None |
| `FOR_DISPATCH` | Transfer is finalized and visible to the destination branch | None; optional warehouse reservation can be added later |
| `IN_TRANSIT` | Stock has physically left the warehouse | Source `-D`; in-transit location `+D` for each dispatched product |
| `RECEIVED` | Branch confirmed all items and quantities match | In-transit `-D`; destination `+D` |
| `DISCREPANCY_REPORTED` | Branch reported missing, excess, damaged, or wrong items | Do not post destination stock yet; preserve the reported actual quantities for review |
| `UNDER_REVIEW` | Stock Staff or Admin is investigating | No additional stock effect |
| `PENDING_ADMIN_APPROVAL` | Stock Staff submitted findings and proposed movements | No additional stock effect |
| `RECOUNT_REQUIRED` | Admin returned the case for another physical check | No additional stock effect |
| `RESOLVED` | Admin approved and posted the actual outcome | Add confirmed actual quantities to destination and post separate variance/reversal movements as required |

### Matched Delivery

1. Branch Staff receives an in-app notification that a transfer is for dispatch or in transit.
2. On delivery, Branch Staff compares every transfer line against the physical items.
3. If all items and quantities match, Branch Staff clicks `Confirm Received - No Discrepancy`.
4. The server posts the destination inventory increase, clears in-transit quantities, marks the transfer `RECEIVED`, and notifies Admin and Stock Staff.

### Discrepant Delivery

1. Branch Staff selects `Report Discrepancy` instead of confirming receipt.
2. Branch Staff confirms the actual disposition of every dispatched line, including zero for a missing item, and selects a reason for every mismatch: missing quantity, excess quantity, wrong item, damaged item, or other. Additional lines capture excess or wrong SKUs that were not on the original transfer.
3. The transfer becomes `DISCREPANCY_REPORTED`; Admin and Stock Staff are notified.
4. Stock Staff investigates the warehouse, dispatch documents, transport, and branch delivery, then records a recommended resolution.
5. Admin reviews the findings and performs the final resolution posting.
6. Resolution clears the complete original in-transit quantity, posts actual confirmed destination quantities, and explicitly allocates every difference to source restoration, loss, return, damaged stock, or a supplemental movement. It does not rewrite the original dispatched quantities.

### Admin Final Approval

Admin approval is not a free-form stock edit. It is one controlled review screen:

1. Stock Staff opens the discrepancy, performs the physical/document check, and records findings.
2. Stock Staff proposes the actual quantity to receive and the resolution for every variance. The system calculates a read-only movement preview showing source, in-transit, destination, damaged/loss, and restoration effects per item.
3. Stock Staff submits the case as `PENDING_ADMIN_APPROVAL`. No inventory changes are posted yet.
4. Admin reviews the original dispatch, branch-reported actual count, reason/evidence, Stock Staff findings, and exact movement preview.
5. Admin chooses one action:
   - `Approve Resolution`: atomically post the exact versioned previewed movements and mark `RESOLVED`;
   - `Return for Recount`: require new counts/notes and mark `RECOUNT_REQUIRED`; or
   - `Resolve as Matched`: record why the discrepancy was not confirmed, post the normal matched receipt movements (`in-transit -D`, `destination +D`), and mark `RESOLVED` with no variance movement.
6. Every submitted proposal has an immutable version/hash. Approval supplies that version/hash and revalidates it, the transfer version, and current ledger inside the database transaction. If the proposal, transfer, or ledger changed after the preview, approval stops and requires a refreshed proposal and review.
7. The system records proposer, approver, timestamps, notes, and posted movement IDs, then notifies Branch Staff and Stock Staff.

If Admin personally performs the investigation, Admin may enter the findings and approve the resolution in the same screen. Branch Staff can never approve, and Stock Staff cannot post a final discrepancy adjustment in the initial MVP.

### Required Ledger Balance

For each product, let `D` be dispatched quantity and `A` be confirmed actual receipt:

- Dispatch: source `-D`, in-transit `+D`.
- Matched receipt: in-transit `-D`, destination `+D`.
- Short receipt: in-transit `-D`, destination `+A`, then allocate `D-A` to source restoration, recorded transit loss, return, or another named resolution location.
- Excess receipt: clear the original in-transit quantity, deduct the confirmed supplemental quantity from its identified source, and receive the full confirmed quantity at destination.
- Wrong item: account for expected and actual SKUs independently; clear the expected SKU from transit to its resolved destination/loss/return and deduct/receive the actual SKU from its confirmed source.

Every resolution must leave no unexplained in-transit balance. It must conserve quantity across physical locations, explicit loss/write-off movements, and corrections.

### Recommended Resolution Types

| Finding | Resolution |
| --- | --- |
| Short quantity remained at warehouse | Post a source restoration for the missing quantity because dispatch already deducted it, receive the actual quantity at destination, and optionally create a follow-up transfer |
| Short quantity lost or unexplained | Receive actual quantity at destination, clear the complete transit quantity, and allocate the missing amount to an authorized transit loss/variance movement without deducting source twice |
| Extra quantity was physically sent | Receive actual quantity and post a supplemental transfer movement so source and destination agree |
| Wrong item was sent | Record the actual item received, keep the expected item short, then create a return or corrective transfer as appropriate |
| Damaged item arrived | Receive it into a non-sellable/damaged state if that state is included; otherwise keep it pending until Admin decides return or write-off |
| Counting or encoding error only | Post a correction movement with a reason; never overwrite movement history |

For the simplest first release, Stock Staff investigates and recommends on one review screen; Admin performs the final resolution posting. This is one review-and-approval step, not a configurable multi-level approval engine.

## MVP Workflow 4: General Physical Stock Discrepancy

This flow covers differences discovered outside an incoming transfer, such as a cycle count, unrecorded sale, damage, loss, or encoding error.

1. Branch Staff may report a discrepancy for their assigned branch; Stock Staff or Admin may report one for the warehouse or any location within their scope. The reporter submits the item, system quantity, actual counted quantity, variance, reason, and notes.
2. Submission creates a report only; it does not change inventory.
3. Stock Staff investigates and records findings and a recommendation.
4. Admin either rejects the report or posts an auditable inventory adjustment with a reason and linked report.
5. Branch Staff is notified of the result.

This is intentionally a simple report-investigate-resolve flow, not a general approval engine.

## MVP Workflow 5: Sales Reconciliation

1. Accounting Staff opens sales for a branch and date.
2. Accounting compares each system sale's receipt number and total against the corresponding handwritten receipt.
3. If correct, Accounting marks the individual sale as `VERIFIED`.
4. If incorrect, Accounting creates a reconciliation issue with a mismatch reason, expected value, actual value, and notes.
5. Admin reviews the issue and either confirms the system record, voids and replaces the sale, or records another explicit correction.
6. The issue stores the reporter, resolver, timestamps, notes, and linked correction.

The dashboard may aggregate verified/unverified totals by day, but a separate daily-closing record and cash-collection reconciliation are deferred until payment and closing requirements are confirmed.

### Suggested Mismatch Reasons

- Missing system sale for an existing receipt
- Duplicate system sale or receipt number
- Wrong item or quantity
- Wrong sale total or price
- Wrong payment method
- Void/cancelled handwritten receipt not reflected in the system
- Other with required notes

Accounting Staff reports and validates; Accounting does not silently edit sales or stock. This separates validation from correction and preserves accountability.

## Dashboard Requirements

### Admin Dashboard

- Today's total sales across all branches
- Today's sales by branch
- Transaction count by branch
- Recent sales and manual receipt numbers
- Current warehouse and branch stock
- Low-stock items
- Transfers for dispatch and in transit
- Open transfer discrepancies
- Open sales reconciliation issues

### Branch View

- Current stock for assigned branch
- Incoming transfers and current status
- Notifications requiring delivery confirmation
- Branch sales entered today
- Submitted discrepancy reports and their resolution status

### Accounting View

- Sales by date and branch
- Manual receipt number, total, and encoded-by user; payment method is included only if confirmed for MVP
- Unverified, verified, and mismatch counts/totals
- Daily reconciliation summary

## Notifications

MVP notifications are durable and realtime while connected:

- The business transaction inserts per-user notification rows or a transactional outbox row that deterministically expands the event to its recipients at event time, in the same PostgreSQL transaction. Delivery starts only after commit.
- Each notification has an immutable ID plus a database-generated monotonic sequence cursor that provides total ordering. SSE, polling, and push are at-least-once delivery channels, and clients deduplicate by notification ID.
- Connected clients subscribe to an authenticated same-origin SSE stream using secure session cookies. The stream sends notification IDs and supports cursor-based replay after reconnecting.
- Clients poll for records after their last cursor as a correctness fallback and always fetch missed notifications after reconnecting.
- `createdAt`, user `readAt`, and channel delivery attempts are separate. Writing an SSE event or accepting a push does not prove that the user saw it.
- Browser push may be enabled for urgent events when the app is closed and the device is online. It is best effort and carries only minimal non-sensitive identifiers; the app fetches authorized details from the durable notification table.
- Realtime delivery requires connectivity. While offline, the app shows its last synchronized notifications and receives all missed durable notifications when it reconnects.

- Destination Branch Staff: transfer marked for dispatch or in transit
- Admin and Stock Staff: branch confirmed matched receipt
- Admin and Stock Staff: branch reported a discrepancy
- Branch Staff: discrepancy resolved
- Admin: Accounting reported a sales mismatch
- Accounting: Admin resolved a reconciliation issue

Notifications are not authorization. The server must independently enforce every action.

## Offline Operation

The MVP will be an installable Progressive Web App (PWA). Cloud hosting remains the central system of record, while one logical server activation per branch is permitted to synchronize normal offline sales. Operationally, that activation is assigned to one primary branch device. Without WebAuthn or another non-exportable device-bound key, a browser cannot prove that copied storage came from one physical device; the server therefore enforces activation at synchronization and routes stale-epoch submissions to review.

### Available Offline

- Open the cached application shell after at least one successful online sign-in
- View the last synchronized product list and assigned-branch stock snapshot, clearly labeled with its last-sync time
- Create a branch sale against the local snapshot and manual receipt number
- Deduct that sale from the device's local stock view
- Record a transfer physical receipt report as `Pending Sync`; this does not transition the canonical transfer while offline
- View queued actions, sync status, and any conflicts requiring attention

### Online-Only Actions

- User, role, branch, product, and price administration
- Warehouse receiving and transfer dispatch
- Final transfer receipt posting and final discrepancy resolution
- Direct inventory adjustment and opening-balance changes
- Sale void/correction and accounting mismatch resolution
- Reports that require current cross-branch totals

An offline branch confirmation or discrepancy report is a local pending operation until the server accepts it. The UI must never label it as globally completed while offline.

### Local Storage and Queue

- A service worker caches versioned application assets and approved read snapshots.
- IndexedDB stores only the minimum branch-scoped product/price/stock snapshot and pending-operation queue. Browser storage is not treated as a secure vault: no password, reusable bearer token, Admin data, customer PII, or cross-branch data is cached.
- Each operation receives a client-generated aggregate ID and UUID idempotency key, server-issued device activation epoch, device/branch/user assertions, local occurrence time, operation type, expected record/version references, and payload.
- A visible `Offline`, `Pending Sync`, `Syncing`, `Synced`, or `Needs Review` state accompanies every queued action.
- Browser Background Sync may be used where supported, but the app must also retry when it opens, regains focus, or receives an `online` event because Background Sync support is not universal.

### Synchronization Rules

1. The device sends queued operations to an authenticated sync endpoint. The server requires fresh online authentication before processing.
2. The server validates current user authorization, branch scope, active device epoch, operation type, schema version, product/price versions, receipt identity, and payload. Device and user IDs from IndexedDB are untrusted assertions.
3. The server canonicalizes the validated operation and independently computes its request hash. The database enforces uniqueness on `(deviceId, idempotencyKey)` and stores operation type, server-computed hash, processing status, canonical result, and resulting record IDs.
4. The same key and request hash returns the stored result. The same key with a different hash is a hard conflict and never executes again.
5. The SyncOperation intake/result and all canonical business writes commit atomically in one database transaction per operation, while order is preserved per client-generated aggregate. Explicit client aggregate IDs express dependencies; one poison operation does not block unrelated records.
6. Each result is `ACCEPTED`, `ALREADY_ACCEPTED`, `RETRYABLE`, `REJECTED`, or `NEEDS_REVIEW`. Accepted local queue entries remain until the canonical response is durably stored on the device.
7. Operations that depend on a failed prerequisite remain pending or enter `NEEDS_REVIEW`; they are not silently skipped.
8. Reconnecting refreshes canonical branch stock, prices, transfers, sales, device status, and notifications after the last cursor.

### Offline Sales Conflict Rule

Normal online sales remain blocked when available stock is insufficient. An offline sale is different because the customer may already have received the physical item and handwritten receipt.

1. Before accepting the sale locally, the device checks its last-synchronized stock minus other queued local sales.
2. The local command includes captured unit prices and IDs of immutable server-held price-version records downloaded in the snapshot. The server verifies each amount against that stored version, performs decimal/centavo arithmetic itself, and does not trust a submitted total or silently substitute a newer price.
3. On sync, every authenticated submission is retained as an immutable `OfflineSaleSubmission`, even when it cannot become a canonical sale automatically.
4. If authorization, receipt uniqueness, product/price version, payload, and canonical stock rules pass, the server posts the canonical sale and movements.
5. A duplicate receipt, invalid payload, deactivated item, expired/disallowed price snapshot, or inactive device epoch enters `NEEDS_REVIEW` without creating a duplicate or invalid canonical sale.
6. If the submission represents a genuine physical sale and only canonical stock is insufficient, the controlled offline exception posts the sale with `stockConflict=true`. The book on-hand may become negative only for this exception, while `availableToSell = max(onHand - reserved, 0)`, and a critical discrepancy is created.
7. Admin resolves the conflict through a physical count or an identified missing upstream movement; a generic adjustment must not merely hide the negative balance.

Normal online sales, dispatches, receipts, and adjustments retain the non-negative stock rule. The controlled negative exception applies only to an accepted offline physical-sale conflict.

### Offline Transfer Report Rule

- Offline mode records physical evidence only: transfer ID/version, dispatched-line versions, actual disposition for every line, additional wrong/excess SKU lines, notes, and occurrence time.
- On sync, a matched report completes the transfer automatically only if it is still `IN_TRANSIT`, versions match, and no receipt report was already accepted.
- A unique once-only receipt command prevents duplicate completion.
- If another report or state transition won first, preserve the later report as evidence and return `NEEDS_REVIEW`; never overwrite or discard it.
- Final discrepant inventory resolution remains online-only and must clear the full transit ledger as defined above.

### Primary Device Constraint

- The server permits one active logical offline-sales activation epoch per branch for the MVP; operations are bound to it during synchronization. The business assigns that activation to one physical device operationally.
- A replacement is not activated until the old device queue is synchronized and the old epoch is retired.
- Emergency replacement invalidates future normal sync from the old epoch, but its authenticated submissions remain ingestible as evidence and enter `NEEDS_REVIEW` rather than disappearing.
- A device ID is an audit identifier, not a credential. Concurrent multi-device offline selling is deferred because browser-only locking cannot prevent overselling.

### Offline Authentication and Security

- A device must complete an online sign-in and server activation before offline mode is available. Online sessions use secure `HttpOnly`, `SameSite` cookies.
- The cached UI applies a best-effort branch-scoped offline window; 24 hours from the last successful server sync is the proposed initial maximum. The authoritative server policy uses its own last-sync/activation timestamps when commands arrive, not the device clock. Submissions received outside the permitted window are preserved as `NEEDS_REVIEW` rather than automatically posted.
- Local logout immediately clears IndexedDB, Cache Storage, pending snapshots, and service-worker-controlled branch data after warning about unsynchronized operations.
- Remote revocation becomes effective when the device reconnects; it cannot erase an already-offline browser remotely.
- Sensitive Admin and cross-branch data is not cached for offline use.
- Device clocks are not trusted as server posting time. Store both `occurredAt` from the device and `receivedAt` from the server.
- Strict Content Security Policy, output encoding, dependency control, data minimization, and tested service-worker updates are the primary browser protections. IndexedDB encryption with a key available to the same origin is not treated as protection against XSS.

## Audit and Data Integrity Rules

1. Every stock change must have an immutable inventory movement with type, item, quantity, location, reference, actor, and timestamp.
2. Branch Staff cannot call a server operation that directly sets stock quantity.
3. Posted sales and dispatched/completed transfers cannot be hard-deleted.
4. Corrections and reversals must link to the original transaction and require a reason.
5. A transfer receipt or discrepancy resolution must be idempotent so double-clicks cannot add stock twice, and every resolution must clear the original in-transit balance.
6. Source and destination stock changes must run in one database transaction where applicable.
7. Role and branch scope must be enforced on the server, not only by hidden UI controls.
8. Admin access to edit or delete applies to suitable master data; transaction history remains auditable.
9. Every online or offline mutation has an idempotency key where retries are possible; offline operations carry a device epoch and the server computes the authoritative canonical request hash after validation.
10. The triggering business transaction persists a per-recipient notification or transactional outbox row before commit; realtime or push delivery starts only afterward.
11. Offline UI state must identify the snapshot age and pending operations; cached data must never appear current without a last-sync indicator.
12. Normal operations preserve non-negative stock. Only an accepted offline physical-sale conflict may produce a negative book balance, and it must open a discrepancy.

## MVP Definition of Done

Stock transfer and discrepancy handling are required MVP capabilities. The MVP is not operationally complete until all of these work with persistence, authorization, audit history, and transaction tests:

1. Admin or Stock Staff receives stock into the warehouse.
2. Stock Staff creates and dispatches a multi-item warehouse-to-branch transfer.
3. Dispatch moves stock from warehouse to in-transit inventory.
4. Branch Staff sees the incoming transfer and receives a realtime/catch-up notification.
5. A matched branch confirmation posts destination stock automatically.
6. A discrepant confirmation records actual quantities without changing stock directly.
7. Stock Staff investigates and submits a movement proposal.
8. Admin approves the proposed variance resolution, returns it for recount, or resolves the report as a normal matched receipt.
9. Approved resolution clears the complete in-transit ledger and posts the auditable final movements.
10. All involved users can see the final status and history according to role and branch scope.

## Delivery Sequence

The complete MVP above is built in implementation waves. The foundation now includes authentication, database runtime, migration history, and read-only product/inventory access; mutation APIs and automated tests are still absent. A later wave is not an optional product feature; it is sequencing needed to build safely:

1. Canonical PostgreSQL models, migrations, authentication, four roles, branch authorization, inventory ledger, product import, and online-only sales
2. Required MVP warehouse receiving, transfers, discrepancy investigation/Admin approval, dashboard, and receipt-level accounting reconciliation
3. Durable notification table/outbox with cursor-based polling and audit history
4. Authenticated SSE as a realtime delivery optimization with replay and polling fallback
5. Single-primary-device offline sales pilot, immutable submission intake, sync protocol, and conflict review
6. Offline transfer physical reports after offline sales synchronization is proven
7. Best-effort browser push and multi-device offline support only if later required

## Deployment and Operations

- Host the application through Coolify on the owner's Hetzner infrastructure.
- Use a dedicated domain with HTTPS.
- Store production credentials in Coolify secrets, never in Git.
- Use managed or carefully operated PostgreSQL with automated backups.
- Run committed database migrations during deployment.
- Add health checks, application logs, and restore-tested database backups before go-live.
- Keep the patched Next.js baseline current and rerun production dependency audits before deployment.
- Run SSE in the Node runtime with `text/event-stream`, `Cache-Control: no-cache, no-transform`, heartbeat comments below proxy idle timeouts, reconnect backoff/jitter, and proxy-specific buffering controls verified against the actual Coolify proxy.
- Persist notifications and sync operations in PostgreSQL; realtime connections are delivery mechanisms, not storage.
- Use one dedicated `node-postgres` `LISTEN/NOTIFY` connection per Node application instance as a live wake-up backplane while retaining durable-table cursor catch-up after listener restarts; sticky sessions are not a correctness mechanism.
- Serve the PWA manifest and service worker over HTTPS and test update/rollback behavior so an old cached client cannot submit an incompatible payload.

## Chosen Technical Architecture

- Next.js App Router remains the web application and HTTP backend.
- Business APIs use `app/api/**/route.ts` route handlers.
- Prisma is used only in server code for PostgreSQL access and migrations.
- PostgreSQL is the authoritative cloud database.
- Thin route handlers call validated, authorized application services that own transaction boundaries.
- TanStack Query and the offline sync client consume typed API contracts rather than page-local mock functions.
- TanStack Query owns API-backed frontend state; local React state owns temporary UI state, and URL parameters own shareable filters and pagination.
- Native `fetch` is the default HTTP client. Axios is not required without a concrete interceptor, upload-progress, or external-SDK need.
- Zod and React Hook Form are the proposed form/validation stack.
- IndexedDB is authoritative for durable offline queues and snapshots; Zustand is optional for small cross-route UI state and must not duplicate server or offline records.
- The provisional schema in [PROVISIONAL-DATA-MODEL.md](PROVISIONAL-DATA-MODEL.md) starts from current fields and confirmed workflows, then evolves after Excel analysis.

See [ADR 0005](../adr/0005-nextjs-api-prisma-postgresql.md) for the accepted technical decision.
See [ADR 0006](../adr/0006-frontend-state-and-data-stack.md) for the proposed frontend state and data stack.
See [ADR 0007](../adr/0007-backend-services-and-realtime-delivery.md) for the accepted backend services and realtime delivery stack.

## Excel Import

The stakeholder will provide the current inventory spreadsheet later. Before implementation, profile it for:

- Product/item codes and duplicates
- Product names, categories, prices, and units
- Warehouse and branch columns
- Current quantities and negative values
- Status or damaged-stock representations
- Missing identifiers and inconsistent naming

The spreadsheet should inform the canonical product and opening-balance import, but it should not be copied directly into the database schema without normalization and validation. A physical count should ideally confirm opening stock before go-live.

## Deferred Decisions

1. Exact number and names of branches; the discussion may indicate five, but this requires confirmation.
2. Whether sale entry must occur before item release or immediately after the handwritten receipt.
3. Required payment methods and whether payment totals are part of MVP reconciliation.
4. Whether damaged inventory needs a separate sellable/non-sellable location in the MVP.
5. Whether a later version may delegate final discrepancy posting to Stock Staff; the MVP recommendation keeps final posting with Admin.
6. Whether a later version adds daily closing and actual cash/collection reconciliation; the MVP recommendation verifies individual receipts only.
7. Whether receipt numbers are unique per branch, per receipt booklet/series, or globally.
8. Whether historical sales will be imported or only products and opening stock.
9. Whether customer, customer-order, and job-order modules remain outside the initial release.
10. Final offline access duration; 24 hours is the working recommendation.
11. Maximum offline queue age and the manual recovery procedure if browser storage is lost.
12. Whether browser push is required after the realtime/offline pilot; it is not required for the first online release.
13. Whether a later release must support multiple simultaneous offline sales devices despite the accepted overselling risk.

These questions should be asked after the stakeholder reviews this simplified workflow. They do not block documenting the current product direction.
