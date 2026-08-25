<!-- generated-by: gsd-doc-writer -->
# Testing

## Current status

Vitest `4.1.11` is configured with Node unit and serial integration projects. The unit project covers the workbook profiler, canonicalizer, fixture generator, catalog-reset gates, access policy, shell DTOs, proxy denial, and the disposable-database/request helpers. The serial integration project covers migration application, seed/reload determinism, persisted authorization factories, inventory scope, the Better Auth admin surface, user management, session revocation, and first-login credential setup over a fixed-identity disposable PostgreSQL 17 container. No DOM testing library, browser runner, coverage tool, or CI workflow is checked in. The application remains a Next.js UI prototype: authentication, product/inventory reads, user management, and credential setup use PostgreSQL, while most screens and all sales/receiving/transfer mutations remain mock/local.

| Capability | Current state |
| --- | --- |
| Unit tests | Vitest Node project; 10 suite files checked in (workbook, canonicalization, generation, reset gates, policy, shell, proxy, helpers) |
| Component tests | Not configured |
| Route-handler tests | Unit-project direct-handler authorization suites (`tests/routes/authorization.test.ts`, `proxy.test.ts`); no DOM/browser runner |
| Database integration tests | Serial Vitest project with fixed-identity disposable PostgreSQL 17 harness; 8 integration suite files checked in |
| End-to-end tests | Not configured |
| Coverage reporting or thresholds | Not configured |
| CI test execution | Not configured; `.github/workflows/` is absent |
| Phase evidence gate | `npm run verify:phase-01 -- --validate-evidence` runs fresh migration/seed/double-reload plus all suites on the disposable target |

`npm run test` runs the unit project once. `npm run test:integration` starts its own disposable PostgreSQL container (never a bind mount) and must not overlap another instance of the same container name/port.

## Test framework and setup

Install exactly the dependencies recorded in `package-lock.json` before running Vitest or the available manual checks:

```bash
npm ci
```

Use `npm install` only when intentionally resolving or changing dependencies.

Vitest uses `vitest.config.ts`: unit tests run in Node and exclude `tests/integration/`; the integration project is serial with `--no-file-parallelism`. The integration lifecycle helper accepts only the exact disposable identity — container `chezcar_test_postgres_01_13`, port `55435`, database `chezcar_test_01_13`, no bind mount — and tears down only the container it started. Use that target for manual database verification; never reset an unknown developer database.

## Running tests

Run the current unit suite once:

```bash
npm run test
```

Run one changed test file without watch mode:

```bash
npm run test -- scripts/data-onboarding/workbook-profile.test.ts
```

The current scripts provide these verification paths:

| Command | Current purpose and caveat |
| --- | --- |
| `npm run dev` | Starts the application for manual browser and HTTP verification. |
| `npm run test` | Runs the Vitest Node unit project once. |
| `npm run test -- <test-file>` | Runs a focused unit test file once. |
| `npm run test:integration` | Runs the serial integration project against the disposable PostgreSQL 17 harness it starts itself. |
| `npm run verify:phase-01 -- --validate-evidence` | Phase 1 evidence gate: asserts the disposable test target plus seed/reset environment, then records fresh migration deploy, seed, two hash-equivalent catalog reloads, full unit/integration suites, typecheck, and build in `docs/verification/phase-01-evidence.md`; captures lint's expected failure baseline separately and preserves completed manual UAT rows across reruns. |
| `npm run build` | Creates a production Next.js build. A clean Node.js `20.20.2` isolated run passes on 2026-08-24, with existing Recharts zero-size prerender warnings. It is not a behavioral test suite. |
| `npm run typecheck` | Runs strict TypeScript with `tsc --noEmit`. A clean Node.js `20.20.2` isolated run passes on 2026-08-24. |
| `npm run lint` | Runs the checked-in ESLint flat configuration. It is reproducible but currently fails with 96 errors and 49 warnings from existing prototype code (fresh baseline captured by the 2026-08-25 phase gate). |
| `npm audit --omit=dev` | Reports zero known production dependency findings as of 2026-08-24. The full development tree still reports one high and one low transitive tooling finding. |

