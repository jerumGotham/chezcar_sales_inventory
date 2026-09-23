<!-- generated-by: gsd-doc-writer -->

# Agent Guide

## Project status

The Sales, Inventory & Monitoring System is a Next.js 16/React 19 **UI prototype**, not a production sales system. Most screens operate on page-local arrays or `lib/mock-data.ts`; interactions commonly update React state, navigate, close a dialog, or log a payload. Do not describe these actions as persistent or complete unless server and database behavior has actually been added.

Current gaps are intentional and material:

- Better Auth email/password sessions, active-account checks, action-only RoleDefinition grants, explicit owner identity, and UserLocation authorization are implemented. Public sign-up is disabled; `UserRole`, `User.locationId`, and `RoleDefinition.scope` remain compatibility storage only.
- Products, Suppliers, Personnel master data, Salesperson attribution for Direct Sales/Customer Orders, quarantine-aware Inventory and Availability, customers/orders/sales/accounting, stock receiving/transfers, Backjobs, Customer Warranty, Supplier Claims, focused reports, notifications, users, roles, and branches use PostgreSQL through Prisma. General Job Orders and some supporting panels remain mock/local behavior.
- Receipt verification is manual side-by-side review of persisted sale details and private uploaded evidence. Verification requires evidence-view access in addition to the verification capability; receipt OCR and automatic extraction are intentionally absent.
- A `Payment` ledger records one row per receipt issued for money received. Order downpayments and later order payments are verified on their own Receipt Verification tab; a receipt that settles a sale mirrors that sale's review instead of being reviewed twice. Sales and Sales by Salesperson count verified receipts on their verification date, so an order's total is never double counted and a cancelled order's forfeited downpayment still appears.
- The Reports module has five live location-scoped reports in source: Sales, Sales by Salesperson, branch-only available Inventory Summary, Stock Movement, and Returns & Warranty. Sales and Sales by Salesperson read the `Payment` ledger, counting each verified receipt once; `dateBasis` selects whether the period is measured on the sale date (default) or the verification date, and both reports disclose receipts issued in the period that are still unverified. Reports are granted one at a time: `reports:sales`, `reports:salesperson-sales`, `reports:inventory-summary`, `reports:stock-movement`, and `reports:returns-warranty`, each covering both reading that report and exporting its PDF. Stock Movement pairs branch stock with units sold from posted sales in the period, grades each row by selling pace (average days between sales, Fast at one a week or better), and prints blank Actual and Variance columns for a physical count. Inventory Movements and Low Stock remain deferred; operational inventory history is intact. Consult `docs/product/REPORTS-SPEC.md` for shared sales filters, historical attribution/grouping, draft/Apply dates, and PDF semantics. This 2026-09-08 revision is source-only, with no tests/build or runtime verification; Sales by Salesperson needs no new migration and leaves existing pending migrations unresolved.
- Direct Sales carry a `soldAt` calendar day, so a branch encoding a receipt late dates it by the day the goods changed hands; the sale's `Payment.collectedAt` follows it, which is what the Sales and Sales by Salesperson reports measure. `Sale.postedAt` still records the encoding moment. The date cannot be in the future and reaches back at most 365 days.
- A posted sale's salesperson can be corrected through `PATCH /api/sales/:saleId/salesperson` under `sales:salesperson:update`. Money, receipt identity, lines, and stock are untouched; the sale and its payment ledger row move together so the salesperson report follows, the previous name is kept in `SaleSalespersonEvent`, and the change is audited.
- The Inventory branch filter accepts several branches at once. `location` takes `all`, one code, or comma-separated codes; each is access-checked separately, and an unreachable code returns 403.
- Stock transfers still `IN_TRANSIT` nudge the receiving branch and all-location users every 48 hours, starting 48 hours after dispatch and stopping 30 days after it. The sweep runs from `GET /api/notifications`, beside the receipt-evidence reminder; there is no scheduler.
- Checked-in additive migrations and an environment-driven development seed exist. The seed provisions reference catalog data, deterministic built-in roles, and the first Admin without committed credentials.
- Vitest unit and serial disposable-PostgreSQL integration suites run locally and in GitHub Actions CI. Coverage and automated browser tests do not exist.
- An earlier Node.js 20 baseline passed `npm run build`, `npm run typecheck`, and both Vitest projects; this is not verification of the current source-only changes.
- `npm run lint` passes with 23 existing warnings; do not call the repository warning-free.
- `npm audit --omit=dev` reports zero production dependency findings; the full development tree currently reports one high and one low transitive tooling finding.

