# Provisional MVP Data Model

**Status:** Foundation subset implemented; remaining contract pending Excel analysis
**Last updated:** 2026-08-24

## Purpose

This document defines the minimum canonical data needed for the confirmed MVP before the stakeholder provides the inventory Excel sheet. Location, Product, InventoryBalance, fixed-role User identity, and Better Auth records are implemented; transactional models remain provisional.

Current UI columns may seed this model, but page-local fixtures are not authoritative because they use conflicting names and shapes. The Excel will later refine product metadata, branch names, prices, and opening balances through validation and additive migrations.

## Modeling Principles

1. Use stable internal IDs plus separate human-readable business codes.
2. Store posted sales and stock movements immutably; correct them with linked reversal/correction records.
3. Derive inventory accountability from movements while maintaining a transactionally consistent balance for efficient reads.
4. Keep warehouse and branches under one location abstraction so every movement has a source/destination location.
5. Snapshot product descriptions and prices on transaction lines so history survives product edits.
6. Use integer quantities and integer centavos or PostgreSQL Decimal for money.
7. Add `createdAt`, `updatedAt`, actor IDs, status, and optimistic version fields where concurrent workflows require them.
8. Enforce role and branch/location scope on the server.
9. Preserve offline submissions and idempotency results separately from canonical business records.

## Identity and Access

### User

- `id`
- `fullName`
- `email`
- authentication-provider/credential reference
- `role`: `ADMIN`, `STOCK_STAFF`, `BRANCH_STAFF`, `ACCOUNTING_STAFF`
- assigned `locationId` for branch-scoped users
- `status`: active/inactive
- timestamps

The initial MVP uses four fixed roles. A normalized permission system can be added only if actual role customization is required.

### Location

- `id`
- `code`
- `name`
- `type`: `WAREHOUSE` or `BRANCH`
- address/contact fields currently used by the UI
- active status
- timestamps

The foundation schema now uses this unified Location concept because the central warehouse holds inventory too.

## Product and Pricing

### Product

- `id`
- `itemCode` or `sku` as the agreed business code
- `name`
- `description`
- `category`
- `brand`
- active status
- timestamps

The Excel will determine the final business name for `itemCode`/`sku` and whether additional columns such as unit, barcode, vehicle compatibility, size, or color are required.

### ProductPriceVersion

- `id`
- `productId`
- amount in centavos/Decimal
- effective start/end
- active status
- timestamps and actor

Immutable price versions are required so offline sales can prove which server-issued price snapshot was used.

## Inventory

### InventoryBalance

- `locationId`
- `productId`
- book `onHand`
- optional `reserved`
- optimistic `version`
- timestamps
- unique `(locationId, productId)`

`availableToSell = max(onHand - reserved, 0)`. Book `onHand` may become negative only for the explicitly flagged offline physical-sale conflict.

### InventoryMovement

- `id`
- `productId`
- `locationId`
- signed quantity delta
- movement type
- reference type and ID
- idempotency key where applicable
- actor ID
- `occurredAt` and server `createdAt`
- reason/notes

Movement types include opening balance, warehouse receipt, sale, sale reversal, transfer dispatch, transfer receipt, source restoration, loss, damage, supplemental transfer, and authorized adjustment.

## Warehouse Receiving

### WarehouseReceipt

- `id` and receipt/reference number
- warehouse location
- external/source reference
- status
- received/posted by users
- occurrence/posting timestamps
- notes

### WarehouseReceiptLine

- receipt ID
- product ID and description snapshot
- quantity
- optional cost if confirmed later

Posting creates warehouse inventory movements transactionally.

## Stock Transfers and Discrepancies

### StockTransfer

- `id` and transfer number
- source/destination location IDs
- lifecycle status
- prepared/dispatched/received users and timestamps
- optimistic version
- notes

### StockTransferLine

- transfer ID
- product ID and description snapshot
- dispatched quantity
- line version

### TransferReceiptReport

- transfer ID and expected version
- reporter/device/user
- matched/discrepant status
- occurrence/server receipt timestamps
- report status
- notes/evidence references

### TransferReceiptReportLine

- expected transfer line or additional actual SKU
- dispatched quantity snapshot
- actual disposition/received quantity
- discrepancy type and notes

### DiscrepancyResolutionProposal