## Checked-in suites

Unit project (`npm run test`):

| Suite | Owner plan | Covers |
| --- | --- | --- |
| `scripts/data-onboarding/workbook-profile.test.ts` | 01-02 | Read-only selected-sheet profiling, inert formulas, hostile fixture determinism |
| `scripts/data-onboarding/canonicalize.test.ts` | 01-03/01-04 | Row classification, temporary codes, blocking findings, owner-resolution coverage |
| `scripts/data-onboarding/generate-seed.test.ts` | 01-05 | Byte-stable canonical fixture and source-map generation |
| `lib/server/services/catalog-reset.test.ts` | 01-06 | Positive reset gates; production/unknown/bind-mount refusal |
| `lib/server/authorization.test.ts` | 01-07 | Fixed persisted access policy and capability guards |
| `tests/routes/authorization.test.ts` | 01-07/01-14 | Direct-handler authorization order for dashboard/customers/orders/products/inventory |
| `lib/server/shell.test.ts` | 01-08 | Four-role shell DTOs and scope feedback |
| `proxy.test.ts` | 01-15 | Page session routing, capability denial, safe callbacks |
| `tests/helpers/database.test.ts` | 01-13 | Disposable target assertion and lifecycle |
| `tests/helpers/requests.test.ts` | 01-13 | Hostile direct-request construction |

Integration project (`npm run test:integration`, serial over disposable PostgreSQL):

| Suite | Owner plan | Covers |
| --- | --- | --- |
| `tests/integration/migration.test.ts` | 01-06 | Trusted-foundation migration application and constraint refusals |
| `tests/integration/seed.test.ts` | 01-06 | Fresh/repeat seed producing exact locations/products/balances |
| `tests/integration/factories.test.ts` | 01-13 | Persisted actor/session fixtures including deliberately invalid assignments |
| `tests/integration/inventory-scope.test.ts` | 01-14 | Admin/Branch/SR persisted scopes and Accounting denial under hostile requests |
| `tests/integration/auth-admin-surface.test.ts` | 01-17 | Internal credential engine; public sign-up and generic admin operations unroutable |
| `tests/integration/user-management.test.ts` | 01-09 | Owner-only user list/create/update semantics and error envelopes |
| `tests/integration/session-revocation.test.ts` | 01-09 | Atomic access-change/session revocation, rollback, concurrency |
| `tests/integration/credential-setup.test.ts` | 01-10 | Prompt arming/consumption, change/skip, other-session revocation |

Shared helpers live under `tests/helpers/`: `database.ts` (disposable PostgreSQL lifecycle), `factories.ts` (persisted authorization fixtures), and `requests.ts` (direct Request construction preserving hostile query/body/header input).

## Manual verification available now

Start the prototype:

```bash
npm run dev
```

Use the local URL printed by Next.js, then check the following current-prototype smoke path. This inventory includes deferred screens so current prototype regressions remain visible; it is not the MVP acceptance scope:

1. Confirm an unauthenticated `/` request redirects to `/sign-in`; after sign-in, `/` redirects to `/dashboard`.
2. Navigate through Customers, Products, Inventory, Customer Orders, Job Orders, Stock Transfers, Reports, Notifications, Branches, Users, Roles, and Settings from the application shell.
3. On list screens, exercise search, filters, pagination, dialogs, and loading states.
4. Exercise the inventory receive and transfer forms, customer-order create/detail/release screens, job-order create/edit screens, and stock-transfer state controls.
5. Confirm Products and the primary Inventory list survive reload because they are database reads; other UI changes generally remain non-persistent.
6. Check narrow and wide viewports, sidebar behavior, and light/dark theme selection.

Authenticated route handlers can be inspected while the development server is running. Supply a Better Auth session cookie:

```bash
curl --fail --cookie "<session-cookie>" http://localhost:3000/api/dashboard
curl --fail --cookie "<session-cookie>" http://localhost:3000/api/customers
curl --fail --cookie "<session-cookie>" http://localhost:3000/api/products
curl --fail --cookie "<session-cookie>" http://localhost:3000/api/inventory
curl --fail --cookie "<session-cookie>" http://localhost:3000/api/customer-orders
```

