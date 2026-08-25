<!-- generated-by: gsd-doc-writer -->
# Testing

## Current status

Vitest `4.1.11` is configured with Node unit and serial integration projects. The first unit suite covers the read-only workbook profiler and its small hostile XLSX fixture. No DOM testing library, browser runner, coverage tool, automated database harness, or CI workflow is checked in. The application remains a Next.js UI prototype: authentication plus product/inventory reads use PostgreSQL, while most screens and all business mutations remain mock/local.

| Capability | Current state |
| --- | --- |
| Unit tests | Vitest Node project; workbook profiler suite checked in |
| Component tests | Not configured |
| Route-handler tests | Not configured |
| Database integration tests | Serial Vitest project configured, but no integration tests or disposable database harness are checked in yet |
| End-to-end tests | Not configured |
| Coverage reporting or thresholds | Not configured |
| CI test execution | Not configured; `.github/workflows/` is absent |

`npm run test` runs the unit project once. `npm run test:integration` is reserved for the separately protected disposable PostgreSQL harness and currently has no test files.

## Test framework and setup

Install exactly the dependencies recorded in `package-lock.json` before running Vitest or the available manual checks:

```bash
npm ci
```

Use `npm install` only when intentionally resolving or changing dependencies.

Vitest uses `vitest.config.ts`: unit tests run in Node and exclude `tests/integration/`; the integration project is serial. No automated test database harness is configured. Use a disposable database for manual verification; never reset an unknown developer database.

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
| `npm run test:integration` | Runs the serial integration project; no integration tests or disposable database harness exist yet. |
| `npm run build` | Creates a production Next.js build. A clean Node.js `20.20.2` isolated run passes on 2026-08-24, with existing Recharts zero-size prerender warnings. It is not a behavioral test suite. |
| `npm run typecheck` | Runs strict TypeScript with `tsc --noEmit`. A clean Node.js `20.20.2` isolated run passes on 2026-08-24. |
| `npm run lint` | Runs the checked-in ESLint flat configuration. It is reproducible but currently fails with 104 errors and 41 warnings from existing prototype code. |
| `npm audit --omit=dev` | Reports zero known production dependency findings as of 2026-08-24. The full development tree still reports one high and one low transitive tooling finding. |

Run each command in the current environment and record its exact outcome, including prompts, failures, timeouts, and skipped checks. Add explicit, reproducible scripts before enforcing them locally or in CI.

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

Add automation in layers. Only the Node unit and empty serial integration projects are configured today; DOM, browser, coverage, and CI commands below remain future work.

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

Better Auth sessions, active-account checks, and fixed role/location authorization exist for the current protected reads. Add a role/branch matrix and deterministic tests as each protected page, route handler, and mutation is implemented. Include unauthenticated, inactive/expired-session, wrong-role, wrong-branch, and allowed cases.

Client-side button visibility is only a usability check; it must never be the sole authorization assertion. Verify that direct HTTP requests cannot bypass the server policy and that denied operations leave the database unchanged.

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

The unit and integration script names are checked in. The remaining names are proposed interfaces only.

| Command | Current or intended scope |
| --- | --- |
| `npm run test` | Current: run Node unit tests once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:coverage` | Produce coverage once a coverage provider is configured. |
| `npm run test:integration` | Configured serial project; tests and disposable PostgreSQL harness are pending. |
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
