# Provisional MVP Data Model

**Status:** Foundation subset implemented; remaining contract pending review of the supplied Excel workbook
**Last updated:** 2026-09-07

## Purpose

This document defines the minimum canonical data needed for the confirmed MVP. Location, Product, InventoryBalance, persisted access roles, User identity, and Better Auth records are implemented; transactional models remain provisional.

Current UI columns may inform this model, but page-local fixtures are not authoritative because they use conflicting names and shapes. `excel/REALTIME INVENTORY- NEW 3.xlsx` is the developer input for refining product metadata, locations, prices, and opening balances through validation and additive migrations; it is not an in-app upload contract.

## Modeling Principles

1. Use stable internal IDs plus separate human-readable business codes.
2. Store posted sales and stock movements immutably; correct them with linked reversal/correction records.
3. Derive inventory accountability from movements while maintaining a transactionally consistent balance for efficient reads.
4. Keep warehouse and branches under one location abstraction so every movement has a source/destination location.
5. Snapshot product descriptions and prices on transaction lines so history survives product edits.
6. Use integer quantities and integer centavos or PostgreSQL Decimal for money.
7. Add `createdAt`, `updatedAt`, actor IDs, status, and optimistic version fields where concurrent workflows require them.
8. Enforce action capabilities and authoritative multi-location access on the server.
9. Preserve offline submissions and idempotency results separately from canonical business records.

## Identity and Access

### User

- `id`
- `fullName`
- `email`
- authentication-provider/credential reference
- `roleDefinitionId`: the authoritative persisted access-role assignment
- legacy `role` and `locationId` compatibility values; neither authorizes access
- zero or more authoritative `UserLocation` assignments; restricted users require at least one active operational assignment
- `status`: active/inactive
- timestamps

The system seeds four deterministic built-in roles and permits delegated role managers to create additional assignable roles. `RoleDefinition.permissions`, explicit `isOwner`, `locations:all`, and UserLocation assignments are authoritative. The single owner role is immutable, always receives the full capability catalog, and cannot be assigned through User Management.

### RoleDefinition

- `id` and stable unique `key`
- case-insensitively unique `name`
- description
- legacy `scope` compatibility value, not an authorization input
- `isOwner`: explicit singleton owner identity
- action permission IDs, including independent `locations:all` location reach
- executable capability grants
- built-in marker
- optimistic `version`
- timestamps

Changing permissions revokes assigned users' sessions. Scope cannot change while users remain assigned.

### Location

- `id`
- `code`
- `name`
- `type`: `WAREHOUSE` or `BRANCH`
- address/contact fields currently used by the UI
- active status
- timestamps

The foundation schema now uses this unified Location concept because the central warehouse holds inventory too.

### Personnel

- `id`
- `fullName`
- one home `locationId` resolving to an active branch
- `type`: `SALESPERSON`, `INSTALLER`, or `BOTH`
- `status`: active/inactive
- created/updated actors and timestamps

Personnel master data is implemented as an operational identity, not an authenticated User. Direct Sales and Customer Orders store nullable Personnel references plus complete immutable name/branch snapshots; legacy rows remain explicitly unattributed. Customer Order reassignment appends immutable previous/new attribution events. Backjobs persist Installer assignment and revalidate active eligibility within the acting user's authorized personnel locations at scheduling, start, and completion. Personnel home branch and transaction branch may differ; `locations:all` actors and owners can select across all active branches without changing transaction location authorization.

### Supplier

- `id` and optional business code
- unique normalized name
- contact/address details
- active/inactive status
- created/updated actors and timestamps

Supplier master data and Supplier selection for current Stock Room receiving are implemented. Future Supplier Claims will reuse the same identity rather than storing supplier identity as free text.

## Product and Pricing

### Product

- `id`
- `itemCode` or `sku` as the agreed business code
- `name`
- `description`
- `category`
- `brand`
- optional warranty duration and unit
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
- `quarantined`
- optimistic `version`
- timestamps
- unique `(locationId, productId)`

`quarantined` and `availableToSell = onHand - reserved - quarantined` are implemented. Database constraints keep `onHand`, `reserved`, `quarantined`, and `availableToSell` non-negative. Quarantine is a bucket within the existing location, not a separate Location. Authorized quarantine mutations remain pending for Returns/Warranty workflows.

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

Movement types include opening balance, Stock Room receipt, sale, sale reversal, transfer dispatch, transfer receipt, source restoration, loss, supplemental transfer, authorized adjustment, Backjob part issue/return, customer return to quarantine, warranty replacement release, supplier return, supplier replacement receipt, repair release, and write-off. A movement that changes sellability without changing physical on-hand records its quarantine delta atomically with the balance update.

## Stock Room Receiving

### StockRoomReceipt

- `id` and receipt/reference number
- `SR` location
- external/source reference
- status
- received/posted by users
- occurrence/posting timestamps
- notes

### StockRoomReceiptLine

- receipt ID
- product ID and description snapshot
- accepted sellable quantity
- physically received quarantined/damaged/wrong quantity
- missing quantity
- optional cost if confirmed later

Posting creates inventory movements transactionally only for physically received quantities and may create a linked Supplier Claim. Missing quantity never increases inventory. The next phase permits supplier receiving at the claim/authorized location rather than assuming every supplier resolution enters `SR`.

## Stock Transfers and Discrepancies

### StockTransfer

