<!-- generated-by: gsd-doc-writer -->
# Database

## Current status

PostgreSQL is now active for Better Auth, the Products primary list, and the Inventory primary list. Most other screens and every business mutation remain mock/local behavior.

The implemented database boundary consists of:

- `prisma/schema.prisma`: implemented foundation models only.
- `prisma/migrations/20260824000000_initial_foundation/migration.sql`: reproducible initial PostgreSQL migration.
- `lib/server/prisma.ts`: server-only development-safe Prisma singleton.
- `lib/server/auth.ts`: Better Auth Prisma adapter configuration.
- `lib/server/catalog.ts`: validated product and inventory reads.
- `prisma/seed.mjs`: deterministic reference data and environment-driven first Admin.

## Implemented models

### Location

Represents both the central `WAREHOUSE` and each `BRANCH`. It has a unique business code, name, type, optional address/contact fields, active state, balances, and assigned users.

### Product

Uses unique `itemCode`, name, optional description/category/brand, current Decimal price, `ACTIVE`/`INACTIVE` status, and timestamps. Historical price versions are not implemented yet.

### InventoryBalance

Stores one balance per `(locationId, productId)` with `onHand`, `reserved`, `reorderLevel`, Decimal `unitCost`, optimistic `version`, and timestamps.

The initial SQL migration enforces non-negative reserved/reorder/cost values and a positive version, but it does not yet constrain `onHand` to be non-negative. The accepted sales/offline workflow requires future mutation services and additive database constraints to prevent negative stock. No mutation currently changes balances.

### User and Better Auth

User contains Better Auth's identity fields plus fixed `UserRole`, `ACTIVE`/`INACTIVE` status, and optional Location assignment. Session, Account, and Verification match Better Auth's required database schema.

Fixed roles are:

- `ADMIN`
- `STOCK_STAFF`
- `BRANCH_STAFF`
- `ACCOUNTING_STAFF`

The application reloads the User on protected API requests instead of treating a valid cookie as sufficient authorization. Branch Staff must have a location assignment for inventory access.

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

Then run:

```bash
docker compose up -d postgres
npm run prisma:generate
npm run db:migrate
npm run db:seed
```

`db:migrate` uses Prisma's development migration workflow. Deployment should use `npx prisma migrate deploy` against a backed-up target.

The seed upserts locations, products, balances, and the first Admin. It rejects the placeholder email/password and passwords shorter than 12 characters. No credential is committed.

## Local data warning

`docker-compose.yml` bind-mounts PostgreSQL under ignored `data/sales_inventory_postgres/`. That directory is mutable server state, not a migration or backup artifact.

During the 2026-08-24 verification, the existing local bind mount could not start because its `postgresql.conf` was malformed. It was left untouched. Migration, seed, authentication, and scoped-read verification used a disposable PostgreSQL 17 container on port `5436` instead.

Do not delete or replace a developer's existing data directory without confirming it contains no needed data. Use logical backups for useful databases.

## Current gaps

- No automated database integration tests or CI database service.
- No immutable InventoryMovement ledger or transactional stock mutations.
- No ProductPriceVersion, imports, receipts, transfers, sales, payments, notifications, or audit tables.
- No startup-time typed environment validation.
- No case-insensitive normalized email/item-code database strategy beyond current unique fields.
- No production backup, restore, monitoring, or deployment migration procedure.

The next database work should add one canonical workflow at a time and preserve the current authorization/repository boundary.