## Sources of truth

Prefer executable source and configuration over prose when facts conflict. Consult these documents before broad changes:

- `README.md` — scope, current status, and entry points.
- `docs/product/PRODUCT-REQUIREMENTS.md` — proposed internal sales/inventory MVP, roles, workflows, and deferred decisions.
- `docs/product/PROVISIONAL-DATA-MODEL.md` — proposed canonical entities and Excel refinement strategy; it is not the implemented Prisma schema.
- `docs/product/GLOSSARY.md` — working domain terminology.
- `docs/adr/` — proposed product and workflow decisions; check each ADR status before treating it as locked.
- `docs/ARCHITECTURE.md` — route inventory, boundaries, data flow, and known risks.
- `docs/DEVELOPMENT.md` — coding patterns, UI conventions, and safe-change guidance.
- `docs/API.md` — the exact current authenticated HTTP surface.
- `docs/DATABASE.md` — implemented Prisma foundation, migration/seed workflow, and persistence cautions.
- `docs/CONFIGURATION.md` — environment and tool configuration.
- `docs/TESTING.md` — verification gaps and manual smoke checks.
- `docs/GETTING-STARTED.md` — local setup.

For runtime navigation, `lib/menu.ts` controls visible sidebar entries but is **not** an access-control list. `prisma/schema.prisma` is authoritative only for the implemented foundation models; future workflow shape remains provisional in product documentation.

## Essential architecture

- `app/` contains App Router pages, layouts, and route handlers. `/` redirects to `/dashboard`.
- `app/layout.tsx` composes `Providers` and `AppLayoutShell`; preserve it as a server component.
- Business pages are currently client-heavy. New routes should remain server components by default and delegate only interactive behavior to focused client components.
- `components/` contains the shared shell and presentation components; `components/ui/` contains reusable Base UI/Radix, shadcn-style primitives.
- `PageShell` is the standard business-page frame. `/pos` is the intentional full-width exception selected by `AppLayoutShell`.
- `lib/` contains shared mock records, menu metadata, dashboard helpers, and `cn()`.
- TanStack React Query is globally provided. Implemented workflows call same-origin HTTP endpoints; remaining prototype pages still use local mock query functions.
- `app/api/**/route.ts` exposes Better Auth and authenticated workflow APIs. Consult `docs/API.md` for the current Prisma-backed surface.

Keep server-only dependencies, database credentials, and future Prisma access out of client bundles.

## Commands

The following commands are backed by checked-in files:

```bash
npm ci                 # install package-lock.json exactly
npm install            # use when intentionally changing dependencies
npm run dev            # start the Next.js development server
npm run build          # request a production build
npm run start          # serve an existing build; build first
npm run typecheck      # strict TypeScript check
npm run lint           # deterministic ESLint check; currently passes with warnings
npm test               # Vitest Node unit project
npm run test:integration # serial disposable-PostgreSQL integration project
npm run prisma:generate
npm run db:migrate     # development migration; requires DATABASE_URL
npm run db:migrate:deploy # deployment migration; requires a reviewed, backed-up target
npm run db:seed        # guarded local catalog replacement; requires DATABASE_URL and SEED_ADMIN_* values
npm run db:provision-owner # guarded create-only production owner bootstrap; run once after migrations
npm run db:reset-owner-password # guarded owner password recovery; needs ALLOW_OWNER_PASSWORD_RESET and RESET_OWNER_* values
npm run db:data:reset  # guarded local reset; preserves users/auth, products, locations
docker compose up -d postgres
docker compose stop postgres
docker build -t chezcar .
```

