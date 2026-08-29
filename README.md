<!-- generated-by: gsd-doc-writer -->
# Chezcar Sales & Inventory UI Starter

A Next.js 16 and React 19 prototype for demonstrating Chezcar's car-accessories sales, inventory, order, and branch-management workflows.

## Current implementation status

This repository is an incrementally implemented **UI prototype**, not a production sales system. Better Auth provides database-backed email/password sessions, all page routes are fail-closed at the proxy (unauthenticated requests go to `/sign-in`, forbidden authenticated requests to a dedicated `/access-denied` screen), and navigation is driven by persisted role capability grants and operational scope. Persisted permissions are action-specific: view, create, update, delete, and workflow actions are independently grantable, matching UI controls are hidden when absent, and every protected mutation checks its exact grant on the server. An action grant implies the module's view grant so, for example, a Product Add-only role can open Products and add a record but cannot edit or delete one. RoleScope still limits which branch/location records the user may access. The Products and Inventory primary lists read PostgreSQL through Prisma with persisted location scopes. The owner Admin gets durable User Management (`/users`) and Role Maintenance (`/users/roles`), while add/edit-only Branch Maintenance (`/branches`) is protected by separate view/create/update grants; active `BRANCH` Location rows drive branch options and assignment validation. User Management includes create/update/deactivate/reactivate/credential-reset with immediate transactional session revocation, and every first login can be prompted to replace its temporary password. `/stock-transfers` is durable for SR-to-active-branch transfer dispatch, receipt/discrepancy, investigation, Admin-only final resolution, inventory movement, and audit records. Stock Staff can also post durable supplier receipts into Stock Room through `/inventory/receive`.

The repository has checked-in additive migrations, an approved canonical opening catalog fixture (1,432 products, 8,592 six-location balances) with deterministic developer reload tooling, and an environment-driven seed that requires caller-supplied owner-Admin credentials. Catalog reset/reload is developer tooling gated to the exact local Compose or disposable test database identity; production reset is refused, and the tools have no HTTP or UI surface.

The repository has a checked-in Vitest suite (Node unit tests plus serial PostgreSQL integration tests), a consolidated phase evidence gate, and GitHub Actions CI. Successful `main` verification publishes the checked Docker image to GHCR for manual Coolify deployment. Coverage tooling and automated end-to-end browser tests remain absent. UI actions should be treated as demonstrations unless their behavior is explicitly backed by a route handler and Prisma service.

The framework baseline was upgraded to Next.js `16.3.2`, React `19.2.8`, and Tailwind CSS `4.3.3`. A clean Node.js `20.20.2` verification build and standalone type-check pass; production dependencies report zero known `npm audit --omit=dev` findings. The prototype remains unsuitable for production because several workflows lack persistence, rate limiting, recovery flows, monitoring, and verified backup/restore operations.

## Key modules

- **Dashboard** — sales summaries, trends, branch performance, pending orders, and low-stock views.
- **Customers and products** — Products uses validated, authorized PostgreSQL list/maintenance APIs with private product-image upload and authenticated thumbnails; customer records and sales history are also durable.
- **Inventory** — the primary product/location list and Inventory Availability sheet use authorized PostgreSQL reads constrained to owner/all-location access or active `UserLocation` assignments. Supplier receiving is durable and SR-only; stock cards and adjustments remain prototypes.
- **Customer and job orders** — list, create, detail, edit, and release-oriented prototype flows.
- **Stock transfers** — durable SR-to-active-branch transfer ledger with exact receipt/discrepancy, investigation, and final resolution; real-time/offline/evidence uploads remain deferred.
- **Reports and notifications** — reports remain mock/prototype; notifications use persisted per-user workflow rows with read timestamps and stock-transfer links.
- **User and Role Management** — capability-delegated `/users` and `/users/roles` pages over durable lifecycle APIs. Roles contain action grants, users may have multiple locations, access changes revoke sessions, and explicit owner identity remains immutable and unique.
- **Branch Maintenance** — capability-gated `/branches` page over durable add/edit APIs; codes are uppercase, unique, and immutable, while deactivation/deletion is not exposed.
- **Shared application shell** — responsive navigation, capability-filtered sidebar, scope feedback header, dedicated access-denied screen, page shells, and reusable UI components under `components/`.
- **Mock data and helpers** — prototype records and dashboard utilities under `lib/`.
- **API routes** — Better Auth handlers plus protected Prisma-backed catalog, inventory/availability, customer/sales, notification, branch, role, user, transfer, receipt, and credential-setup surfaces under `app/api/`.
- **Data onboarding tooling** — read-only workbook profiler, fail-closed canonicalizer with reviewed resolutions, byte-stable fixture generator, and gated catalog seed/reload under `scripts/data-onboarding/` and `prisma/`; developer CLIs with no HTTP or UI surface.
- **Test harness** — Vitest unit/integration projects, a disposable PostgreSQL 17 lifecycle, persisted actor/request helpers, and the phase evidence runner under `tests/` and `scripts/verify-phase-01.mjs`.

Additional prototype routes exist for supporting workflows that are not exposed in the active sidebar navigation.

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

Use the sidebar to open **Customers**, **Products**, **Inventory**, **Customer Orders**, or **Job Orders**. The first four use documented PostgreSQL-backed APIs for their implemented operations; Job Orders and explicitly labeled supporting panels remain non-durable prototypes.

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
- Available npm scripts include Prisma generation, development migration, repeatable local catalog seed/reload, guarded operational-data reset, unit/integration tests, and `verify:phase-01`. Local destructive commands accept only the exact Compose database (`localhost:5435/chezcar_db`) with their explicit `.env` opt-ins; production and unknown URLs remain refused. The separate evidence gate still owns its fixed disposable PostgreSQL test target.
- `npm run lint` is reproducible and currently exits successfully with existing warnings; it does not yet represent a warning-free baseline.
- `npm run start` serves a production build and therefore requires `npm run build` first.

## Project scope

The prototype covers dashboard widgets, customer and product masters, branch inventory, customer orders, sales, stock transfers, reports, notifications, branch administration, users and roles, job orders, and settings. Consult the API and database docs for the implemented durable subset; remaining prototype workflows still require persistence, validation, authorization, and tests before production use.

## Documentation

- [MVP product requirements](docs/product/PRODUCT-REQUIREMENTS.md)
- [Provisional MVP data model](docs/product/PROVISIONAL-DATA-MODEL.md)
- [Domain glossary](docs/product/GLOSSARY.md)
- [Architecture decisions](docs/adr/)
- [Architecture](docs/ARCHITECTURE.md)
- [Getting started](docs/GETTING-STARTED.md)
- [Local database seeding](docs/SEEDING.md)
- [Admin-to-role user flow](docs/USER-ROLE-FLOW.md)
- [Development](docs/DEVELOPMENT.md)
- [Configuration](docs/CONFIGURATION.md)
- [API reference](docs/API.md)
- [Database scaffold](docs/DATABASE.md)
- [Testing](docs/TESTING.md)
- [Coolify deployment](docs/DEPLOYMENT.md)

## License

No license is currently declared in `package.json`, and no license file is present.
