<!-- generated-by: gsd-doc-writer -->
# Database

## Current status

PostgreSQL is now active for Better Auth, Products, Inventory, Stock Room supplier receiving, SR-to-branch Stock Transfers, Customers, Customer Orders, Direct Sales, Accounting review state, dashboards, notifications, and simple reports. Job Orders and advanced CRM/offline workflows remain mock/local or deferred behavior.

The implemented database boundary consists of:

- `prisma/schema.prisma`: implemented foundation models only.
- `prisma/migrations/20260824000000_initial_foundation/migration.sql`: reproducible initial PostgreSQL migration.
- `prisma/migrations/20260825_trusted_foundation/migration.sql`: additive nullable-price, account-state, Better Auth compatibility, role-scope, and singleton-Admin migration.
- `prisma/migrations/20260827010000_sale_discount/migration.sql`: additive direct-sale discount amount migration.
- `prisma/migrations/20260827030000_product_reorder_level/migration.sql`: shared product-level reorder threshold migration.
- `prisma/migrations/20260827040000_accounting_receipt_photo/migration.sql`: optional receipt-photo evidence migration.
- `prisma/migrations/20260827050000_receipt_correction_audit/migration.sql`: receipt comparison snapshots, correction links, resolution audit, and correction movement types.
- `prisma/migrations/20260827060000_remove_balance_reorder_level/migration.sql`: removes the obsolete per-location reorder column.
- `prisma/migrations/20260827070000_notification_realtime_cursor/migration.sql`: durable notification cursor for SSE replay and polling catch-up.
- `prisma/migrations/20260827080000_push_and_offline_foundation/migration.sql`: push subscriptions/delivery attempts and offline direct-sale activation/sync evidence.
- `prisma/migrations/20260828010000_sale_correction_movement_constraint/migration.sql`: permits source-free sale correction reversal/deduction audit movements while preserving transfer/receipt source exclusivity.
- `prisma/migrations/20260828030000_branch_display_names/migration.sql`: updates the six canonical Location display names without replacing their identities.
- `prisma/migrations/20260828040000_persisted_roles_permissions/migration.sql`: additive RoleScope/RoleDefinition storage, deterministic built-in grants, existing-user backfill, case-insensitive role-name uniqueness, and required User access-role relation.
- `prisma/migrations/20260828050000_product_images/migration.sql`: optional paired Product image key/MIME metadata and unique private-storage keys.
- `prisma/migrations/20260829190000_explicit_location_authorization/migration.sql`: explicit owner marker, authoritative UserLocation join/backfill, all-location grant backfill, singleton indexes, and removal of the obsolete legacy role/location CHECK.
- `lib/server/prisma.ts`: server-only development-safe Prisma singleton.
- `lib/server/auth.ts`: Better Auth Prisma adapter configuration (public instance, sign-up disabled).
- `lib/server/internal-user-auth.ts`: server-only unmounted Better Auth Admin-plugin credential engine used only by staff-lifecycle services.
- `lib/server/catalog.ts`: validated product reads plus inventory reads, Admin corrections, reorder-level updates, and movement listing.
- `lib/server/services/product-images.ts`: private product-image validation, storage, replacement, read, and best-effort cleanup.
- `prisma/seed.mjs`: validated canonical opening catalog and environment-driven first Admin.
- `prisma/fixtures/opening-catalog.json`: approved June 2026 fixture (1,382 products, 8,292 six-location opening balances) with embedded workbook and fixture hashes.
- `scripts/data-onboarding/`: read-only workbook profiler, fail-closed canonicalizer, reviewed resolutions, and the byte-stable fixture generator (`generate-seed.mjs --check` refuses stale committed output). These are developer CLIs with no HTTP or UI surface.
- `lib/server/services/catalog-reset.ts`: transactionally scoped catalog reload with positive target identity checks.
- `lib/server/services/stock-transfers.ts`: authorized serializable transfer state transitions and inventory posting.
- `lib/server/services/stock-receipts.ts`: authorized serializable Stock Room supplier receipt posting.
- `lib/server/services/customer-sales.ts`: customer/order/sale/accounting transactions plus dashboard/report summaries.
- `lib/server/services/branches.ts`: capability-delegated, location-constrained active-branch add/edit workflow.
- `lib/server/services/roles.ts`: capability-delegated custom-role maintenance with optimistic concurrency and session revocation.
- `tests/helpers/database.ts`: fixed-identity disposable PostgreSQL 17 integration lifecycle (container `chezcar_test_postgres_01_13`, port 55435, database `chezcar_test_01_13`, no bind mount).