Never report a command as passing unless the current run completes successfully; record failures, timeouts, warnings, and skipped checks explicitly. Integration tests own the fixed disposable container `chezcar_test_postgres_01_13` on port `55435` and must not overlap another run.

For current changes, run the narrowest available command and manually walk the affected route. Check responsive behavior, light/dark themes, loading/empty/error states, filters and pagination where relevant, and reload behavior. Mock endpoints can be inspected while the dev server is running with `curl --fail http://localhost:3000/api/<resource>`.

## Coding and UI conventions

- Keep strict TypeScript types; avoid new `any` usage.
- Use `@/*` for imports across top-level directories and relative imports for tightly colocated files.
- App Router pages/layouts use default exports; shared components generally use named exports.
- Use PascalCase for components, camelCase for functions/values, and uppercase names for immutable fixture or option collections.
- Match nearby double-quote, trailing-comma, and semicolon style. No formatter is configured, so avoid unrelated formatting churn.
- Reuse `components/ui/` primitives, `PageShell`, Lucide icons, and `cn()` before adding alternatives.
- Style with Tailwind and existing semantic tokens; preserve class-based dark mode, mobile-first responsiveness, table overflow, and sidebar behavior.
- Use `next/link`, `next/image`, and `next/navigation` instead of browser-level substitutes.
- If extending a mock list, preserve applied-filter state, complete query keys, page reset behavior, and `placeholderData`. Do not mistake this pattern for real data access.

## Prototype and security warnings

- Never copy remaining hard-coded users, roles, client-side permission checks, fixed route records, `setTimeout` queries, or console-only submissions into production behavior.
- Hidden buttons and menu entries do not authorize anything. Protect every future mutation and sensitive read on the server.
- Do not silently join the divergent page fixtures, `lib/mock-data.ts` shapes, and Prisma models. Establish canonical DTOs, validation, statuses, money representation, and identifiers first.
- Do not import Prisma into a client component. Add one server-only client and a deliberate repository/service boundary when persistence begins.
- Extend durable inventory and sales workflows only through validated, authorized database transactions and auditable movement records. General Job Order completion remains a prototype; do not confuse it with the implemented Backjob workflow.
- `docker-compose.yml` credentials are for isolated local development only. Never commit `.env` files or files under `data/`, and do not use the live PostgreSQL data directory as a migration or backup artifact.

## Safe change rules

1. Keep changes focused; do not rewrite an oversized page incidentally.
2. Preserve public route paths unless redirects, links, typed routes, and menu entries are updated together.
3. Inspect all consumers before changing shared UI primitives, shells, global CSS tokens, React Query defaults, or mock-data shapes.
4. Use dynamic route parameters to select real data; do not add another fixed-record dynamic page.
5. Preserve current prototype behavior while extracting smaller components or contracts.
6. Treat API shape, schema, authentication, authorization, inventory, and payment changes as cross-cutting; update affected callers and documentation together.
7. Never claim persistence, validation, security, test coverage, or deployment readiness without implementation and verification evidence.

## Recommended implementation order

For production work, proceed incrementally:

1. Reconcile UI needs with canonical domain contracts and validation schemas.
2. Extend the committed foundation migration additively as each canonical workflow is implemented.
3. Add deterministic unit, route, and database integration tests plus dependable type-check/lint scripts.
4. Expand the existing authentication, action-capability, and UserLocation authorization to each new server workflow.
5. Implement transactional mutations one workflow at a time, with auditability and concurrency/idempotency protections.
6. Add end-to-end coverage and CI only after local commands and durable workflows are reliable.

Do not begin with high-risk stock or payment mutations merely because their UI already exists.

## Documentation maintenance

When a change alters routes, commands, environment variables, API contracts, schema/runtime database status, authentication, tests, or architectural boundaries, update the corresponding root or `docs/*.md` file in the same change. Preserve the distinction between implemented facts and future recommendations, remove stale warnings only after verifying the replacement behavior, and keep this file operational rather than duplicating detailed inventories from the linked documents.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
