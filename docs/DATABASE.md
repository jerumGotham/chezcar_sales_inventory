<!-- generated-by: gsd-doc-writer -->
# Database

## Current status

PostgreSQL is now active for Better Auth, the Products and Inventory primary lists, Stock Room supplier receiving, and the SR-to-branch Stock Transfer workflow. Most other screens and business mutations remain mock/local behavior.

The implemented database boundary consists of:

- `prisma/schema.prisma`: implemented foundation models only.
- `prisma/migrations/20260824000000_initial_foundation/migration.sql`: reproducible initial PostgreSQL migration.
- `prisma/migrations/20260825_trusted_foundation/migration.sql`: additive nullable-price, account-state, Better Auth compatibility, role-scope, and singleton-Admin migration.
- `lib/server/prisma.ts`: server-only development-safe Prisma singleton.
- `lib/server/auth.ts`: Better Auth Prisma adapter configuration (public instance, sign-up disabled).
- `lib/server/internal-user-auth.ts`: server-only unmounted Better Auth Admin-plugin credential engine used only by staff-lifecycle services.
- `lib/server/catalog.ts`: validated product reads plus inventory reads, Admin corrections, reorder-level updates, and movement listing.
- `prisma/seed.mjs`: validated canonical opening catalog and environment-driven first Admin.
- `prisma/fixtures/opening-catalog.json`: approved canonical fixture (1,432 products, 8,592 six-location opening balances) with embedded workbook/resolution/source-map hashes.
- `scripts/data-onboarding/`: read-only workbook profiler, fail-closed canonicalizer, reviewed resolutions, and the byte-stable fixture generator (`generate-seed.mjs --check` refuses stale committed output). These are developer CLIs with no HTTP or UI surface.
- `lib/server/services/catalog-reset.ts`: transactionally scoped catalog reload with positive target identity checks.
- `lib/server/services/stock-transfers.ts`: authorized serializable transfer state transitions and inventory posting.
- `lib/server/services/stock-receipts.ts`: authorized serializable Stock Room supplier receipt posting.
- `tests/helpers/database.ts`: fixed-identity disposable PostgreSQL 17 integration lifecycle (container `chezcar_test_postgres_01_13`, port 55435, database `chezcar_test_01_13`, no bind mount).

## Implemented models

### Location

Represents both the central `WAREHOUSE` and each `BRANCH`. It has a unique business code, name, type, optional address/contact fields, active state, balances, and assigned users.

### Product

Uses unique `itemCode`, name, optional description/category/brand, nullable current Decimal price, `ACTIVE`/`INACTIVE` status, and timestamps. A null price is an approved value only for inactive, non-sellable opening products; it is not converted to zero. Historical price versions are not implemented yet.

The additive `20260826030000_product_management_audit` migration adds nullable actor fields for product create/update/deactivate/reactivate accountability. Existing seeded/imported products may have null actor fields; Admin product mutations populate the relevant actor fields going forward.

### InventoryBalance

Stores one balance per `(locationId, productId)` with `onHand`, `reserved`, `reorderLevel`, Decimal `unitCost`, optimistic `version`, and timestamps. Inventory list status is computed from available stock (`onHand - reserved`) rather than gross on-hand stock.

The initial SQL migration enforces non-negative reserved/reorder/cost values and a positive version, but it does not yet constrain `onHand` to be non-negative. The transfer service prevents source balances from becoming negative through conditional updates.

### Stock transfer ledger

The additive `20260826000000_stock_transfers` migration introduces immutable transfer lines, branch discrepancy reports, Stock Staff investigations, Admin resolutions, and `InventoryMovement` audit records. Transit is stored as `StockTransferLine.inTransitQuantity`, not as a sellable Location or InventoryBalance. Dispatch deducts SR and marks line transit quantity; exact receipt posts destination stock; final resolution clears transit and explicitly allocates each line to destination, SR restoration, or loss.

### Supplier receipt ledger

The additive `20260826010000_stock_receipts` migration adds `StockReceipt`, immutable `StockReceiptLine` product snapshots, and the `SUPPLIER_RECEIPT` inventory movement type. A receipt is permanently tied to `SR`, its receipt reference is globally unique, and each movement belongs to exactly one transfer or receipt unless it is an Admin `MANUAL_ADJUSTMENT`. The posting service uses a serializable transaction to persist the receipt, upsert/increment SR balances, and write its audit movements. Branch supplier receiving remains unimplemented.

Admin manual corrections use `InventoryMovement.type = MANUAL_ADJUSTMENT` with optional `reference` and required reason stored in `remarks`. The additive `20260826040000_inventory_manual_adjustment_constraint` migration relaxes the movement source check only for source-less manual adjustment rows; transfer and receipt movements must still keep exactly one source.

