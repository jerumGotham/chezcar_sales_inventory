# Chezcar Sales and Inventory MVP

**Status:** Confirmed MVP process
**Last updated:** 2026-08-30
**Source:** Owner discussion, real inventory workbook, and current UI prototype

> **Current-state warning:** The checked-in application is still partly a UI prototype. Authentication, Product/Inventory reads, user management, Stock Room receiving, SR-to-branch transfers/discrepancy resolution, Customer Orders, direct sales, dashboard production metrics, Accounting verification, durable notifications, browser push attempts, and limited offline direct-sale sync have a PostgreSQL-backed foundation. Offline transfer receipt/discrepancy capture, deployment operations, and remaining advanced/deferred screens are not complete until implemented and verified.

## Product Summary

Chezcar needs a simple cloud-based internal system for monitoring sales and inventory across one central Stock Room and five branches. Customers continue receiving handwritten receipts. After goods are released, Branch Staff encodes the receipt in the system; successful posting deducts branch stock immediately and updates Admin monitoring.

Stock Staff records stock received into `SR`, dispatches stock from `SR` to a branch, and records the dispatch in the system. The destination branch is notified in real time. Branch Staff compares the physical delivery with the transfer and either confirms an exact match or submits a discrepancy form. Stock Staff investigates discrepancies; Admin makes the final stock correction.

The system has four built-in roles, delegable action-based user and role management, explicit owner identity, authoritative multi-location assignments, dashboards, low-stock monitoring, durable real-time notifications, and limited branch offline continuity for temporary internet outages.

## Confirmed Locations

- `SR` - central Stock Room; not a retail branch
- `QC` - branch
- `BL` - branch
- `LU` - branch
- `VC` - branch
- `SP` - branch

All MVP replenishment enters `SR`. Transfers are `SR` to branch only. Branch-to-branch transfers and direct supplier-to-branch receipts are deferred.

## Goals

1. Give Admin one dashboard for current sales, stock, transfers, discrepancies, and low-stock items.
2. Deduct branch stock automatically when Branch Staff posts a manual-receipt sale.
3. Keep Branch Staff from directly editing stock balances.
4. Track stock from `SR` dispatch through branch confirmation or discrepancy.
5. Notify actionable users immediately and preserve notifications for reconnect/catch-up.
6. Let Accounting verify every encoded sale against its handwritten receipt.
7. Keep essential branch sale and transfer-receipt work usable during temporary outages.
8. Enforce persisted role capabilities, operational location scope, and individual user accounts on the server.
9. Let Admin create, update, and deactivate users without hard-deleting audit identity.
10. Seed canonical product, price, location, and initial inventory data from the supplied workbook after reviewed mapping and cleanup.

## MVP Scope

### Included

- Product, price, location, and opening-inventory onboarding from the real workbook
- Four built-in roles, custom assignable roles, and server-enforced capability grants
- Admin User Management: create, view, update, deactivate, credential reset/setup
- Manual-receipt sales encoding
- Immediate branch stock deduction and dashboard updates after successful posting
- Admin dashboard and role-scoped operational views
- Low-stock monitoring and notifications
- Stock Room receiving
- `SR`-to-branch dispatch
- Branch transfer confirmation or discrepancy form
- Stock Staff investigation and Admin final discrepancy resolution
- Individual-receipt Accounting verification
- Durable in-app, live, and browser-push notifications
- Limited offline branch sales and transfer confirmation/discrepancy capture
- Audit history for stock-changing and corrective actions
- Production deployment, backup, restore, and monitoring

### Deferred

- Inquiry-only CRM/leads, Job Orders, and advanced CRM
- Branch-to-branch transfers
- Direct supplier delivery to branches
- Customer return, exchange, and refund workflow
- Standalone cycle-count and general physical-stock discrepancy workflow
- Formal daily cash/collection closing
- Shared branch accounts
- Multiple simultaneous offline-operation devices per branch
- Fully offline Admin, Stock Room, master-data, or final discrepancy actions
- Customer-facing ordering, official receipt printing, and BIR-certified accounting
- Hard deletion of users with history or any posted business transaction

## Roles

### Admin

- The MVP has one owner Admin account; User Management does not create additional Admin accounts
- View all branches, sales, stock, transfers, discrepancies, low-stock alerts, users, and audit history
- Create and update Stock Staff, Branch Staff, and Accounting Staff accounts
- Assign a persisted non-owner role and one or more active operational locations unless the role grants `locations:all`
- Create and edit non-owner action-only roles; changing grants revokes assigned users' sessions
- Deactivate users instead of hard-deleting their identity
- Manage products, prices, locations, Stock Room receiving, Stock Staff transfer actions when operational cover is needed, and controlled corrections
- Review unverified receipts as operational cover for Accounting
- Resolve final stock discrepancies after Stock Staff investigation
- Resolve Accounting mismatch reports
- Resolve Branch-originated direct-sale correction requests; only approval posts the reversal