## Implemented models

### Location

Represents both the central `WAREHOUSE` and each `BRANCH`. It has a unique business code, name, type, optional address/contact fields, active state, balances, and assigned users. `Location` is authoritative for branch options and assignment validation. Branch Maintenance adds active `BRANCH` rows and edits descriptive/contact fields; codes are normalized uppercase and immutable, and no deactivate/delete workflow is exposed. `SR` remains the `Stock Room` `WAREHOUSE` and is excluded from Branch Maintenance.

The additive `20260828030000_branch_display_names` migration updates the existing Location names to Quezon City (`QC`), Biñan Laguna (`BL`), La Union (`LU`), Vigan City (`VC`), San Fernando Pampanga (`SP`), and Stock Room (`SR`) without deleting or recreating rows. Seed and guarded catalog-reset paths apply those display names after validating the unchanged onboarding fixture format.

### Product

Uses unique `itemCode`, non-unique name, optional description/category/brand, nullable current Decimal price, optional paired private image key/MIME metadata, `ACTIVE`/`INACTIVE` status, and timestamps. Vehicle fitment uses separate `ProductVehicleCompatibility` rows so one product can target multiple make/model/year ranges. A null price is an approved value only for inactive, non-sellable opening products; it is not converted to zero. Historical price versions are not implemented yet. Product images are validated JPEG/PNG/WebP files stored outside the database and served through an authenticated route.

The additive `20260826030000_product_management_audit` migration adds nullable actor fields for product create/update/deactivate/reactivate accountability. Existing seeded/imported products may have null actor fields; Admin product mutations populate the relevant actor fields going forward.

### InventoryBalance

Stores one balance per `(locationId, productId)` with `onHand`, `reserved`, Decimal `unitCost`, optimistic `version`, and timestamps. The shared reorder threshold is stored on Product and applies to every location. Inventory list status is computed from available stock (`onHand - reserved`) rather than gross on-hand stock.

The initial SQL migration enforces non-negative reserved/reorder/cost values and a positive version, but it does not yet constrain `onHand` to be non-negative. The transfer service prevents source balances from becoming negative through conditional updates.

### Stock transfer ledger

The additive `20260826000000_stock_transfers` migration introduces immutable transfer lines, branch discrepancy reports, Stock Staff investigations, Admin resolutions, and `InventoryMovement` audit records. Transit is stored as `StockTransferLine.inTransitQuantity`, not as a sellable Location or InventoryBalance. Dispatch deducts SR and marks line transit quantity; exact receipt posts destination stock; final resolution clears transit and explicitly allocates each line to destination, SR restoration, or loss.

### Supplier receipt ledger

The additive `20260826010000_stock_receipts` migration adds `StockReceipt`, immutable `StockReceiptLine` product snapshots, and the `SUPPLIER_RECEIPT` inventory movement type. A receipt is permanently tied to `SR`, its receipt reference is globally unique, and each movement belongs to exactly one transfer or receipt unless it is an Admin `MANUAL_ADJUSTMENT`. The posting service uses a serializable transaction to persist the receipt, upsert/increment SR balances, and write its audit movements. Branch supplier receiving remains unimplemented.

Admin manual corrections use `InventoryMovement.type = MANUAL_ADJUSTMENT` with optional `reference` and required reason stored in `remarks`. The additive `20260826040000_inventory_manual_adjustment_constraint` migration relaxes the movement source check only for source-less manual adjustment rows; transfer and receipt movements must still keep exactly one source.

### Notifications