- `id` and transfer number
- source/destination location IDs
- lifecycle status
- prepared/dispatched/received users and timestamps
- optimistic version
- notes

For the MVP, `sourceLocationId` must resolve to `SR` and `destinationLocationId` must resolve to an active branch. Branch-to-branch and supplier-to-branch transfers are invalid.

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

### DiscrepancyResolution

- discrepancy/report ID and expected version
- Stock Staff investigator and findings
- Admin approver
- final accountable stock outcome
- reason/notes
- posted movement IDs
- resolution timestamp

Admin resolution transactionally revalidates the transfer and inventory versions before posting the final movements.

## Sales and Accounting

### Sale

- `id` and sale number
- branch location ID
- manual receipt number and receipt-series scope
- Branch Staff user
- required Salesperson Personnel ID and immutable attribution snapshot
- status and reconciliation status
- total amount calculated by server
- optional customer reference and name/contact snapshot
- payment method, amount, and optional reference
- base subtotal, discount type/value, discount amount, and final total
- `occurredAt` and server posting time
- offline submission/device reference when applicable
- timestamps

Manual receipt identity is unique by branch, receipt series/booklet, and receipt number.

### SaleLine

- sale ID
- product ID
- item code/name snapshot
- product price-version ID
- base unit-price snapshot
- quantity
- line discount and final unit price where applicable
- base and final line totals calculated by server

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

## Returns, Warranty, and Supplier Claims

### Backjob

- `id` and generated case number
- branch/location, customer, and normally linked original sale
- assigned Installer Personnel ID and snapshot
- concern, coverage decision, required active-stage schedule, work performed, notes, optional evidence, and customer acknowledgement
- lifecycle status and optimistic version
- authenticated creator/completer and timestamps
- optional linked chargeable sale

### BackjobPart

- Backjob and product IDs plus product snapshot
- planned, issued, used, and returned quantities
- linked issue/return movement IDs

Planning a part has no inventory effect. Physical issue deducts on-hand; unused physical return restores it. Completion requires every issued quantity to be reconciled as used or returned.

### CustomerWarranty

- `id` and generated case number
- branch/location, customer, original verified sale, and original sale-line reference
- product and purchased-quantity snapshot
- warranty duration/basis/expiry snapshot and Admin exception reason when required
- claimed quantity and cumulative prior claimed/replaced quantity
- assessment, approval, resolution, status, notes, required claim evidence, and active-stage target date
- approved replacement product and Admin equivalent-product reason when different
- linked Supplier Claim when supplier-covered
- actors, timestamps, and optimistic version

### SupplierClaim

- `id` and generated claim number
- Supplier and owning branch/location
- issue reason: damage, defect, incomplete delivery, wrong delivery, or supplier-covered customer warranty
- optional source receipt and Customer Warranty links
- product/quantity snapshots, physically quarantined quantity, and missing quantity
- requested resolution, supplier response, status, notes, required damage/defect evidence, active-stage target date, and external reference
- replacement/repair quantities and dates
- refund/credit memo amount, date, reference, proof, and Accounting actor
- approval/closure actors, timestamps, and optimistic version

Supplier Damage is an issue reason, not a separate aggregate. Customer Warranty and Supplier Claim statuses advance independently. Refund/credit fields are claim-resolution tracking only and do not imply a general ledger.

### Warranty and Claim Inventory Actions

Each physical action is a separately authorized idempotent command linked to its case and resulting movement IDs:

- receive customer item into quarantine
- issue/return Backjob parts
- release customer replacement
- return quarantined item to supplier
- receive supplier replacement at the claim location
- return repaired item to available stock
- write off quarantined stock

Status changes and approvals never substitute for these physical actions.

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

One logical offline-operation activation epoch per branch is allowed initially for both sales and transfer receipt/discrepancy evidence. A browser device ID is not a credential or proof of one physical device.

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

Stores a browser/device push endpoint and key material after the user grants permission. Every durable notification attempts push when delivery is available; push never replaces Notification storage.

## Audit

### AuditEvent

- actor/user and branch/location scope
- action and entity type/ID
- reason
- non-sensitive before/after metadata where appropriate
- timestamp and request/correlation ID

Inventory movements remain the authoritative quantity ledger; AuditEvent records who performed sensitive workflow and master-data actions.

## Workbook Data-Onboarding Strategy

Using `excel/REALTIME INVENTORY- NEW 3.xlsx`:

1. Preserve the original file read-only and profile every sheet/column.
2. Identify product-code duplicates, inconsistent names, branch columns, prices, quantities, and invalid values.
3. Create a mapping table from spreadsheet columns/values to this canonical model.
4. Decide which new columns are true product attributes versus import-only notes or derived values.
5. Add reviewed Prisma migrations for required fields; do not add a generic column per spreadsheet variation without domain value.
6. Build a repeatable developer-run seed-generation dry run with row-level validation errors; do not add an in-app upload workflow.
7. Confirm opening stock through a physical count before production seeding.
8. Import opening balances as explicit InventoryMovement records, not direct unexplained balance edits.

## Deferred Until Workbook or Owner Confirmation

- Final item-code terminology and barcode/unit/variant fields
- Final storage naming where the implemented `WAREHOUSE` type represents the business's `SR` Stock Room
- Opening quantities and whether damaged stock exists separately
- Product costs and historical cost requirements
- Supported payment method values
- Job Order and advanced CRM data beyond Backjob and the optional sale customer snapshot
- Commission, Payroll, customer refund, and customer exchange contracts
