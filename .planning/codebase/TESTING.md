# Testing Patterns

**Analysis Date:** 2026-08-25

## Test Framework

**Runner:**
- Not detected. `package.json` contains no Jest, Vitest, Playwright, Cypress, Testing Library, or test-environment dependency.
- Config: Not detected; no test runner configuration exists at the repository root, and `docs/TESTING.md` records the same absence.

**Assertion Library:**
- Not detected in `package.json`; no automated assertions are checked in.

**Run Commands:**
```bash
# No automated test, watch, or coverage command is configured in package.json.
npm run typecheck       # Strict static type verification; not a behavioral test
npm run lint            # ESLint verification; currently fails on existing debt
npm run build           # Production build verification; not a behavioral test
npm run dev             # Start the app for manual browser/HTTP checks
```

- Do not run or document `npm test` as available: `package.json` has no `test` script.
- Record the exact result of each command rather than assuming the status documented in `AGENTS.md` or `docs/TESTING.md` still applies.
- `AGENTS.md` records that lint currently fails with 104 errors and 41 warnings; do not treat `npm run lint` as a passing quality gate.

## Test File Organization

**Location:**
- Not detected. There are no `*.test.*` or `*.spec.*` files and no `tests/`, `test/`, `__tests__/`, or `e2e/` directory.
- Production code is organized under `app/`, `components/`, and `lib/`, but no established test colocation pattern exists.

**Naming:**
- Not detected. No repository-enforced test filename convention exists in `package.json`, `eslint.config.mjs`, or the source tree.

**Structure:**
```text
chezcar-ui-starter/
└── (no automated test directories or files)
```

## Test Structure

**Suite Organization:**
```typescript
// Not applicable: no describe/it/test suites exist in the repository.
```

**Patterns:**
- Setup pattern: Not detected; no test setup file or test environment is configured in `package.json` or at the repository root.
- Teardown pattern: Not detected; there is no database test harness or fixture cleanup implementation. The runtime Prisma singleton in `lib/server/prisma.ts` is not a test lifecycle helper.
- Assertion pattern: Not detected; current verification is manual and command-based as documented in `docs/TESTING.md`.
- Until a runner is introduced, use the manual route/state checks in `docs/TESTING.md` and the static/build commands from `package.json`; never describe these as automated behavioral coverage.

## Mocking

**Framework:** Not detected in `package.json`.

**Patterns:**
```typescript
// No vi.mock, jest.mock, request interception, fake timers,
// or shared dependency-substitution pattern exists in the codebase.
```

**What to Mock:**
- No automated mocking convention currently exists. Runtime prototype fixtures in `lib/mock-data.ts` and page-local arrays are application data, not test doubles.
- React Query list simulations in pages such as `app/customers/page.tsx` and `app/job-orders/page.tsx` are UI prototype behavior, not test mocks.
- When manually checking database-backed pages, treat `/api/products` and `/api/inventory` as real authenticated Prisma reads implemented by `app/api/products/route.ts`, `app/api/inventory/route.ts`, and `lib/server/catalog.ts`.

**What NOT to Mock:**
- Do not claim page-local arrays or `lib/mock-data.ts` prove persistence, authorization, transactions, or reload durability; `AGENTS.md` explicitly identifies most workflows as mock/local.
- Do not substitute hidden buttons or navigation visibility for server authorization checks. The actual server policy is in `lib/server/authorization.ts`.
- Do not use the live development data directory as disposable test state; `docs/TESTING.md` requires a dedicated disposable PostgreSQL database for database verification.

## Fixtures and Factories

**Test Data:**
```typescript
// No test fixture/factory API exists.
// Runtime prototype fixtures are exported directly, for example:
// lib/mock-data.ts -> customers, jobOrders, transfers, orders, products
```