### Notifications

The additive `20260826020000_persistent_notifications` migration introduces durable per-user `Notification` rows. Stock-transfer workflow transitions create notifications in the same serializable transaction as the business state change. Each row stores recipient user, title, description, severity type, optional related stock-transfer identifiers, creation time, and per-user `readAt` timestamp. Users can list and mark only their own notifications read. Realtime streaming, browser push, mark-unread, cross-user notification audit, retention/archive policy, and automatic escalation remain deferred.

### User and Better Auth

User contains Better Auth's identity fields plus fixed `UserRole`, `ACTIVE`/`INACTIVE` status, optional Location assignment, `credentialSetupRequired`, and the pinned Better Auth 1.6.23 Admin-plugin compatibility fields. `User.status` is the sole application activation authority; lifecycle services keep `banned`, `banReason`, and `banExpires` false/null. Session includes the plugin-compatible nullable `impersonatedBy` field.

Fixed roles are:

- `ADMIN`
- `STOCK_STAFF`
- `BRANCH_STAFF`
- `ACCOUNTING_STAFF`

The application reloads the User on protected API requests instead of treating a valid cookie as sufficient authorization. A database check requires Admin/Accounting Staff to have no location and Stock/Branch Staff to have a location. A partial unique index permits exactly one persisted owner Admin at most; service policy additionally validates Stock Room versus branch assignments.

## Deliberately absent models

The former draft Customer, CustomerOrder, JobOrder, Sale, and StockTransfer Prisma models were not included in the initial migration. Their old shapes conflicted with the accepted product contract and would have created misleading persistence claims.

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
```

The ordinary application runtime may use the bind-mounted development database. Destructive catalog seed/reload must not. For catalog onboarding, start a separately isolated PostgreSQL 17 database with no bind mount at the exact development identity `localhost:55436/chezcar_catalog_dev`, set `NODE_ENV=development`, set `ALLOW_CATALOG_RESET=true`, and then run:

```bash
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run db:catalog:reload
```

`db:migrate` uses Prisma's development migration workflow. Deployment should use `prisma migrate deploy` against a backed-up target.

The seed validates the approved fixture hash and complete six-location/product/balance shape, then replaces locations, products, and opening balances with the first Admin in one transaction. It rejects placeholder credentials, passwords shorter than 12 characters, and a different existing Admin. `db:catalog:reload` runs the same catalog-only CLI path and preserves users, accounts, and sessions. No credential is committed.

Both commands refuse before opening a write transaction unless `ALLOW_CATALOG_RESET=true` and the URL exactly identifies either the isolated development target above or the fixed disposable integration target. Production, unknown URLs, and the checked-in port-5435 bind mount are always refused. The service additionally verifies the connected database name with `current_database()` inside the transaction before its first write, refuses while any user is assigned outside canonical locations, and validates the approved fixture hash plus complete six-location/product/balance shape.

The same gates back the phase verification gate: `npm run verify:phase-01 -- --validate-evidence` applies fresh committed migrations with `prisma migrate deploy`, seeds, reloads the catalog twice on this disposable target, proves both reloads produce identical canonical row counts and content hashes (6 locations, 1,432 products, 8,592 balances), and records the results in `docs/verification/phase-01-evidence.md`. The runner fails closed when the target is not the exact disposable test identity, when example seed credentials are supplied, and on any command failure other than the expected lint baseline.

## Local data warning

`docker-compose.yml` bind-mounts PostgreSQL under ignored `data/sales_inventory_postgres/`. That directory is mutable server state, not a migration or backup artifact.

During the 2026-08-24 verification, the existing local bind mount could not start because its `postgresql.conf` was malformed. It was left untouched. Migration, seed, authentication, and scoped-read verification used a disposable PostgreSQL 17 container on port `5436` instead.

Do not delete or replace a developer's existing data directory without confirming it contains no needed data. Use logical backups for useful databases.

## Current gaps

- No CI database service; disposable PostgreSQL migration and seed integration tests run locally through `tests/helpers/database.ts`.
- No ProductPriceVersion, sales, payments, or separate manual inventory-adjustment header table; manual corrections are currently audited as `InventoryMovement` rows.
- Real-time delivery, offline transfer capture/sync, discrepancy photo upload, and damaged/return locations are deferred; this slice accepts structured notes/reasons only.
- No startup-time typed environment validation.
- No case-insensitive normalized email/item-code database strategy beyond current unique fields.
- No production backup, restore, monitoring, or deployment migration procedure.

Future database work should add one canonical workflow at a time and preserve the current authorization/repository boundary.