### Stock Staff

- Receive stock into `SR`
- View `SR`, branch stock needed for transfer work, and transfer history
- Prepare and dispatch stock from `SR` to a branch
- Receive branch receipt/discrepancy notifications
- Investigate discrepancy forms and submit findings to Admin
- Cannot record branch sales or make the final discrepancy correction

### Branch Staff

- Use an individual account assigned to exactly one branch
- View stock and incoming transfers for the assigned branch
- Encode a completed handwritten-receipt sale
- Report an accidental, duplicate, nonexistent, or incorrectly submitted own-branch direct sale without editing, deleting, voiding, or restoring stock
- Double-check own-branch receipt mismatches and confirm either the original encoding or the need for correction with a replacement receipt number
- Confirm a transfer when every physical item and quantity matches
- Submit a discrepancy form when any item or quantity does not match
- Cannot directly set, adjust, or overwrite stock
- Cannot view another branch

### Accounting Staff

- View sales for all branches
- Compare each encoded sale with the handwritten receipt, including receipt identity, items, quantities, prices, discounts, payment, and total
- Mark an individual sale `VERIFIED` or report a structured mismatch with notes
- Cannot edit, void, delete, or correct sales
- Cannot adjust stock

## Workflow 1: Sales

### Customer Orders And Reservations

Customer orders are now accepted production scope for the next backend phase. Orders may originate from walk-in, Messenger, Facebook, or messages. Supported order types are reserved without downpayment, reserved with downpayment, and waiting-stock/special order. Inquiry-only records remain deferred.

Available branch stock is reserved immediately for reservation orders by increasing `InventoryBalance.reserved` while leaving `onHand` unchanged. There is no automatic reservation expiry; stale reservations must be visible for manual follow-up. Downpayments store amount plus a globally unique manual receipt number. Final release stores the final manual receipt number and remaining balance, deducts stock, clears reservation, and completes the order. DP cancellations are Admin-only and require a refund/cancellation note.

1. A customer buys items at a branch.
2. Branch Staff writes the handwritten receipt and releases the goods.
3. Branch Staff encodes one system sale for that receipt and captures a clear photo of the complete handwritten receipt for Accounting.
4. The server validates the individual user, assigned branch, receipt identity, items, quantities, captured prices/payment, and sufficient branch stock.
5. Successful posting creates the sale and lines, deducts branch stock, creates immutable inventory movements, and records actor/time in one transaction.
6. Branch stock, Admin dashboard totals, and Accounting's unverified queue reflect the committed sale immediately without an end-of-day batch.
7. Low-stock rules create durable real-time notifications for actionable users.
8. The sale waits for Accounting verification. A sale remains posted if evidence upload fails so inventory stays authoritative, but it is visibly evidence-pending and cannot be verified until the photo is attached.

### Sales Rules

- One system sale corresponds to one handwritten receipt.
- Receipt identity is unique by branch, receipt booklet/series, and receipt number.
- Skipped or cancelled receipt identities are recorded explicitly; duplicate/reused identities are blocked.
- Online and offline posting never creates negative stock.
- The server calculates authoritative totals.
- Optional customer information may be attached but is not required.
- A free-form discount may be encoded; preserve base price, discount, and final price. A discount reason is not required in the MVP.
- Posted sales are not directly edited or hard-deleted. An encoding correction uses an auditable void-and-replace flow.
- POS shows a complete confirmation before posting because successful submission deducts stock immediately.
- A Branch wrong-submission report is a request only: no receipt photo is required and stock remains deducted until Admin acts.
- Admin may keep the reported sale with no inventory effect or approve a void-only reversal when the direct sale did not occur or was submitted accidentally/duplicated. A real sale with incorrect encoded details continues through receipt verification and void-and-replace.

## Workflow 2: Accounting Verification

1. Admin or Accounting opens the unverified sales list for any branch/date.
2. The reviewer compares the complete encoded sale with the handwritten receipt.
3. If correct, the reviewer marks the individual sale `VERIFIED`.
4. If incorrect, the reviewer selects a structured mismatch category and adds expected/actual details and notes.
5. Assigned Branch Staff is notified and confirms either that the original encoding is correct or that receipt correction is needed; correction requires the replacement receipt number.
6. Admin or Accounting may close a branch-confirmed correct encoding. Only Admin may void the original and post the branch-confirmed replacement.
5. Admin reviews the issue and either confirms that the report was mistaken or applies a linked auditable sale correction.

