---
phase: 01-trusted-foundation-and-data-onboarding
plan: 13
subsystem: testing
tags: [postgresql-17, prisma, vitest, better-auth, integration-testing]

requires:
  - phase: 01-02
    provides: Node 20 Vitest unit and serial integration projects
provides:
  - Positively identified disposable PostgreSQL 17 lifecycle with migration and teardown safety
  - Canonical persisted fixed-role, location, active-account, and Better Auth session fixtures
  - Direct Request construction that retains hostile duplicate query order, raw bodies, and headers
affects: [01-06-seed-integration, 01-07-authorization, 01-09-user-management, 01-14-inventory-scope, 01-17-auth-surface]

actuals:
  tokens: 6367
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - Fixed-identity disposable PostgreSQL lifecycle without host bind mounts
    - Typed canonical and deliberately invalid persisted authorization fixtures
    - Ordered query tuples and direct body/header Request construction

key-files:
  created:
    - tests/helpers/database.ts
    - tests/helpers/database.test.ts
    - tests/helpers/factories.ts
    - tests/integration/factories.test.ts
    - tests/helpers/requests.ts
    - tests/helpers/requests.test.ts
  modified: []

key-decisions:
  - "Use only localhost port 55435, container chezcar_test_postgres_01_13, and database chezcar_test_01_13 under an exact test marker; never mount or inspect data/."
  - "Represent a revoked Better Auth session by verified absence after deleting its persisted Session row, matching immediate revocation semantics."
  - "Construct hostile requests from ordered query tuples and direct BodyInit/HeaderInit values so helpers do not collapse attacker-controlled input."

patterns-established:
  - "Database safety: assert the complete fixed target identity before the first command, then migrate and clean up only the container started by the helper."
  - "Authorization fixtures: valid role/location defaults reject drift unless a caller explicitly opts into invalid persisted assignments for fail-closed tests."

requirements-completed: [REQ-data-onboarding, REQ-role-authorization, REQ-user-management]

coverage:
  - id: D1
    description: "Integration setup accepts only the separately named disposable PostgreSQL 17 target, applies committed migrations serially, and tears it down without accessing the development bind mount."
    requirement: REQ-data-onboarding
    verification:
      - kind: unit
        ref: "tests/helpers/database.test.ts#assertDisposableDatabaseUrl and withDisposableDatabase"
        status: pass
      - kind: integration
        ref: "npm run test:integration -- tests/integration/factories.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Later route and service tests can reload canonical and deliberately invalid actors/session states and construct hostile direct requests without prototype fixtures."
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/factories.test.ts#persisted authorization factories"
        status: pass
      - kind: unit
        ref: "tests/helpers/requests.test.ts#createRequest"
        status: pass
    human_judgment: false

duration: 7 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 13: Disposable Database and Auth Factory Harness Summary

**Fixed-identity PostgreSQL 17 integration lifecycle with Prisma-backed canonical actors, Better Auth session states, and lossless hostile direct-request construction**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-25T06:54:42Z
- **Completed:** 2026-08-25T07:02:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added a fail-closed disposable database helper that recognizes one exact local test target, starts `postgres:17` without a bind mount, waits for readiness, applies committed Prisma migrations serially, and tears down its named container through failures.
- Added typed location, user, and session builders plus `createAuthFixture`, covering `SR`, all five active branches, all four fixed roles, inactive actors, valid/expired/revoked sessions, and six explicitly requested invalid assignment shapes.
- Added `createRequest` with tests proving duplicate/reordered hostile query values, direct raw bodies, and hostile headers survive construction at the native Request boundary.
- Established a real persisted integration test at `tests/integration/factories.test.ts`, executed by the existing serial `test:integration` project.

## Task Commits

TDD behavior was committed with explicit RED and GREEN gates:

1. **Task 1 RED: disposable database safety contract** - `3e03719` (test)
2. **Task 1 GREEN: protected PostgreSQL lifecycle** - `4765446` (feat)
3. **Task 2 RED: persisted auth and hostile request contracts** - `a5d34ef` (test)
4. **Task 2 GREEN: canonical factories and direct requests** - `0e92369` (feat)

## Files Created/Modified

- `tests/helpers/database.ts` - Exact disposable-target assertion, PostgreSQL 17 startup/readiness, serial migration, Prisma context, and failure-safe teardown.
- `tests/helpers/database.test.ts` - Refusal-before-command, no-bind-mount, lifecycle ordering, and migration-failure cleanup coverage.
- `tests/helpers/factories.ts` - Typed canonical location/user/session builders and explicit invalid assignment fixtures.
- `tests/integration/factories.test.ts` - Real PostgreSQL reload proof for actors, locations, session states, and invalid assignments.
- `tests/helpers/requests.ts` - Ordered-query and direct Request construction helper.
- `tests/helpers/requests.test.ts` - Duplicate/reordered hostile query, raw body, and header preservation proof.

## Decisions Made

- The integration target has a non-configurable identity: `chezcar_test_postgres_01_13`, database `chezcar_test_01_13`, localhost port `55435`, and marker `chezcar-integration-disposable-v1`. Callers cannot redirect lifecycle commands to an arbitrary URL.
- Revocation is represented by deleting the Better Auth `Session` row and retaining a typed fixture descriptor whose token reloads as absent; no noncanonical revoked column was added.
- Invalid role/location rows require `allowInvalidAssignment: true` or `includeInvalidAssignments: true`; valid builders reject them before persistence.

## Verification Evidence

All checks ran under Node `v20.19.0` against the separately named disposable PostgreSQL 17 container; the checked-in Compose service, port `5435`, database `chezcar_db`, and `data/` bind mount were not started, inspected, reset, or reused.

| Check | Result |
|---|---|
| `npm run test -- tests/helpers/database.test.ts` | PASS — 11/11 tests |
| `npm run test:integration -- tests/integration/factories.test.ts` | PASS — 1/1 persisted PostgreSQL integration test |
| `npm run test -- tests/helpers/requests.test.ts` | PASS — 3/3 tests |
| `npm run test` | PASS — 4 files, 38/38 unit tests |
| `npm run test:integration` | PASS — integration project executes `tests/integration/factories.test.ts`, 1/1 test |
| `npm run typecheck` | PASS |
| Post-run named-container check | PASS — `chezcar_test_postgres_01_13` was absent after teardown |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - Docker must be available for integration tests, and the helper provisions and removes its own isolated target.

## Known Stubs

None.

## Threat Flags

None - the destructive database boundary, persisted identity/session fixtures, and prototype-fixture drift are all covered by the plan threat model and automated tests.

## Next Phase Readiness

- Authorization, inventory-scope, user-management, seed, and Better Auth surface plans can reuse the protected database lifecycle and canonical persisted principals.
- Integration runs require Docker with the official `postgres:17` image available and localhost port `55435` free; target identity checks fail closed rather than falling back to development data.

## Self-Check: PASSED

- All six required implementation/test artifacts and this summary exist at their required paths.
- Commits `3e03719`, `4765446`, `a5d34ef`, and `0e92369` exist in git history.
- Every task verification and the full unit/integration/typecheck gate passed.
- The disposable container was absent after teardown, and unrelated dirty/untracked worktree items remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
