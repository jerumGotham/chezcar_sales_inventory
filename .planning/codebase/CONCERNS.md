# Codebase Concerns

**Analysis Date:** 2026-08-25

## Tech Debt

**Prototype behavior presented as operational workflows:**
- Issue: Most business screens mutate page-local React state, navigate, close a dialog, or print a payload; only authentication and the Product/Inventory primary reads use PostgreSQL. Representative non-durable flows include customer-order editing/release, job-order creation/completion, stock transfers, receiving, POS checkout, users, roles, branches, settings, and exports.
- Files: `app/customer-orders/[id]/page.tsx`, `app/customer-orders/[id]/release/page.tsx`, `app/job-orders/create/page.tsx`, `app/job-orders/page.tsx`, `app/stock-transfers/page.tsx`, `app/inventory/receive/page.tsx`, `app/pos/page.tsx`, `app/users/page.tsx`, `app/users/roles/page.tsx`, `app/branches/page.tsx`, `app/settings/page.tsx`, `app/reports/page.tsx`
- Impact: A successful-looking interaction does not survive reload, enforce domain invariants, reserve/deduct stock, record payment, or create an audit trail. Treating these screens as complete can cause data loss and false operational confidence.
- Fix approach: Implement one vertical workflow at a time behind validated route handlers, server-side authorization, application services, Prisma transactions, immutable audit/movement records, and behavioral tests; keep unsupported controls disabled or explicitly labeled as prototypes.

**Oversized client page modules:**
- Issue: Business logic, fixtures, query simulation, state, forms, tables, dialogs, and styling are combined in single client components. The largest files are `app/pos/page.tsx` (1,842 lines), `app/users/page.tsx` (1,752), `app/stock-transfers/page.tsx` (1,597), and `app/inventory/page.tsx` (1,436).
- Files: `app/pos/page.tsx`, `app/users/page.tsx`, `app/stock-transfers/page.tsx`, `app/inventory/page.tsx`, `app/customers/page.tsx`, `app/job-orders/page.tsx`
- Impact: Changes have broad regression surfaces, render work is difficult to isolate, code review is expensive, and meaningful component/unit testing requires substantial setup.
- Fix approach: Keep route pages as server components where possible; extract typed feature components, schemas, domain calculations, query adapters, and dialog/form state into focused modules colocated under each route.

**Duplicated fixtures and UI contracts:**
- Issue: Customer, product, inventory, role, user, branch, order, and job data are independently declared across page files and `lib/mock-data.ts`. Repeated `react-select` style objects use explicit `any` rather than the typed pattern already present in `app/inventory/_data.ts`.
- Files: `lib/mock-data.ts`, `app/inventory/_data.ts`, `app/customers/page.tsx`, `app/customer-orders/page.tsx`, `app/customer-orders/[id]/page.tsx`, `app/job-orders/page.tsx`, `app/job-orders/[id]/edit/page.tsx`, `app/users/page.tsx`, `app/users/roles/page.tsx`, `app/branches/page.tsx`
- Impact: The same business concept has incompatible identifiers, statuses, prices, branches, and records; fixes must be repeated and UI behavior can disagree between list, detail, and edit routes.
- Fix approach: Define canonical DTOs and Zod schemas before connecting more persistence. Share typed select styles/components and small fixture factories only where the underlying contract is genuinely the same.

**Failing or unavailable lint gate:**
- Issue: ESLint is configured, but repository documentation records 104 errors and 41 warnings, dominated by explicit `any` and React effect/state findings. In this checkout, `npm run lint` cannot locate the `eslint` executable, indicating the installed dependency tree is not usable as a verification environment.
- Files: `eslint.config.mjs`, `package.json`, `docs/TESTING.md`, `app/users/page.tsx`, `app/customer-orders/page.tsx`, `app/job-orders/page.tsx`
- Impact: New regressions cannot be distinguished reliably from baseline debt, and contributors can receive different local verification outcomes.
- Fix approach: Restore dependencies with `npm ci`, fix lint findings by category without disabling rules, and make a clean lint run a required CI check.