**Location:**
- No test fixture directory exists. Runtime mock records live in `lib/mock-data.ts`, while additional route-local fixture/types live in files such as `app/inventory/_data.ts` and oversized business pages.
- The environment-driven development seed is `prisma/seed.mjs`; it provisions runtime development data and is not an isolated automated-test factory.
- Do not import entire runtime fixture arrays as an implicit testing standard. Their shapes differ from contracts in `lib/catalog.ts` and models in `prisma/schema.prisma`.

## Coverage

**Requirements:** None enforced. `package.json` has no coverage provider or script, no coverage config exists, and `docs/TESTING.md` records no line, branch, function, or statement threshold.

**View Coverage:**
```bash
# Not available: no coverage command or provider is configured in package.json.
```

- No coverage report directory is generated or committed.
- Do not report type checking, linting, building, manual smoke checks, or runtime mock data as code coverage.

## Test Types

**Unit Tests:**
- Not used. No unit runner or unit files exist.
- Pure functions in `lib/dashboard-data.ts` and query/status helpers in `lib/server/catalog.ts` have no automated boundary-case coverage.

**Integration Tests:**
- Not used as an automated suite. Authentication, authorization, Prisma reads, migration, and seed paths are only manually verifiable through `app/api/**`, `lib/server/authorization.ts`, `lib/server/catalog.ts`, and `prisma/seed.mjs`.
- `docs/TESTING.md` documents manual authenticated `curl` checks for `/api/dashboard`, `/api/customers`, `/api/products`, `/api/inventory`, and `/api/customer-orders` while `npm run dev` is running.
- Manual API checks must include unauthenticated `401` behavior and Branch Staff inventory scoping implemented by `lib/server/authorization.ts` and `app/api/inventory/route.ts`.

**E2E Tests:**
- Not used. No Playwright or Cypress dependency/configuration exists in `package.json` or the repository root.
- Manual browser smoke coverage is described in `docs/TESTING.md`: authentication redirects, shell navigation, lists, forms, reload behavior, responsive layouts, and light/dark themes.
- Products and the primary inventory list read persisted data through `lib/catalog.ts`; most other screens remain local/mock behavior per `AGENTS.md`, so a successful click path does not imply durable workflow completion.

## Common Patterns

**Async Testing:**
```typescript
// No automated async-test pattern exists.
// Runtime async behavior to verify manually includes the React Query contract:
const { data, error, isLoading, isFetching } = useQuery({
  queryKey: ["products-master-list", { page, pageSize }],
  queryFn: () => fetchProducts({ page, pageSize }),
  placeholderData: (previousData) => previousData,
});
```

- The complete production query key in `app/products/page.tsx` includes page, page size, and every applied filter; manual checks should exercise initial loading, background fetching, pagination, filter apply/reset, empty results, and errors.
- The global React Query defaults in `app/provider.tsx` set a 30-second `staleTime` and disable refetch on window focus; account for those runtime semantics during manual checks.
- Mock list pages may simulate latency, but this is application behavior rather than fake-timer test coverage; examples include `app/customers/page.tsx`, `app/branches/page.tsx`, and `app/job-orders/page.tsx`.

**Error Testing:**
```typescript
// No automated rejection/assertion pattern exists.
// Current route behavior is checked manually by HTTP status and JSON envelope:
// 400 -> { error: { code: "INVALID_QUERY", message: "..." } }
// 401 -> { error: { code: "UNAUTHENTICATED", message: "..." } }
// 403 -> { error: { code: "FORBIDDEN", message: "..." } }
// 500 -> { error: { code: "INTERNAL_ERROR", message: "..." } }
```

- Verify malformed query handling in `app/api/products/route.ts` and `app/api/inventory/route.ts` against schemas from `lib/server/catalog.ts`.
- Verify unauthenticated, inactive-account, wrong-role, and missing-branch-assignment paths implemented in `lib/server/authorization.ts`; no automated matrix currently covers them.
- Verify browser-visible API errors through React Query's `error` branch in `app/products/page.tsx` and `app/inventory/page.tsx`.
- Verify sign-in failure state, submit disabling, and successful navigation manually in `app/sign-in/sign-in-form.tsx`.

---

*Testing analysis: 2026-08-25*
