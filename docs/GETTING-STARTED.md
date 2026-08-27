<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide runs the Chezcar sales and inventory prototype locally. PostgreSQL is required for sign-in, Products, Inventory, Customers, Customer Orders, and POS sales.

## Prerequisites

- **Node.js:** `>=20.9.0`, enforced by `package.json`. Node.js `20.20.2` was used for the latest clean verification build.
- **npm:** required to install from the checked-in `package-lock.json`; no npm version is pinned.
- **Git:** required to clone the repository.
- **Docker with Docker Compose:** recommended for the checked-in local PostgreSQL service, or provide another PostgreSQL 17-compatible database.

The authenticated application requires a database, a populated untracked `.env`, applied migrations, and a seeded Admin.

The framework baseline is Next.js `16.3.2`. The application remains a non-production mock prototype despite the patched dependency baseline.

## Installation steps

1. Clone the repository:

   ```bash
   git clone https://github.com/jerumGotham/chezcar_sales_inventory.git
   ```

2. Enter the project directory:

   ```bash
   cd chezcar_sales_inventory
   ```

3. Install the locked dependencies:

   ```bash
   npm ci
   ```

   Use `npm install` instead when intentionally changing dependencies or regenerating `package-lock.json`.

4. Create an untracked `.env` from `.env.example`. Replace every placeholder, including the Better Auth secret and seed Admin values.

## First run

1. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

2. Generate Prisma Client, apply the development migration, and seed reference data plus the first Admin:

   ```bash
   npm run prisma:generate
   npm run db:migrate
   npm run db:seed
   ```

3. Start the Next.js development server:

   ```bash
   npm run dev
   ```

4. Open `/sign-in` and use the `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` values from your untracked environment.

5. After signing in, confirm the Prisma-backed product API responds using the browser session. Direct unauthenticated curl requests correctly return `401`.

   ```bash
   curl --fail --cookie "<session-cookie>" http://localhost:3000/api/products
   ```

   The endpoint returns a paginated JSON object sourced from PostgreSQL. If Next.js selected another port, keep `BETTER_AUTH_URL` aligned with that origin.

## Build and production start

Create an optimized production build:

```bash
npm run build
```

Serve that completed build:

```bash
npm run start
```

`npm run start` does not build the application; run `npm run build` first. Runtime authentication and database-backed routes require `DATABASE_URL`, `BETTER_AUTH_SECRET`, and a reachable PostgreSQL instance.

## Local PostgreSQL setup

The checked-in `docker-compose.yml` defines PostgreSQL 17 as the `postgres` service, exposes it on host port `5435`, and stores its data under the ignored `data/sales_inventory_postgres/` directory.

1. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

2. Create an untracked `.env` and replace every placeholder with values for your environment:

   ```dotenv
   DATABASE_URL="postgresql://<user>:<password>@localhost:5435/<database>?schema=public"
   BETTER_AUTH_SECRET="<at-least-32-random-characters>"
   BETTER_AUTH_URL="http://localhost:3000"
   ```

3. Stop PostgreSQL when it is no longer needed:

   ```bash
   docker compose stop postgres
   ```

Use `docker compose down` only when you also intend to remove the Compose-created container and network. The bind-mounted database files remain under `data/sales_inventory_postgres/`.

The Compose service does not automatically provide `DATABASE_URL` to the Next.js process. Do not reuse the development credentials in `docker-compose.yml` for a shared or production environment.

The current `5435:5432` mapping publishes PostgreSQL on all host interfaces and uses the development-only credentials `postgres`/`postgres`. Run it only on a trusted, isolated network. For localhost-only access, change the mapping to `127.0.0.1:5435:5432`.

## Current Prisma and database behavior

- `lib/server/prisma.ts` is the only shared runtime Prisma client.
- Better Auth and all application reads require an active persisted User; public sign-up is disabled.
- `/products` and the primary `/inventory` list call protected Prisma-backed endpoints.
- Dashboard, customers, customer orders, stock-card/availability dialogs, and all mutations still use mock/local data.
- One committed initial migration and one environment-driven development seed exist.
- There is no startup-time typed environment validation or automated test suite.

Treat only the documented identity, product, location, and balance reads as implemented persistence.

## First routes to inspect

With the development server running, begin with:

| Route | What it demonstrates |
| --- | --- |
| `/` | Redirects to `/dashboard`. |
| `/dashboard` | Dashboard filters, charts, pending orders, and low-stock views backed by mock records. |
| `/customers` | Database-backed customer records and transaction history. |
| `/products` | Product-list prototype interactions. |
| `/inventory` | Branch inventory prototype views. |
| `/customer-orders` | Database-backed customer-order list and reservation workflow. |
| `/api/dashboard` | Mock dashboard JSON. |
| `/api/customers` | Customer records and persisted customer history. |
| `/api/products` | Mock product collection. |
| `/api/customer-orders` | Persisted customer orders, reservations, and releases. |

These routes require an authenticated user; customer, order, and sale changes are persisted through protected APIs.

## Common setup issues

### Node.js is unsupported

If installation or startup reports an engine incompatibility, check your version:

```bash
node --version
```

Use Node.js `>=20.9.0`. Node.js `20.20.2` is the currently verified baseline.

### Port 3000 is already in use

Start the development server on another port:

```bash
npm run dev -- -p 3001
```

Then open `http://localhost:3001`.

### Production start cannot find a build

Create the build before starting the production server:

```bash
npm run build
npm run start
```

### Prisma reports that `DATABASE_URL` is missing

This error applies to Prisma commands, not to the current Next.js runtime. Create an untracked `.env` with the placeholder-based URL shown above, replace the placeholders, and ensure the optional PostgreSQL service is running. Do not look for `.env.example`; it is not present.

### PostgreSQL is unavailable on the default port

The Compose configuration maps PostgreSQL to host port `5435`, not the usual `5432`. Use `localhost:5435` in local connection URLs and check the service with:

```bash
docker compose ps
```

## Next steps

- Read the project overview and implementation status in the [README](../README.md).
- Review the system boundaries and mock-data flow in [Architecture](ARCHITECTURE.md).
- See environment and tool configuration details in [Configuration](CONFIGURATION.md).
- Read the [Development guide](DEVELOPMENT.md) and [Testing guide](TESTING.md). The testing guide documents that no test framework, test files, or test scripts currently exist.