Daily verified/unverified summaries are informational. Formal daily cash/collection closing is deferred.

## Workflow 3: Stock Room Receiving and Dispatch

1. Stock arrives at `SR`.
2. Stock Staff records the receipt, items, quantities, source/reference, actor, and time.
3. Posting increases `SR` stock through inventory movements.
4. Stock Staff prepares an `SR`-to-branch transfer.
5. `FOR_DISPATCH` means the transfer is finalized and ready; stock has not moved yet.
6. When goods physically leave `SR`, Stock Staff posts dispatch.
7. Dispatch deducts `SR`, adds the same quantities to in-transit stock, marks the transfer `IN_TRANSIT`, and notifies the destination branch in real time.

## Workflow 4: Branch Receipt or Discrepancy

1. Assigned Branch Staff opens the incoming `IN_TRANSIT` transfer.
2. Branch Staff compares every physical item and quantity with the dispatch.
3. If everything matches, Branch Staff selects `Confirm Received`.
4. Successful confirmation clears in-transit stock, adds destination branch stock, marks the transfer `RECEIVED`, and notifies Stock Staff and Admin.
5. There is no separate `DELIVERED` or `CONFIRMED` status. `RECEIVED` means physically at the branch and confirmed matched.

If anything does not match:

1. Branch Staff submits a discrepancy form with actual quantities, reason, notes, and a photo when damage or the reviewed materiality threshold requires it.
2. The report does not let Branch Staff edit stock.
3. Disputed quantities remain unavailable for sale.
4. Stock Staff and Admin receive real-time notifications.
5. Stock Staff investigates and records findings.
6. Admin approves the final accountable outcome and posts the linked stock correction.
7. The branch receives the resolution notification.

## Dashboard and Monitoring

### Admin Dashboard

- Today's sales total and transaction count overall and by branch
- Month-to-date sales total and sales by branch
- Recent sales with receipt identity and encoded-by user
- Current `SR` and branch stock
- Low-stock items and urgent low-stock notifications
- Transfers for dispatch and in transit
- Open branch discrepancy forms and aging cases
- Unverified sales and Accounting mismatch reports
- Aged reservations/orders older than 7 days

### Branch View

- Assigned-branch current stock
- Today's encoded sales
- Incoming transfers
- Transfer confirmation/discrepancy actions
- Submitted discrepancy status
- Durable notifications

### Accounting View

- Sales by date and branch
- Full receipt-linked sale details
- Unverified, verified, and mismatch counts/totals

### Reports

- Reports are read-only and require `reports:view`.
- Sales, Accounting/Reconciliation, Orders, and Inventory report data are limited to assigned locations unless the role grants `locations:all`.
- Reports support date presets plus custom date ranges.
- Reports export to PDF only; CSV report export is deferred.
- Report data is queried live from the database; saved report snapshots are deferred.

## Notifications

- Notifications are durable per-user records created with the business transaction.
- Actionable roles receive notifications; the system does not broadcast every event to everyone.
- Connected users receive live updates without refreshing.
- Reconnecting users receive all missed notifications in order.
- Every notification also attempts browser push when permission and delivery are available.
- In-app notification durability remains authoritative if push fails or permission is denied.
- Urgent notifications include discrepancies, failed/aged offline sync, overdue unresolved cases, and low stock.
- Proactive MVP alerts include low stock, overdue transfer, and repeated discrepancy patterns.
- Notifications never grant authorization to the linked record.

## Offline Continuity

Offline mode keeps the same simple branch workflows available during temporary connectivity loss.

### Available Offline

- Open a cached branch application shell after prior online sign-in and Admin activation
- View a timestamped assigned-branch product/stock snapshot
- Encode a manual-receipt sale as `Pending Sync`
- Reduce the device's local available-stock view without allowing it to go negative
- Record transfer confirmation or a discrepancy form as `Pending Sync`
- View queued, syncing, synced, and needs-review states

### Synchronization