Products and inventory return validated, paginated PostgreSQL data. Dashboard, customers, and customer orders remain protected fixtures. Unauthenticated calls should return `401`; a Branch Staff inventory call must return only its assigned location even when another location is requested.

## Writing new tests

The checked-in Vitest conventions are:

- Place tests beside source as `*.test.ts` for pure code and route handlers, and `*.test.tsx` for React components.
- Place PostgreSQL integration tests under `tests/integration/*.test.ts`; keep them serial or worker-isolated and use only a positively identified disposable target.
- Put deterministic fixtures under `tests/fixtures/` and shared database/request helpers under `tests/helpers/`.
- Prefer small, explicit fixtures over importing the complete arrays from `lib/mock-data.ts` when testing edge cases.
- Test observable behavior and domain outcomes rather than component implementation details.

The existing pure functions in `lib/dashboard-data.ts` are suitable first unit-test candidates, including filtering, pending-order selection, product grouping, numeric coercion, and status styling. Reusable UI components under `components/` are suitable first component-test candidates.

## Incremental test strategy

Add automation in layers. The Node unit project and the serial integration project over disposable PostgreSQL are configured today; DOM, browser, coverage, and CI commands below remain future work.

### 1. Pure functions and React components

The current Vitest unit project uses the Node environment. Add a separate browser-like project plus React Testing Library and `@testing-library/jest-dom` before component tests. Begin with `lib/dashboard-data.ts`, `components/page-shell.tsx`, `components/simple-table.tsx`, and focused controls under `components/ui/`.

Test calculations and boundary values with pure unit tests. For components, test accessible names, keyboard interaction, loading/empty states, dialogs, form validation, callbacks, and conditional rendering. Split oversized page components before attempting broad page-level component tests.

### 2. Route handlers

Add direct tests for each exported `GET` function under `app/api/`. Assert the status, content type, and full response contract rather than only checking that a request succeeds. As handlers gain query parameters and mutations, cover malformed input, not-found cases, conflicts, and standardized errors.

Keep route handlers thin. Mock domain-service boundaries in handler unit tests, then use separate integration tests to prove that the real service and persistence adapters work together.

### 3. Domain services

Once business behavior is extracted from client pages, add service-level tests before connecting it to forms or routes. Prioritize invariants for:

- receipt identity, sale totals/discount/payment capture, inventory deduction, and non-negative quantities;
- individual Accounting verification, structured mismatches, and linked Admin corrections;
- Stock Room receiving plus transfer dispatch, matched receipt, discrepancy, investigation, and final resolution transitions;
- durable notification recipient selection, cursor replay, and browser push attempts;
- role/location scope, duplicate identifiers, idempotent commands, and offline `NEEDS_REVIEW` outcomes.

Use table-driven cases and inject repositories, clocks, and identifier generators so these tests remain deterministic.

### 4. Prisma and transaction integration

As transactional Prisma services and migrations are added, run integration tests against a dedicated disposable PostgreSQL database, not the local development data directory. Apply migrations before the suite, seed only the minimum fixture set, and clean data between tests.

Exercise real transaction boundaries for sale posting/correction, Stock Room receiving, transfer dispatch/receipt, and discrepancy resolution. Assert both successful commits and complete rollback after a forced failure midway through a multi-write operation. Add concurrency cases for competing stock updates and verify that retries or conflicts cannot oversell inventory or apply a movement twice.

### 5. Authentication and authorization

Better Auth sessions, active-account checks, fixed capability authorization, session revocation, the internal credential surface, and the first-login prompt now have unit and integration suites (see the checked-in suites above). Extend this matrix as each new protected page, route handler, and mutation is implemented: include unauthenticated, inactive/expired-session, wrong-role, wrong-branch, revoked-session, and allowed cases.

