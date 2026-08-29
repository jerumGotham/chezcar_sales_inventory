# Local Database Seeding

The checked-in seed provisions local reference data and the first owner Admin. It is destructive development tooling and is deliberately restricted to the exact checked-in Compose database or the fixed disposable integration-test database.

Never run `npm run db:seed`, `npm run db:catalog:reload`, or `prisma db seed` against production.

## Prerequisites

1. Install dependencies with `npm ci`.
2. Create an untracked `.env` from `.env.example`.
3. Keep the exact local Compose database URL and replace the Admin and Better Auth placeholders:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/chezcar_db?schema=public"
BETTER_AUTH_SECRET="<at-least-32-random-characters>"
BETTER_AUTH_URL="http://localhost:3000"
SEED_ADMIN_EMAIL="<internal-admin-email>"
SEED_ADMIN_PASSWORD="<strong-development-password-at-least-12-characters>"
SEED_ADMIN_NAME="<admin-display-name>"
ALLOW_CATALOG_RESET="true"
ALLOW_OPERATIONAL_DATA_RESET="true"
```

The seed rejects example credentials, passwords shorter than 12 characters, unknown database URLs, production mode, and an existing owner Admin with a different email.

## First Seed

Run these commands from the repository root:

```bash
docker compose up -d postgres
npm run prisma:generate
npm run db:migrate
npm run db:seed
```

The seed transaction:

- Validates the approved opening-catalog fixture and its hash.
- Upserts the built-in roles and six import locations.
- Creates the first owner Admin and credential account from `SEED_ADMIN_*`.
- Inserts or updates 1,432 canonical products.
- Rebuilds 8,592 opening inventory balances.

After it succeeds, run `npm run dev` and sign in at `/sign-in` with the configured Admin credentials.

## Repeat Seed

Rerun the same command when the reviewed fixture or local Admin credential needs to be reapplied:

```bash
npm run db:seed
```

A repeat seed preserves the existing Admin, account, sessions, canonical product IDs, additional products, additional Branch Maintenance locations, and assigned users. It updates canonical product fields and the Admin password hash from the current environment, then replaces all opening inventory balances with the fixture values. Preserving product IDs keeps existing operational foreign-key references valid.

## Catalog-Only Reload

To reconcile the fixture without creating or updating the Admin credential, run:

```bash
npm run db:catalog:reload
```

This command uses the same database identity, fixture, and production-refusal checks as the full seed. It preserves users, accounts, and sessions.

## Operational Data Reset

To clear local workflow data while retaining identities and master data, run:

```bash
npm run db:data:reset
```

The reset deletes operational inventory, receiving, transfer, customer, order, sale, accounting, notification, push, offline, and temporary verification records. It preserves users, credential accounts, sessions, roles, products, product image metadata, and locations. It has a separate `ALLOW_OPERATIONAL_DATA_RESET=true` opt-in and refuses production or unknown databases.

Run `npm run db:seed` afterward only when you also want to restore the reviewed opening balances and canonical product fields.

## Troubleshooting

### Database is unavailable

Check the Compose service and remember that this project uses host port `5435`:

```bash
docker compose ps
```

### Reset is refused

Confirm `.env` contains the exact local URL, the relevant `ALLOW_*` value is `true`, and `NODE_ENV` is not `production`. Do not weaken the guard to accept another target.

### A different Admin already exists

Use the email of the existing owner Admin or intentionally reset a disposable local database. The seed refuses to replace a different owner identity.

See [Database](DATABASE.md) for the transaction and persistence details.