- Admin enables offline mode per branch and activates one primary offline device for both sale and transfer receipt/discrepancy operations.
- The device may accept new offline operations for 24 hours after its last successful online authorization.
- Reconnection requires current authentication, role, branch, device, receipt, item/price, and stock validation.
- Accepted operations post once; retries cannot duplicate sales or transfer receipt.
- A stale, conflicting, or aged operation remains `NEEDS_REVIEW`; it is never discarded or forced through.
- An offline sale with insufficient canonical stock does not create negative stock. Admin/Stock Staff reconcile the missing or stale stock first, then retry the linked sale.
- Admin revokes and replaces a lost primary device; unsynchronized paper-backed events are reconciled manually.
- Admin, Stock Room dispatch, master-data changes, Accounting correction, and final discrepancy resolution remain online-only.

## User Management and Access

- Accounts are individual; shared branch credentials are not allowed.
- Four deterministic roles are seeded: Admin, Stock Staff, Branch Staff, and Accounting Staff. Admin may create additional non-owner roles.
- Persisted role capability grants authorize non-owner actions; the compatibility `UserRole` value does not grant access.
- View, create, update, delete, and workflow capabilities are independently assigned. An action capability implies the module view needed to use it but not sibling actions; matching controls are hidden and the server checks the exact action on every mutation.
- A branch-scoped account requires one active branch.
- A Stock Room-scoped account is fixed to `SR`; a business-wide account has no location assignment.
- The single owner Admin role is immutable, nonassignable, and always has the full capability catalog.
- Admin may create, view, update, deactivate, and initiate password setup/reset for non-Admin accounts.
- Delete means deactivate, never hard-delete an identity referenced by history.
- Admin sets a temporary password through a safe offline channel. First login prompts a password change but permits skip in the MVP.
- Deactivation immediately revokes sessions.
- Role or branch changes immediately revoke sessions and require sign-in again.
- Unauthorized navigation is hidden for usability, but every page/API independently enforces persisted role and location scope.
- Direct unauthorized page access shows a dedicated access-denied page without protected data.

## Workbook and Initial Seeder

The supplied source is `excel/REALTIME INVENTORY- NEW 3.xlsx`.

It is developer input for canonical database design and initial development/test seeding. It is not an Admin upload feature.

The onboarding process must:

- Preserve source sheet/row/column traceability
- Confirm that the August stockroom-like sheet maps to `SR` and distinguish it from the `BL` branch sheet
- Review duplicate and conflicting item codes rather than auto-merging
- Generate temporary codes only for true product rows missing identifiers
- Block negative, blank, or nonnumeric quantities pending review
- Require owner confirmation for conflicting or missing prices used by the MVP
- Avoid using row position or spreadsheet formulas as canonical product identity
- Normalize source data into canonical products, prices, locations, and balances rather than copying the workbook structure
- Permit reset-and-reload in development/test only; production reset is blocked

Production opening balances require an owner-reviewed mapping and seed result. The workbook remains evidence, not an automatically trusted production ledger.

## Audit and Integrity Rules

1. Every stock change has an immutable movement with product, quantity, location, reason, source record, actor, and time.
2. Branch Staff cannot directly set stock quantity.
3. Posted sales and dispatched/completed transfers are not hard-deleted.
4. Corrections and discrepancy resolutions remain linked to their source records.
5. Retried sales, dispatch, and receipt actions are idempotent.
6. Coupled stock changes commit atomically.
7. Online and offline posting never creates negative stock.
8. Role and branch scope are enforced on the server.
9. Deactivated users remain attributable in history.

## Delivery Sequence

1. Workbook-derived canonical data, persisted role access, and Admin User Management
2. Manual-receipt sales, immediate stock deduction, initial Admin sales/inventory monitoring, low-stock monitoring, and Accounting verification
3. Durable notifications and browser push
4. Stock Room receiving and `SR`-to-branch dispatch
5. Branch transfer confirmation, discrepancy form, Stock Staff investigation, Admin resolution, and the complete cross-workflow Admin dashboard
6. Limited offline branch continuity
7. Production deployment, observability, backup, and restore verification

## Deployment

- Host through Coolify on the owner's Hetzner infrastructure under HTTPS.
- Keep credentials in deployment-managed secrets.
- Deploy committed PostgreSQL migrations.
- Add health checks and useful application logs.
- Automate PostgreSQL backups and test restoration before go-live.

## Confirmed Architecture

- Next.js App Router modular monolith
- Node.js runtime and strict TypeScript
- Better Auth sessions
- Server-only Prisma with PostgreSQL as authoritative storage
- Zod validation and focused application services
- Durable PostgreSQL notifications with live delivery, reconnect catch-up, and browser push
- IndexedDB only for minimum branch snapshots and pending offline operations

See accepted ADRs 0001 through 0005 and 0007 for the supporting decisions. ADR 0006 remains proposed.