Client-side button visibility is only a usability check; it must never be the sole authorization assertion. Verify that direct HTTP requests cannot bypass the server policy and that denied operations leave the database unchanged — `tests/helpers/requests.ts` exists for exactly this hostile-input style.

### 6. End-to-end journeys

After durable APIs, authentication, and persistence exist, configure Playwright for a small set of critical journeys:

1. Sign in and enforce role/location access, including account deactivation and reassignment.
2. Encode a handwritten-receipt sale, verify the stock deduction, and complete Accounting verification or mismatch resolution.
3. Receive inventory into `SR`, dispatch an `SR`-to-branch transfer, and confirm an exact receipt.
4. Submit a transfer discrepancy, record Stock Staff findings, and post the Admin resolution.
5. Reconnect an offline branch device and verify accepted and `Needs Review` sync outcomes without negative stock.

Seed isolated accounts and records for each test, use stable semantic locators, and avoid depending on test order. Keep visual regression testing selective until the functional journeys are stable.

### 7. Realtime notifications and offline synchronization

When the proposed PWA/realtime architecture exists, add deterministic tests for:

- notification/outbox creation rolling back with its triggering transaction;
- globally ordered cursor replay, SSE reconnect, polling catch-up, and duplicate-delivery deduplication;
- per-user notification expansion/read state plus recipient and branch authorization for historical notifications;
- server-side canonical hash computation, identical idempotency-key/hash replay, conflicting key/hash reuse, and atomic SyncOperation/business writes;
- partial sync batches, retryable failures, poison operations, and explicit aggregate dependencies;
- duplicate receipts, immutable server price-version validation, stale/deactivated prices, stale transfer versions, and once-only transfer receipt commands;
- insufficient cached or canonical stock, non-negative `onHand` enforcement, preserved `NEEDS_REVIEW` submissions, and discrepancy creation;
- one logical branch activation epoch, authoritative server-side expiry, normal replacement, emergency replacement, and old/expired-epoch submissions entering review;
- service-worker upgrade, stale snapshot labeling, IndexedDB migration, logout cleanup, queue recovery, and browser-storage loss;
- online/offline transitions in supported desktop and mobile browsers.

Use network interception to simulate disconnects, delayed responses, retries, and reconnects. Run database integration tests for every sync invariant; browser tests alone cannot prove transactional idempotency or inventory conservation.

## Recommended future commands

The unit and integration script names plus the phase gate are checked in. The remaining names are proposed interfaces only.

| Command | Current or intended scope |
| --- | --- |
| `npm run test` | Current: run Node unit tests once. |
| `npm run test:integration` | Current: run serial integration tests against the disposable PostgreSQL 17 harness. |
| `npm run verify:phase-01 -- --validate-evidence` | Current: run the consolidated Phase 1 evidence gate and validate the committed evidence report. |
| `npm run test:watch` | Run Vitest in watch mode. Not checked in; no watch-mode flags are used by the gate. |
| `npm run test:coverage` | Produce coverage once a coverage provider is configured. |
| `npm run test:e2e` | Run Playwright journeys once E2E infrastructure exists. |

The current focused Vitest invocation is `npm run test -- path/to/file.test.ts`. A future configured Playwright suite could use `npm run test:e2e -- tests/e2e/receipt-sale.spec.ts`.

## Coverage requirements

No coverage provider, report format, exclusion list, or minimum threshold is configured.

| Type | Threshold |
| --- | --- |
| Lines | Not configured |
| Branches | Not configured |
| Functions | Not configured |
| Statements | Not configured |

When coverage is introduced, establish a measured baseline first and raise it incrementally. Treat transaction, authorization, and domain-invariant coverage as mandatory review concerns even if repository-wide percentage targets remain modest.

## CI integration

No GitHub Actions or other CI configuration is present, so tests, type checking, linting, and builds do not run automatically on pushes or pull requests.

Once the local commands are reliable, add a pull-request workflow that installs dependencies with `npm ci` and runs type checking, linting, unit/component tests, and a production build. Run Prisma integration tests in a separate job with an isolated PostgreSQL service. Add the critical E2E subset after the application has stable authentication, database seeding, and server-backed workflows.