- discrepancy/report ID
- immutable proposal version/hash
- Stock Staff proposer and findings
- proposed movement payload/preview
- submitted timestamp
- status

### DiscrepancyResolution

- proposal version/hash approved
- Admin approver
- action: approve, recount required, or resolve as matched
- reason/notes
- posted movement IDs
- resolution timestamp

Admin approval transactionally revalidates proposal, transfer, and inventory versions before posting.

### PhysicalStockDiscrepancy

- location/product
- system quantity snapshot
- actual count and variance
- reporter, investigator, Admin resolver
- reason/findings/status
- linked adjustment movement
- timestamps

This covers cycle-count and non-transfer discrepancies.

## Sales and Accounting

### Sale

- `id` and sale number
- branch location ID
- manual receipt number and receipt-series scope
- Branch Staff user
- status and reconciliation status
- total amount calculated by server
- `occurredAt` and server posting time
- offline submission/device reference when applicable
- `stockConflict` flag
- timestamps

Manual receipt uniqueness scope remains to be confirmed.

### SaleLine

- sale ID
- product ID
- item code/name snapshot
- product price-version ID
- unit price snapshot
- quantity
- line total calculated by server

### SaleVerification

- sale ID
- Accounting Staff verifier
- verified/mismatch status
- expected/actual values and reason
- notes and timestamps

### ReconciliationIssue

- linked sale/verification
- reporter and Admin resolver
- reason, expected/actual values, notes
- resolution type and linked correction/void/replacement
- timestamps

## Notifications

### Notification

- immutable ID
- database-generated monotonic sequence cursor
- recipient user ID
- branch/location scope
- notification type
- linked entity type/ID
- minimal payload
- `createdAt` and user `readAt`

Role/location audiences are expanded deterministically to per-user rows at event time.

### TransactionalOutbox

- event ID/type
- aggregate type/ID
- payload
- creation/publish-attempt metadata

The business transaction creates Notification rows or an outbox row before commit. SSE, polling, and push are delivery mechanisms.

## Offline Synchronization

### RegisteredDevice

- ID and branch/user relationship
- logical activation epoch
- active/retired/revoked state
- server-issued/last-sync timestamps
- audit metadata

One logical offline-sales activation epoch per branch is allowed initially. A browser device ID is not a credential or proof of one physical device.

### SyncOperation

- device ID and idempotency key, uniquely constrained together
- client aggregate ID and dependencies
- operation/schema type
- server-computed canonical request hash
- activation epoch and expected record versions
- payload
- status and canonical result/resulting IDs
- device occurrence and server receipt times
- review metadata

SyncOperation intake/result and canonical business writes commit atomically per operation.

### OfflineSaleSubmission

- SyncOperation link
- receipt/product/price snapshots submitted
- validation outcome
- canonical sale ID when accepted
- `NEEDS_REVIEW` reason when not automatically posted

Every authenticated offline sale command is retained as evidence, but only a valid submission creates a canonical sale automatically.

### PushSubscription

Optional later model for one browser/device push endpoint and key material. Push never replaces Notification storage.

## Audit

### AuditEvent

- actor/user and branch/location scope
- action and entity type/ID
- reason
- non-sensitive before/after metadata where appropriate
- timestamp and request/correlation ID

Inventory movements remain the authoritative quantity ledger; AuditEvent records who performed sensitive workflow and master-data actions.

## Excel Refinement Strategy

When the Excel arrives:

1. Preserve the original file read-only and profile every sheet/column.
2. Identify product-code duplicates, inconsistent names, branch columns, prices, quantities, and invalid values.
3. Create a mapping table from spreadsheet columns/values to this canonical model.
4. Decide which new columns are true product attributes versus import-only notes or derived values.
5. Add reviewed Prisma migrations for required fields; do not add a generic column per spreadsheet variation without domain value.
6. Build a repeatable dry-run import with row-level validation errors.
7. Confirm opening stock through a physical count before production import.
8. Import opening balances as explicit InventoryMovement records, not direct unexplained balance edits.

## Deferred Until Excel or Stakeholder Confirmation

- Final item-code terminology and barcode/unit/variant fields
- Exact branches and warehouse naming
- Opening quantities and whether damaged stock exists separately
- Product costs and historical cost requirements
- Receipt-series uniqueness scope
- Payment methods
- Additional customer, customer-order, and job-order data
