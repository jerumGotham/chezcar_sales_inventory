<!-- generated-by: gsd-doc-writer -->
# Database

## Current status

PostgreSQL is now active for Better Auth, the Products primary list, and the Inventory primary list. Most other screens and every business mutation remain mock/local behavior.

The implemented database boundary consists of:

- `prisma/schema.prisma`: implemented foundation models only.
- `prisma/migrations/20260824000000_initial_foundation/migration.sql`: reproducible initial PostgreSQL migration.
- `prisma/migrations/20260825_trusted_foundation/migration.sql`: additive nullable-price, account-state, Better Auth compatibility, role-scope, and singleton-Admin migration.
- `lib/server/prisma.ts`: server-only development-safe Prisma singleton.
- `lib/server/auth.ts`: Better Auth Prisma adapter configuration.
- `lib/server/catalog.ts`: validated product and inventory reads.
- `prisma/seed.mjs`: validated canonical opening catalog and environment-driven first Admin.
- `lib/server/services/catalog-reset.ts`: transactionally scoped catalog reload with positive target identity checks.

## Implemented models

### Location

Represents both the central `WAREHOUSE` and each `BRANCH`. It has a unique business code, name, type, optional address/contact fields, active state, balances, and assigned users.

### Product

Uses unique `itemCode`, name, optional description/category/brand, nullable current Decimal price, `ACTIVE`/`INACTIVE` status, and timestamps. A null price is an approved value only for inactive, non-sellable opening products; it is not converted to zero. Historical price versions are not implemented yet.

### InventoryBalance

Stores one balance per `(locationId, productId)` with `onHand`, `reserved`, `reorderLevel`, Decimal `unitCost`, optimistic `version`, and timestamps.

The initial SQL migration enforces non-negative reserved/reorder/cost values and a positive version, but it does not yet constrain `onHand` to be non-negative. The accepted sales/offline workflow requires future mutation services and additive database constraints to prevent negative stock. No mutation currently changes balances.

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

Both commands refuse before opening a write transaction unless `ALLOW_CATALOG_RESET=true` and the URL exactly identifies either the isolated development target above or the fixed disposable integration target. Production, unknown URLs, and the checked-in port-5435 bind mount are always refused.

## Local data warning

`docker-compose.yml` bind-mounts PostgreSQL under ignored `data/sales_inventory_postgres/`. That directory is mutable server state, not a migration or backup artifact.

During the 2026-08-24 verification, the existing local bind mount could not start because its `postgresql.conf` was malformed. It was left untouched. Migration, seed, authentication, and scoped-read verification used a disposable PostgreSQL 17 container on port `5436` instead.

Do not delete or replace a developer's existing data directory without confirming it contains no needed data. Use logical backups for useful databases.

## Current gaps

- No CI database service; disposable PostgreSQL migration and seed integration tests run locally.
- No immutable InventoryMovement ledger or transactional stock mutations.
- No ProductPriceVersion, imports, receipts, transfers, sales, payments, notifications, or audit tables.
- No startup-time typed environment validation.
- No case-insensitive normalized email/item-code database strategy beyond current unique fields.
- No production backup, restore, monitoring, or deployment migration procedure.

The next database work should add one canonical workflow at a time and preserve the current authorization/repository boundary.