**Unvalidated runtime configuration and incomplete operations:**
- Issue: Runtime configuration is consumed directly by Prisma and Better Auth without a startup validation layer. No production backup/restore, migration deployment, monitoring, or recovery procedure is implemented.
- Files: `prisma/schema.prisma`, `lib/server/auth.ts`, `lib/server/prisma.ts`, `docs/CONFIGURATION.md`, `docs/DATABASE.md`
- Impact: Missing or malformed settings fail late, and production database/auth failures lack a defined recovery path.
- Fix approach: Add a server-only typed environment module, fail fast with value-safe messages, and document/test migration, backup, restore, observability, and rollback procedures.

**Documentation contradiction:**
- Issue: The authentication test strategy says authentication and server authorization do not exist, while the same document and executable code show Better Auth sessions and `requireUser()` authorization.
- Files: `docs/TESTING.md`, `lib/server/auth.ts`, `lib/server/authorization.ts`, `proxy.ts`
- Impact: Test planning can skip the implemented security boundary or apply obsolete sequencing assumptions.
- Fix approach: Rewrite the authentication section around the implemented role/location matrix and explicitly list the missing automated cases.

## Known Bugs

**Customer-order dynamic routes ignore the requested ID:**
- Symptoms: Every `/customer-orders/[id]` detail renders the same hard-coded order, and its release link always targets `ORD-1001`; every release route renders the same hard-coded release record.
- Files: `app/customer-orders/[id]/page.tsx`, `app/customer-orders/[id]/release/page.tsx`
- Trigger: Navigate directly to two different customer-order IDs or open release from any order other than `ORD-1001`.
- Workaround: Return to `app/customer-orders/page.tsx`; do not use dynamic detail/release pages as record-accurate views.

**Role-dependent inventory controls use a fixed Admin constant:**
- Symptoms: Receive, transfer, and adjustment affordances are calculated from `USER_ROLE = "ADMIN"` rather than the persisted signed-in user. Page-route proxy checks block some direct navigation, but the UI advertises actions to users who may not hold the role.
- Files: `app/inventory/_data.ts`, `app/inventory/page.tsx`, `proxy.ts`, `lib/server/authorization.ts`
- Trigger: Sign in as Branch Staff or Accounting Staff and open `/inventory`.
- Workaround: Server-side checks in `proxy.ts` redirect unauthorized receive/transfer page navigation; no durable inventory mutation exists.

**Production build emits chart sizing warnings:**
- Symptoms: Recharts reports zero-size container warnings during prerender even though the build completes.
- Files: `app/dashboard/page.tsx`, `docs/TESTING.md`
- Trigger: Run `npm run build` in a clean Node.js environment.
- Workaround: Treat warnings as known noise while manually checking rendered charts; do not suppress them globally.

**Local PostgreSQL bind-mount state is not reproducible:**
- Symptoms: The checked-in Compose setup can fail to start when ignored machine-local PostgreSQL state under the bind mount contains malformed or incompatible configuration.
- Files: `docker-compose.yml`, `.gitignore`, `docs/DATABASE.md`
- Trigger: Start Compose against an existing `data/sales_inventory_postgres/` directory with invalid server state.
- Workaround: Preserve unknown developer data, make a logical backup when possible, and verify migrations against a disposable PostgreSQL instance.

## Security Considerations

**No request throttling or abuse controls:**
- Risk: Sign-in and authenticated read endpoints have no application rate limiting, account lockout policy, or operational abuse monitoring. Credential stuffing and resource-exhaustion attempts are not constrained by repository code.
- Files: `lib/server/auth.ts`, `app/api/auth/[...all]/route.ts`, `app/api/products/route.ts`, `app/api/inventory/route.ts`
- Current mitigation: Public sign-up is disabled in `lib/server/auth.ts`; protected APIs validate active users in `lib/server/authorization.ts`.
- Recommendations: Add trusted-proxy-aware rate limits, login abuse alerts, and a documented lockout/recovery policy; test limits without weakening generic sign-in errors.

