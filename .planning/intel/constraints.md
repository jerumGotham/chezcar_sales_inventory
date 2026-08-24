# Constraints

## Canonical modeling principles
- source: docs/product/PROVISIONAL-DATA-MODEL.md
- type: schema
- content: DATA_38D0E4B7_START
  Use stable internal IDs plus separate human-readable business codes. Store posted sales and stock movements immutably; correct them with linked reversal/correction records. Derive inventory accountability from movements while maintaining a transactionally consistent balance. Snapshot product descriptions and prices on transaction lines. Use integer quantities and integer centavos or PostgreSQL Decimal for money. Enforce role and branch/location scope on the server. Preserve offline submissions and idempotency results separately from canonical business records.
  DATA_38D0E4B7_END

## Identity and location schema
- source: docs/product/PROVISIONAL-DATA-MODEL.md
- type: schema
- content: DATA_17A5C8E3_START
  User includes `id`, `fullName`, `email`, credential reference, fixed role, assigned `locationId` for branch-scoped users, active/inactive status, and timestamps. Location includes `id`, `code`, `name`, `type` (`WAREHOUSE` or `BRANCH`), address/contact fields, active status, and timestamps.
  DATA_17A5C8E3_END

## Product and price-version schema
- source: docs/product/PROVISIONAL-DATA-MODEL.md
- type: schema
- content: DATA_AF30B46D_START
  Product has a stable ID, item code or SKU, name, description, category, brand, active status, and timestamps. ProductPriceVersion has product ID, amount in centavos/Decimal, effective start/end, active status, timestamps, and actor. Immutable price versions are required so offline sales can prove which server-issued price snapshot was used.
  DATA_AF30B46D_END

## Inventory ledger schema
- source: docs/product/PROVISIONAL-DATA-MODEL.md
- type: schema
- content: DATA_6C8D2E91_START
  InventoryBalance is unique by `(locationId, productId)` and includes book `onHand`, optional `reserved`, optimistic `version`, and timestamps. `availableToSell = max(onHand - reserved, 0)`. InventoryMovement records product, location, signed quantity delta, movement type, reference, idempotency key where applicable, actor, occurrence/server times, and reason/notes.
  DATA_6C8D2E91_END

## Transfer and discrepancy schema
- source: docs/product/PROVISIONAL-DATA-MODEL.md
- type: schema
- content: DATA_E41A739C_START
  StockTransfer and lines preserve source/destination, lifecycle, actors/timestamps, dispatched quantities, and optimistic versions. TransferReceiptReport and lines preserve expected versions, actual dispositions, reasons, evidence, and status. DiscrepancyResolutionProposal stores an immutable proposal version/hash and movement preview. Admin approval transactionally revalidates proposal, transfer, and inventory versions before posting.
  DATA_E41A739C_END

## Sales and reconciliation schema
- source: docs/product/PROVISIONAL-DATA-MODEL.md
- type: schema
- content: DATA_5F97B2A8_START
  Sale includes sale number, branch, manual receipt number and series scope, Branch Staff user, status, reconciliation status, server-calculated total, occurrence/posting times, offline reference, and `stockConflict`. SaleLine snapshots product identity and price version. SaleVerification and ReconciliationIssue preserve verifier/reporter/resolver, expected and actual values, reasons, notes, linked corrections, and timestamps.
  DATA_5F97B2A8_END

## Notification and outbox schema
- source: docs/product/PROVISIONAL-DATA-MODEL.md
- type: schema
- content: DATA_29BC0D75_START
  Notification has an immutable ID, database-generated monotonic sequence cursor, recipient user, branch/location scope, type, linked entity, minimal payload, `createdAt`, and user `readAt`. Role/location audiences are expanded deterministically to per-user rows at event time. The business transaction creates Notification rows or an outbox row before commit.
  DATA_29BC0D75_END

## Offline synchronization schema
- source: docs/product/PROVISIONAL-DATA-MODEL.md
- type: schema
- content: DATA_C73E1A60_START
  RegisteredDevice stores branch/user relationship, logical activation epoch, active/retired/revoked state, server timestamps, and audit metadata. SyncOperation is unique by device ID and idempotency key and stores aggregate dependencies, operation/schema type, server-computed canonical request hash, activation epoch, expected versions, payload, status, result, times, and review metadata. Intake/result and canonical writes commit atomically per operation.
  DATA_C73E1A60_END

## Implemented PostgreSQL foundation
- source: docs/DATABASE.md
- type: schema
- content: DATA_84F3D1BE_START
  The implemented foundation models are Location, Product, InventoryBalance, User, Session, Account, and Verification. InventoryBalance is unique per `(locationId, productId)`. The initial SQL migration enforces non-negative reserved/reorder/cost values and a positive version and intentionally does not prohibit negative on-hand. Transactional sales, transfer, movement, notification, and audit models are absent.
  DATA_84F3D1BE_END

## Database migration and seed constraints
- source: docs/DATABASE.md
- type: protocol
- content: DATA_0A96C52F_START
  `db:migrate` uses Prisma's development migration workflow. Deployment should use `npx prisma migrate deploy` against a backed-up target. The seed upserts locations, products, balances, and the first Admin. It rejects the placeholder email/password and passwords shorter than 12 characters. No credential is committed.
  DATA_0A96C52F_END

## API authentication and errors
- source: docs/API.md
- type: api-contract
- content: DATA_F185A43C_START
  Protected endpoints resolve the Better Auth session, reload the persisted User, require `ACTIVE` status, and authorize against fixed role and location assignment. They return `401` for a missing session or inactive/missing user, `403` for an authenticated user without an allowed role or branch assignment, `400` for invalid product/inventory query parameters, and `500` with a generic message for unexpected catalog failures.
  DATA_F185A43C_END

## Current endpoint surface
- source: docs/API.md
- type: api-contract
- content: DATA_72C0EB39_START
  Better Auth is mounted at `/api/auth/[...all]`. Authenticated reads exist for `/api/dashboard`, `/api/customers`, `/api/customer-orders`, `/api/products`, and `/api/inventory`. Products permit `ADMIN` and `STOCK_STAFF`; inventory permits `ADMIN`, `STOCK_STAFF`, and `BRANCH_STAFF`. No business `POST`, `PUT`, `PATCH`, or `DELETE` handler is exported.
  DATA_72C0EB39_END

## Product list contract
- source: docs/API.md
- type: api-contract
- content: DATA_4B6197ED_START
  `GET /api/products` accepts validated page, pageSize, itemCode, name, category, and status parameters. It returns `data`, pagination `meta`, and a product `summary`. Prices are serialized as JSON numbers for current UI compatibility; transactional APIs must adopt one documented money representation before implementation.
  DATA_4B6197ED_END

## Inventory list contract
- source: docs/API.md
- type: api-contract
- content: DATA_B8E24D06_START
  `GET /api/inventory` accepts product parameters plus location and derived stock status. Branch Staff requests are always scoped to persisted `User.locationId`. Product pagination occurs before balances are loaded. `Out of Stock` means `onHand <= 0`; `Low Stock` means `0 < onHand <= reorderLevel`; `In Stock` means `onHand > reorderLevel`.
  DATA_B8E24D06_END

## Authenticated read caching
- source: docs/API.md
- type: nfr
- content: DATA_1D53FA8C_START
  Handlers do not declare a public cache contract or return cache headers. Callers should treat reads as authenticated, user-scoped responses. TanStack Query currently applies a 30-second client `staleTime`.
  DATA_1D53FA8C_END
