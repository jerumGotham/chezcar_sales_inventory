# Context

## Testing status
- source: docs/TESTING.md

DATA_45E2B7C1_START
This repository does not currently have an automated test suite. No test framework, DOM testing library, browser test runner, test files, test configuration, coverage tool, `test` package script, or CI workflow is checked in. The application is presently a Next.js UI prototype backed by mock data, so verification is manual.

Running `npm test` currently fails with `Missing script: "test"`. Do not use any of the recommended future commands later in this document until their dependencies, configuration, and package scripts have been added.

`npm run build` creates a production Next.js build. A clean Node.js `20.20.2` isolated run passes on 2026-08-24, with existing Recharts zero-size prerender warnings. It is not a behavioral test suite.

`npm run typecheck` runs strict TypeScript with `tsc --noEmit`. A clean Node.js `20.20.2` isolated run passes on 2026-08-24.

`npm run lint` runs the checked-in ESLint flat configuration. It is reproducible but currently fails with 104 errors and 41 warnings from existing prototype code.
DATA_45E2B7C1_END

## Development conventions
- source: docs/DEVELOPMENT.md

DATA_D691A0F4_START
- Keep `app/layout.tsx` server-rendered. It owns global CSS, font metadata, `Providers`, and `AppLayoutShell`.
- Keep route files server components by default. Add `"use client"` only when that file directly needs state, effects, event handlers, browser APIs, or client-only libraries.
- Put HTTP handlers in `app/api/<resource>/route.ts` and return JSON with Next.js route-handler APIs. Existing handlers show file placement, but not a production API contract.
- Use `next/link`, `next/image`, and `next/navigation` rather than browser-level replacements.
- Use the configured `@/*` alias for imports across top-level directories. Relative imports are appropriate for tightly colocated route files such as `./CustomerHistoryTabs`.
- Do not import Prisma into client code. A future database path needs a server-only client plus validated route handlers, server actions, or application services.
- Do not treat client-side role checks, hidden navigation entries, or the hard-coded current user as authorization.
- Use `PageShell` for standard business pages so the title, subtitle, header, and action spacing remain consistent.
DATA_D691A0F4_END

## Implemented architecture
- source: docs/ARCHITECTURE.md

DATA_8C31EAF5_START
Chezcar Sales & Inventory is a Next.js 16 App Router modular monolith. It is still primarily a UI prototype, with one implemented production-oriented foundation slice: database-backed authentication, fixed role/location authorization, and read-only Product/Inventory access through Prisma and PostgreSQL. Most screens, all business mutations, stock-card history, availability inquiry, reports, notifications, and transaction workflows remain page-local or fixture-backed.
DATA_8C31EAF5_END

## Local setup and runtime
- source: docs/GETTING-STARTED.md

DATA_F62B4D90_START
This guide runs the Chezcar sales and inventory prototype locally. PostgreSQL is required for sign-in and the database-backed Products and Inventory lists; most other workflows remain mock-backed.

- **Node.js:** `>=20.9.0`, enforced by `package.json`. Node.js `20.20.2` was used for the latest clean verification build.

The authenticated application requires a database, a populated untracked `.env`, applied migrations, and a seeded Admin.

- `lib/server/prisma.ts` is the only shared runtime Prisma client.
- Better Auth and all application reads require an active persisted User; public sign-up is disabled.
- `/products` and the primary `/inventory` list call protected Prisma-backed endpoints.
- Dashboard, customers, customer orders, stock-card/availability dialogs, and all mutations still use mock/local data.
- One committed initial migration and one environment-driven development seed exist.
- There is no startup-time typed environment validation or automated test suite.
DATA_F62B4D90_END

## Configuration status
- source: docs/CONFIGURATION.md

DATA_709DAE3C_START
This project uses checked-in configuration for Next.js, Better Auth, TypeScript, Tailwind CSS, PostCSS, React Query, Prisma, ESLint, and local PostgreSQL. Authentication plus product/inventory reads use PostgreSQL; most other business behavior remains mock-backed.

The authenticated runtime requires a reachable `DATABASE_URL` and a deployment-safe `BETTER_AUTH_SECRET`. Build can compile with supplied non-production values without opening a database connection, but runtime requests require PostgreSQL.

The following configuration is absent from the repository:

- Startup-time environment validation or typed environment parsing.
- Environment-specific configuration for development, test, staging, or production.
- Production database, deployment, monitoring, and external-service settings.
DATA_709DAE3C_END

## Domain glossary
- source: docs/product/GLOSSARY.md

DATA_2E5F8B17_START
| Admin | The owner role with visibility across all branches and authority to manage users, master data, corrections, and discrepancy resolution. Posted transactions remain auditable even for Admin. |
| Accounting Staff | A read/reconciliation role that compares each system sale with its handwritten receipt. It may verify or report mismatches but cannot edit sales or stock. Cash-collection reconciliation is deferred. |
| Branch Staff | A branch-scoped user who records sales, views branch inventory, confirms transfer receipt, and reports discrepancies. This role cannot directly adjust stock balances. |
| Stock Staff | Central inventory user who receives warehouse stock, prepares and dispatches transfers, investigates discrepancies, and recommends resolutions. Admin performs final discrepancy posting in the MVP. |
| Inventory Movement | An immutable increase or decrease linked to a reason and source transaction, such as warehouse receipt, sale, transfer dispatch, transfer receipt, reversal, or variance. |
| Pending Sync | A local operation that has not yet been accepted by the cloud server and must not be presented as globally completed. |
| Needs Review | A synchronized operation that represents a real physical event but conflicts with canonical server state and requires Admin or Stock Staff investigation. |
| Notification | A durable per-user server record with an immutable ID and monotonic sequence cursor. Role/branch audiences are expanded deterministically at event time. SSE, polling, and optional browser push are delivery channels. |
| Manual Receipt Number | The identifier from the handwritten receipt linked to one internal sale. Its uniqueness scope remains to be confirmed. |

- Whether the UI should use `SKU`, `Item Code`, or another business term from the Excel sheet
- Whether the warehouse is modeled as a location type or as a special branch
- Whether `Delivered`, `Received`, and `Confirmed` have distinct operational meanings
- Whether accounting works with individual `Sale Verification` records or a `Daily Closing` record
DATA_2E5F8B17_END

## Stakeholder discovery
- source: docs/product/DISCOVERY-QUESTIONNAIRE.md

DATA_9A7463BC_START
The current working product direction is documented in [PRODUCT-REQUIREMENTS.md](PRODUCT-REQUIREMENTS.md). Use this broader questionnaire only to resolve deferred details or expand scope; it is not necessary to answer every question before the MVP can be planned.

1. Internal cloud-based sales and inventory monitoring system ito.
2. Hindi ito customer-facing POS at hindi ito ang gagamitin para mag-print ng official receipt or invoice.
3. Handwritten receipt pa rin ang ibibigay sa customer.
4. Every sale should eventually be recorded in the system and should deduct stock.
5. Main problems to solve are stock discrepancies and remote sales monitoring.
6. Branch staff can view system stock and compare it with actual stock, but they cannot directly edit quantities.
7. Stock additions and deductions are controlled by the owner or an authorized central team.
DATA_9A7463BC_END