**Authorization is incomplete outside the implemented catalog slice:**
- Risk: Mock dashboard, customer, and customer-order APIs permit every authenticated role, and most page routes are session-only. Menu visibility is not an ACL, and administrative-looking Users, Roles, Branches, Reports, and Settings pages are reachable by any active account.
- Files: `app/api/dashboard/route.ts`, `app/api/customers/route.ts`, `app/api/customer-orders/route.ts`, `proxy.ts`, `lib/menu.ts`, `app/users/page.tsx`, `app/users/roles/page.tsx`, `app/settings/page.tsx`
- Current mitigation: Durable Product and Inventory reads enforce fixed server-side role/location policy through `lib/server/authorization.ts`; mock screens do not persist changes.
- Recommendations: Define a role/resource/action/location matrix, enforce it in every route handler and server mutation, then make navigation and controls reflect—but never replace—the server policy.

**Security headers are not explicitly configured:**
- Risk: No repository-defined Content Security Policy, frame-ancestor policy, referrer policy, or permissions policy constrains browser behavior.
- Files: `next.config.ts`, `proxy.ts`
- Current mitigation: React escapes rendered values by default, and no `dangerouslySetInnerHTML` usage is present in application source under `app/`, `components/`, or `lib/`.
- Recommendations: Add and test environment-appropriate headers in `next.config.ts` or `proxy.ts`, beginning with report-only CSP if third-party component requirements need discovery.

**Development database credentials and storage are unsafe for shared environments:**
- Risk: `docker-compose.yml` contains static local-development database credentials and exposes PostgreSQL through a host port; the bind-mounted database directory is mutable machine state.
- Files: `docker-compose.yml`, `.gitignore`, `docs/DATABASE.md`
- Current mitigation: Documentation limits the Compose service to isolated local development, `.env*` and `data/` are ignored in `.gitignore`, and production secrets are not intended for this file.
- Recommendations: Never deploy the Compose credentials, avoid binding PostgreSQL beyond localhost, use managed secrets for deployed environments, and replace bind-mounted state with controlled disposable volumes for development verification.

**Money and authorization-relevant data cross weak contracts:**
- Risk: Prisma `Decimal` price and unit cost values are converted to JavaScript numbers for legacy UI DTOs; many other monetary totals and statuses are client-computed from mutable fixture values.
- Files: `prisma/schema.prisma`, `lib/server/catalog.ts`, `lib/catalog.ts`, `app/customer-orders/[id]/page.tsx`, `app/pos/page.tsx`
- Current mitigation: Implemented Product/Inventory reads serialize values deliberately, and no business mutation accepts these values yet.
- Recommendations: Establish integer-minor-unit or decimal-string transport, server-owned price snapshots, and server recomputation/validation before adding payment, order, or stock mutations.

**Operational visibility is insufficient:**
- Risk: API failures use unstructured `console.error`; there is no error tracker, audit stream, alerting, request correlation, or redaction policy.
- Files: `app/api/products/route.ts`, `app/api/inventory/route.ts`, `prisma/seed.mjs`, `docs/ARCHITECTURE.md`
- Current mitigation: API clients receive generic internal-error messages rather than raw thrown details in `app/api/products/route.ts` and `app/api/inventory/route.ts`.
- Recommendations: Add structured server logging with request IDs and explicit sensitive-field redaction, then connect error/latency monitoring and security audit events.

## Performance Bottlenecks

**Inventory summary scans all scoped balances on every list request:**
- Problem: `listInventory()` loads every scoped balance's `onHand` and `reorderLevel` into Node.js and computes summary statuses in memory, independent of page size. Each filter/page request repeats this work.
- Files: `lib/server/catalog.ts`, `app/api/inventory/route.ts`, `app/inventory/page.tsx`
- Cause: The summary query uses `findMany` without pagination or database aggregation, while TanStack Query keys issue a new request for every applied filter/page combination.
- Improvement path: Use database-side conditional aggregation or maintained summary data, define whether summaries are global or filter-scoped, and measure query plans with production-like cardinality.

**Product list performs repeated global counts:**
- Problem: Each Product request executes five count queries plus the page query; four summary counts are repeated even when only pagination changes.
- Files: `lib/server/catalog.ts`, `app/api/products/route.ts`, `app/products/page.tsx`
- Cause: List metadata and global dashboard summaries share one uncached request path.
- Improvement path: Combine compatible aggregates, cache stable global summaries with explicit invalidation after product/inventory mutations, and retain an uncached filtered total for pagination.