The additive `20260826020000_persistent_notifications` migration introduces durable per-user `Notification` rows, and `20260827070000_notification_realtime_cursor` adds a unique monotonic `cursor` for replay. Stock-transfer, inventory, and sale/accounting workflow transitions create notifications in the same serializable transaction as the business state change, then call PostgreSQL `pg_notify` as a post-commit wake-up signal for authenticated SSE streams. Each row stores recipient user, cursor, title, description, severity type, optional related entity identifiers, creation time, and per-user `readAt` timestamp. Users can list, stream, catch up, and mark only their own notifications read. Browser push subscriptions and delivery attempts are stored separately; push is best-effort and never marks a notification read. Mark-unread, cross-user notification audit, retention/archive policy, and automatic escalation remain deferred.

### Offline branch sales

`OfflineDeviceActivation` stores the one current branch device authorization window. `OfflineSyncOperation` reserves `(deviceId, idempotencyKey)` and records the processing outcome. `OfflineSaleSubmission` retains every accepted offline direct-sale command payload and final status. Accepted commands link to the canonical Sale; duplicate/insufficient-stock conflicts remain `NEEDS_REVIEW` evidence and do not create negative stock. Offline transfer receipt/discrepancy evidence is not implemented yet.

### User and Better Auth

User contains Better Auth identity fields, required `roleDefinitionId`, `ACTIVE`/`INACTIVE` status, many authoritative `UserLocation` assignments, and `credentialSetupRequired`. `RoleDefinition` stores action permissions and explicit `isOwner`. `User.role`, `User.locationId`, and `RoleDefinition.scope` remain temporary compatibility columns and are not authorization inputs. `User.status` remains the sole application activation authority.

Deterministic built-ins are Admin, Stock Staff, Branch Staff, and Accounting Staff. Admin is the single immutable role marked `isOwner`; existing owner and business-wide roles receive `locations:all` during migration.

Protected requests reload permissions, `isOwner`, and active operational UserLocation rows. Restricted users with no valid assignment fail closed. Capabilities are action-specific strings such as `products:view`, `products:create`, `products:update`, and `products:delete`; action grants imply only required views and never sibling mutations. `locations:all` implies no action. A functional index enforces case-insensitive role names and partial indexes preserve one owner role and owner user.

## Deliberately absent models

JobOrder and advanced CRM/service models remain absent. The former draft Customer, CustomerOrder, Sale, and StockTransfer shapes were not reused; the implemented models now follow the accepted manual-receipt, reservation, inventory movement, and Accounting review rules.

### Customers, orders, sales, and Accounting

The additive `20260826050000_customer_orders_sales_accounting` migration introduces `Customer`, `CustomerOrder`, `CustomerOrderLine`, `ManualReceipt`, `Sale`, `SaleLine`, and `SaleAccountingReview`. Manual receipt identity is unique per branch, booklet, and receipt number. Accounting reviews store `UNVERIFIED`, `VERIFIED`, or `MISMATCH_REPORTED` state, structured mismatch details, optional receipt-photo evidence, and a non-authoritative local OCR draft/status. `20260828020000_branch_receipt_mismatch_response` adds the assigned Branch Staff response, explanation, optional replacement receipt number, actor, and timestamp required before final mismatch resolution.

Reservation orders increment `InventoryBalance.reserved` while keeping physical `onHand` unchanged. Final order release creates a posted sale, clears reservation, decrements `onHand`, and writes `CUSTOMER_ORDER_RELEASE` movements. Direct sales decrement available branch stock immediately and write `DIRECT_SALE` movements; direct-sale discounts are stored as `Sale.discountAmount` and cannot exceed the sale subtotal. Each sale starts with one `UNVERIFIED` Accounting review row; Admin or Accounting Staff may verify or report a mismatch without editing sale, payment, order, or stock facts. Mismatch reports notify active Admin and assigned Branch Staff users. Branch response is advisory and auditable; only Admin can execute the inventory-changing void-and-replace transaction.

Add transactional models only when implementing their vertical workflow, including canonical lines, snapshots, actors, statuses, invariants, idempotency, and auditability. The full proposed shape remains in `docs/product/PROVISIONAL-DATA-MODEL.md`.

