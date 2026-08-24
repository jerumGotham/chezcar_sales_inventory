<!-- generated-by: gsd-doc-writer -->
# Chezcar Sales & Inventory UI Starter

A Next.js 16 and React 19 prototype for demonstrating Chezcar's car-accessories sales, inventory, order, and branch-management workflows.

## Current implementation status

This repository is an incrementally implemented **UI prototype**, not a production sales system. Better Auth now provides database-backed email/password sessions, all page routes require a valid session, and the Products and Inventory primary lists read PostgreSQL through Prisma. Most other screens and auxiliary inventory dialogs still use in-memory fixtures, and no business mutation is durable.

The repository has one reviewed foundation migration and a deterministic development seed that requires caller-supplied Admin credentials. It still has no automated test suite. UI actions should be treated as demonstrations unless their behavior is explicitly backed by a route handler and Prisma service.

The framework baseline was upgraded to Next.js `16.3.2`, React `19.2.8`, and Tailwind CSS `4.3.3`. A clean Node.js `20.20.2` verification build and standalone type-check pass; production dependencies report zero known `npm audit --omit=dev` findings. The prototype remains unsuitable for production because most workflows lack persistence, automated tests, rate limiting, recovery flows, monitoring, backups, and deployment controls.

## Key modules

- **Dashboard** — sales summaries, trends, branch performance, pending orders, and low-stock views.
- **Customers and products** — Products uses a validated, authorized PostgreSQL read; customer data and product edit dialogs remain prototypes.
- **Inventory** — the primary product/location list uses authorized PostgreSQL reads; receiving, transfers, stock cards, availability, and adjustments remain prototypes.
- **Customer and job orders** — list, create, detail, edit, and release-oriented prototype flows.
- **Stock transfers and branches** — operational views for multi-branch inventory management.
- **Reports and notifications** — mock reporting and operational alert screens.
- **Users, roles, and settings** — administrative prototype screens; authentication uses fixed persisted roles, but these screens do not yet manage accounts or authorization policy.
- **Shared application shell** — responsive navigation, header, page shells, and reusable UI components under `components/`.
- **Mock data and helpers** — prototype records and dashboard utilities under `lib/`.
- **API routes** — Better Auth handlers, protected mock reads, and protected Prisma-backed product/inventory reads under `app/api/`.

Additional routes exist for POS and alternate dashboard prototypes, but they are not exposed in the active sidebar navigation.

## Installation

`package.json` requires Node.js `>=20.9.0`. Node.js `20.20.2` was used for the latest clean verification build.

Install exactly the dependencies recorded in `package-lock.json`:

```bash
npm ci
```

Use `npm install` only when intentionally changing dependencies or regenerating the lockfile.

## Quick start

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open the local URL printed by Next.js. Unauthenticated requests redirect to `/sign-in`; after sign-in, the root route redirects to `/dashboard`.

Database-backed routes require the setup in [Getting Started](docs/GETTING-STARTED.md): configure `.env`, apply migrations, seed an Admin, then sign in at `/sign-in`.

## Usage examples

### Explore a workflow

Use the sidebar to open **Customers**, **Products**, **Inventory**, **Customer Orders**, or **Job Orders**. Filters, pagination, dialogs, and forms demonstrate the intended interactions against mock data; they do not persist changes to PostgreSQL.

### Inspect a database-backed endpoint

With the development server running and a valid Better Auth session cookie, request the product collection:

```bash
curl --cookie "<session-cookie>" http://localhost:3000/api/products
```

The response has paginated `data`, `meta`, and `summary` properties populated from PostgreSQL:

```json
{
  "data": [
    {
      "itemCode": "ITM-0001",
      "name": "3M Tint Medium Black"
    }
  ]
}
```

The actual objects include price, status, reorder level, and description fields.

## Setup caveats

- `.env.example` documents `DATABASE_URL`, Better Auth settings, and seed-only Admin variables. Never commit a populated `.env`.
- `DATABASE_URL` and `BETTER_AUTH_SECRET` are required by the authenticated runtime; `BETTER_AUTH_URL` must match the application origin.
- Available npm scripts include Prisma generation, development migration, and seed commands; there is still no test script.
- `npm run lint` is reproducible but currently reports pre-existing prototype debt (104 errors and 41 warnings); it is not a passing quality gate yet.
- `npm run start` serves a production build and therefore requires `npm run build` first.

## Project scope

The prototype covers dashboard widgets, customer and product masters, branch inventory, customer orders with downpayment and release concepts, job orders, stock transfers, reports, notifications, branch administration, users and roles, and settings. Future production work must connect these workflows to persistence, validation, authentication, authorization, and tested business rules.

## Documentation

- [MVP product requirements](docs/product/PRODUCT-REQUIREMENTS.md)
- [Provisional MVP data model](docs/product/PROVISIONAL-DATA-MODEL.md)
- [Domain glossary](docs/product/GLOSSARY.md)
- [Architecture decisions](docs/adr/)
- [Architecture](docs/ARCHITECTURE.md)
- [Getting started](docs/GETTING-STARTED.md)
- [Development](docs/DEVELOPMENT.md)
- [Configuration](docs/CONFIGURATION.md)
- [API reference](docs/API.md)
- [Database scaffold](docs/DATABASE.md)
- [Testing](docs/TESTING.md)

## License

No license is currently declared in `package.json`, and no license file is present.