**Search filters lack supporting indexes:**
- Problem: Case-insensitive substring searches on product item code and name can become sequential scans, and inventory filters join balances/locations while computing status from two columns.
- Files: `lib/server/catalog.ts`, `prisma/schema.prisma`, `prisma/migrations/20260824000000_initial_foundation/migration.sql`
- Cause: The schema has uniqueness for `Product.itemCode` and a few relation indexes, but no trigram/search indexes or compound indexes tailored to list filters.
- Improvement path: Capture `EXPLAIN ANALYZE` results first, then add PostgreSQL trigram or normalized search indexes and workload-specific balance/location indexes through additive migrations.

**Client-heavy pages increase bundle and render cost:**
- Problem: Large route modules ship extensive fixture arrays, dialog implementations, style objects, and workflow state to the browser; list filtering and derived summaries often run client-side.
- Files: `app/pos/page.tsx`, `app/users/page.tsx`, `app/stock-transfers/page.tsx`, `app/inventory/page.tsx`, `app/customers/page.tsx`
- Cause: Whole business routes are marked `"use client"` and combine data, calculations, and presentation.
- Improvement path: Move static/server-readable work to server components, lazy-load heavy dialogs, split interactive islands, and profile bundles/renders before setting budgets.

**Every protected navigation revalidates session and user state against the database:**
- Problem: `proxy()` resolves the Better Auth session and separately loads the User for every matched page request; protected APIs repeat session and User checks.
- Files: `proxy.ts`, `lib/server/authorization.ts`, `lib/server/auth.ts`
- Cause: Active status and role/location are deliberately reloaded rather than trusted from the cookie.
- Improvement path: Preserve revocation correctness, instrument query latency, ensure connection pooling, and optimize only with a short-lived/revocable authorization cache if measurements justify it.

## Fragile Areas

**Hybrid inventory screen:**
- Files: `app/inventory/page.tsx`, `app/inventory/_data.ts`, `lib/catalog.ts`, `lib/server/catalog.ts`
- Why fragile: The main grid and availability sheet are Prisma-backed while stock-card options and adjustment dialogs retain static local fixtures. One screen can still display mutually inconsistent stock facts.
- Safe modification: Mark data provenance at each boundary, introduce canonical inventory DTOs, and replace one auxiliary panel at a time through the same authorized service layer.
- Test coverage: No tests verify grouping, available stock, branch scope, query contracts, stock-card provenance, or mixed loading/error states.

**Authentication and fixed authorization boundary:**
- Files: `lib/server/auth.ts`, `lib/server/authorization.ts`, `proxy.ts`, `app/sign-in/sign-in-form.tsx`
- Why fragile: Session validity, active-account checks, fixed roles, branch location assignment, redirects, and API policy span multiple files and two request boundaries. A UI-only role check can easily diverge from server enforcement.
- Safe modification: Centralize policy decisions in server-only code, preserve generic authentication errors, and update page proxy, APIs, navigation, schema, seed, and authorization matrix together.
- Test coverage: No automated cases cover expired sessions, inactive accounts, wrong roles, missing branch assignment, cross-location filters, redirects, or direct HTTP bypass attempts.

**Catalog pagination and derived inventory semantics:**
- Files: `lib/server/catalog.ts`, `lib/catalog.ts`, `app/products/page.tsx`, `app/inventory/page.tsx`
- Why fragile: Inventory paginates Products but emits multiple location rows per product; metadata counts products, summaries count balances, and the UI regroups rows while selecting first-location cost/reorder fields for aggregate display.
- Safe modification: Document the response unit for every field, preserve product-first pagination, and change API DTO, query, UI grouping, and tests atomically.
- Test coverage: No boundary cases cover zero results, out-of-range pages, multiple locations, conflicting reorder levels/costs, negative on-hand, or filtered summaries.