## Local setup

Use the sanitized `.env.example` as a guide:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/chezcar_db?schema=public"
BETTER_AUTH_SECRET="<at-least-32-random-characters>"
BETTER_AUTH_URL="http://localhost:3000"
SEED_ADMIN_EMAIL="<internal-admin-email>"
SEED_ADMIN_PASSWORD="<strong-development-password>"
SEED_ADMIN_NAME="<admin-display-name>"
ALLOW_CATALOG_RESET="true"
ALLOW_OPERATIONAL_DATA_RESET="true"
```

The local application, seed, catalog reload, and operational reset use the checked-in Compose database at `localhost:5435/chezcar_db`. Copy `.env.example`, replace the Admin and Better Auth placeholders, then run:

```bash
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run db:catalog:reload
```

`db:migrate` uses Prisma's development migration workflow. Deployment should use `prisma migrate deploy` against a backed-up target.

The seed validates the approved fixture hash and complete six-location/product/balance shape, then upserts the six import locations, reconciles canonical products and compatibility rows, replaces opening balances, seeds the built-in roles, and creates or updates the first Admin in one transaction. It preserves canonical product IDs, additional products, additional Branch Maintenance locations, users, and sessions; rejects placeholder credentials, passwords shorter than 12 characters, and a different existing Admin. `db:catalog:reload` runs the same catalog-only CLI path without changing the Admin credential. No credential is committed. The operator workflow is documented in [Local Database Seeding](SEEDING.md).

Both commands refuse before opening a write transaction unless `ALLOW_CATALOG_RESET=true` and the URL exactly identifies either the local Compose target above or the fixed disposable integration target. Production and unknown URLs are always refused. The service additionally verifies the connected database name with `current_database()` inside the transaction before its first write and validates the approved fixture hash plus complete six-location/product/balance shape. Catalog reload updates or inserts canonical products without deleting their identities, replaces opening balances, upserts the six import locations with their confirmed display names, and preserves additional products, authoritative Location rows, and user assignments.

To clear transactional development data without replacing master identities or products, run `npm run db:data:reset`. This separate transaction requires `ALLOW_OPERATIONAL_DATA_RESET=true`, deletes inventory balances/movements, receipts, transfers, customers, orders, sales/reviews, notifications/push records, offline records, and temporary verification tokens. It preserves `User`, `Account`, `Session`, `RoleDefinition`, `Product` (including image metadata), and `Location` rows, verifies `current_database()`, and accepts only the exact local Compose or disposable test identity. It is not a production reset path.

The same gates back the phase verification gate: `npm run verify:phase-01 -- --validate-evidence` applies fresh committed migrations with `prisma migrate deploy`, seeds, reloads the catalog twice on this disposable target, proves both reloads produce identical canonical row counts and content hashes (6 locations, 1,432 products, 8,592 balances), and records the results in `docs/verification/phase-01-evidence.md`. The runner fails closed when the target is not the exact disposable test identity, when example seed credentials are supplied, and on any command failure other than the expected lint baseline.

## Local data warning

`docker-compose.yml` bind-mounts PostgreSQL under ignored `data/sales_inventory_postgres/`. That directory is mutable server state, not a migration or backup artifact.

Do not delete or replace a developer's existing data directory without confirming it contains no needed data. Use logical backups for useful databases.

## Current gaps

- GitHub Actions runs disposable PostgreSQL migration and seed integration tests through `tests/helpers/database.ts`; the fixed container and port keep that project serial within each runner.
- No ProductPriceVersion, sales, payments, or separate manual inventory-adjustment header table; manual corrections are currently audited as `InventoryMovement` rows.
- Offline transfer capture/sync, discrepancy photo upload, and damaged/return locations are deferred; this slice accepts structured notes/reasons only.
- No startup-time typed environment validation.
- No case-insensitive normalized email/item-code database strategy beyond current unique fields.
- The Coolify deployment migration sequence is documented, but production backup/restore and migration recovery are not automated or verified.

Future database work should add one canonical workflow at a time and preserve the current authorization/repository boundary.