**Schema evolution into transactional workflows:**
- Files: `prisma/schema.prisma`, `prisma/migrations/20260824000000_initial_foundation/migration.sql`, `docs/product/PROVISIONAL-DATA-MODEL.md`, `docs/DATABASE.md`
- Why fragile: The implemented schema intentionally omits orders, sales, payments, jobs, transfers, movements, idempotency, and audit records. Adding UI-shaped draft tables directly would lock in divergent identifiers/statuses and weak invariants.
- Safe modification: Reconcile canonical contracts first; add one additive vertical migration with snapshots, actors, constraints, transaction boundaries, and rollback/concurrency tests.
- Test coverage: No migration, seed, transaction rollback, concurrency, idempotency, or schema-compatibility suite exists.

**Shared shell and navigation:**
- Files: `app/layout.tsx`, `components/app-layout-shell.tsx`, `components/app-sidebar.tsx`, `components/app-header.tsx`, `lib/menu.ts`, `proxy.ts`
- Why fragile: Route visibility, responsive shell state, theme persistence, special handling for `/sign-in` and `/pos`, and page protection are distributed across client and server modules.
- Safe modification: Inspect every route/menu consumer, keep visibility separate from authorization, and manually verify mobile/desktop, pinned/unpinned, light/dark, authenticated/unauthenticated states.
- Test coverage: No component or E2E coverage protects shell state, route highlighting, special layouts, role visibility, or redirect behavior.

## Scaling Limits

**Inventory balance cardinality:**
- Current capacity: Unmeasured; API page size is capped at 100 Products, but the summary path materializes every balance in the user's location scope on each request.
- Limit: Memory, database transfer, and status-mapping time grow linearly with total scoped balances rather than requested page size.
- Scaling path: Replace the full-row summary read with SQL aggregation, add query-plan benchmarks, and establish latency/cardinality budgets in `lib/server/catalog.ts` and integration tests.

**In-process prototype state:**
- Current capacity: One browser session over small fixture arrays embedded in route modules; no multi-user shared write state exists.
- Limit: Local changes disappear on reload and cannot coordinate concurrent users, branches, devices, or retries.
- Scaling path: Move each workflow to PostgreSQL-backed services with optimistic/version checks, idempotency keys, immutable events/movements, and transactional authorization in `lib/server/` plus new `app/api/` routes.

**Database operations and deployment:**
- Current capacity: One PostgreSQL service, one initial migration, and no measured connection, backup, failover, restore, or migration window targets.
- Limit: Operational recovery and safe multi-instance deployment are undefined.
- Scaling path: Define production hosting and pooling, run migrations with `prisma migrate deploy`, automate logical backups and restore drills, and add database health/latency monitoring around `lib/server/prisma.ts`.

## Dependencies at Risk

**Development tooling transitive vulnerabilities:**
- Risk: `npm audit --json` reports one high-severity `brace-expansion` issue and one low-severity `@babel/core` issue in the full dependency tree; both are transitive and report fixes available. `npm audit --omit=dev --json` reports zero production findings.
- Impact: Local/CI tooling that processes attacker-controlled patterns or source maps can be exposed to denial-of-service or local file disclosure scenarios; deployed runtime dependencies are not implicated by the omit-dev audit.
- Migration plan: Trace both paths in `package-lock.json`, update the owning direct development dependencies without bypassing compatibility checks, regenerate the lockfile intentionally, then rerun full and production-only audits plus build/typecheck/lint.

**No automated dependency update gate:**
- Risk: Dependency advisories and framework compatibility changes are discovered only by manual audit.
- Impact: Vulnerable transitive versions in `package-lock.json` can remain unnoticed, and large delayed upgrades increase regression risk.
- Migration plan: Add scheduled dependency review and CI audit policy after the lint/build environment is reliable; keep `package.json` and `package-lock.json` changes reviewed together.

## Missing Critical Features

**Durable, auditable business mutations:**
- Problem: Receiving, adjustments, transfers, checkout, orders, downpayments, releases, jobs, users, roles, and settings have no authorized transactional write path or immutable audit/movement history.
- Blocks: Production sales/inventory use, stock conservation, payment reconciliation, accountability, safe retries, and concurrent branch operations across `app/inventory/`, `app/stock-transfers/`, `app/pos/`, `app/customer-orders/`, `app/job-orders/`, and `app/users/`.

**Canonical domain contracts and validation:**
- Problem: UI fixtures, `lib/mock-data.ts`, `lib/catalog.ts`, and `prisma/schema.prisma` use divergent identifiers, statuses, money representations, and entity shapes; mutation schemas are absent.
- Blocks: Safe API expansion, consistent list/detail behavior, database migrations, imports, reporting, and deterministic tests across `app/`, `lib/`, and `prisma/`.

**Account lifecycle and recovery:**
- Problem: Public sign-up is correctly disabled, but no controlled account provisioning UI/service, password reset delivery, session administration, or audited role/location assignment workflow exists.
- Blocks: Safe onboarding/offboarding and credential recovery through `lib/server/auth.ts`, `app/users/page.tsx`, and `app/api/auth/[...all]/route.ts`.

**Production operations:**
- Problem: No CI workflow, deployment definition, startup environment validation, monitoring, backup/restore automation, or incident procedure exists.
- Blocks: Repeatable and supportable deployment of `app/`, `lib/server/`, and `prisma/migrations/`.

## Test Coverage Gaps

**Entire repository lacks automated tests:**
- What's not tested: There is no test runner, test script, test configuration, test file, coverage provider, or CI workflow.
- Files: `package.json`, `docs/TESTING.md`, `app/`, `components/`, `lib/`, `prisma/`
- Risk: Authentication, authorization, calculations, route contracts, rendering, and regressions depend entirely on manual checks.
- Priority: High

**Authentication and authorization matrix:**
- What's not tested: Session expiry, inactive users, each fixed role, missing/incorrect location assignment, Product denial, Branch Inventory scoping, proxy redirects, and direct API access.
- Files: `lib/server/auth.ts`, `lib/server/authorization.ts`, `proxy.ts`, `app/api/products/route.ts`, `app/api/inventory/route.ts`
- Risk: A policy regression can expose catalog or cross-branch inventory data without detection.
- Priority: High

**Prisma migration, seed, and catalog integration:**
- What's not tested: Fresh migration, deterministic seed, constraints, Decimal serialization, filter validation, pagination boundaries, database failures, and query semantics against PostgreSQL.
- Files: `prisma/migrations/20260824000000_initial_foundation/migration.sql`, `prisma/seed.mjs`, `prisma/schema.prisma`, `lib/server/catalog.ts`
- Risk: Schema and service drift can break deployment or return incorrect product/inventory results.
- Priority: High

**Money, stock, and workflow invariants:**
- What's not tested: Totals, downpayments, release eligibility, non-negative availability, reservations, receiving, adjustments, transfer state transitions, checkout, rollback, concurrency, and idempotency.
- Files: `app/customer-orders/`, `app/inventory/`, `app/stock-transfers/page.tsx`, `app/pos/page.tsx`, `app/job-orders/`
- Risk: These are financially and operationally critical behaviors; implementing persistence without tests can corrupt stock and payment records.
- Priority: High

**Large interactive pages and shared shell:**
- What's not tested: Filters, page resets, placeholder data, loading/empty/error states, dialogs, keyboard/accessibility behavior, responsive tables, sidebar state, theme persistence, and dynamic route correctness.
- Files: `app/products/page.tsx`, `app/inventory/page.tsx`, `app/users/page.tsx`, `app/stock-transfers/page.tsx`, `components/app-sidebar.tsx`, `components/app-header.tsx`
- Risk: Refactoring oversized pages or shared components can silently break core navigation and business UI behavior.
- Priority: Medium

**Error and degraded-state handling:**
- What's not tested: Network rejection during sign-in, malformed API JSON, database exceptions, unauthorized responses, React Query retries/recovery, and user-visible error messaging.
- Files: `app/sign-in/sign-in-form.tsx`, `lib/catalog.ts`, `app/products/page.tsx`, `app/inventory/page.tsx`, `app/api/products/route.ts`, `app/api/inventory/route.ts`
- Risk: Failures can leave stale data, indefinite submitting states, or generic screens without a recoverable user path.
- Priority: Medium

---

*Concerns audit: 2026-08-25*
