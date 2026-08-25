---
phase: 01-trusted-foundation-and-data-onboarding
plan: 09
subsystem: auth
tags: [better-auth, prisma, postgres, zod, vitest, user-management, session-revocation]

requires:
  - phase: 01-07
    provides: Persisted capability boundary with `users:manage` reserved for the owner Admin
  - phase: 01-17
    provides: Server-only unmounted Better Auth 1.6.23 Admin-plugin credential primitives (`internalUserAuth.api.createUser/setUserPassword`)
provides:
  - Owner-Admin-only User Management HTTP surface: GET/POST `/api/users`, PATCH `/api/users/:userId`, POST status/password subroutes
  - Safe managed-user DTOs, Zod request contracts, stable error envelopes, and same-origin client functions
  - Fixed three-role creation with server-resolved SR/branch/none assignment semantics
  - Idempotent deactivate/reactivate and credential reset with atomic same-transaction session revocation
affects: [01-10-first-login, users-page-ui]

actuals:
  tokens: 18500
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - Authorize-first thin route handlers delegating to an application service owning transaction boundaries
    - `SELECT ... FOR UPDATE` row locking inside Prisma interactive transactions for serialized access changes
    - Discriminated-union Zod create schema making hostile location fields unpersistable for Stock/Accounting roles

key-files:
  created:
    - lib/contracts/users.ts
    - lib/server/services/users.ts
    - app/api/users/route.ts
    - app/api/users/[userId]/route.ts
    - app/api/users/[userId]/status/route.ts
    - app/api/users/[userId]/password/route.ts
    - tests/integration/user-management.test.ts
    - tests/integration/session-revocation.test.ts
  modified: []

key-decisions:
  - "Create/update schemas strip or reject location fields for Stock and Accounting roles so hostile payloads can never persist a cross-branch assignment; Stock Staff resolves to the active SR warehouse server-side on every write."
  - "PATCH computes the full resulting role/location assignment inside the transaction after a FOR UPDATE row lock, reusing the current branch only when the target already holds one as Branch Staff."
  - "Credential resets run Better Auth setUserPassword first, then one transaction re-arms credentialSetupRequired and deletes all target sessions; repeated status/reset requests are idempotent no-ops that create no duplicates."
  - "List metadata counts staff only while the immutable owner Admin row still appears in data with isOwner true."

patterns-established:
  - "UserLifecycleError carries status/code so every route returns the same stable error envelope (401/403/404/409/400)."
  - "Test-only fault injection (`injectFailureAfterAccessWrite`) proves rollback of access state plus session deletion without polluting production behavior."

requirements-completed: [REQ-user-management, REQ-role-authorization]

coverage:
  - id: D1
    description: "Owner-Admin-only paginated/searchable/filterable safe-DTO user list with immutable owner marker and staff-only counts"
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/user-management.test.ts#lists paginated safe DTOs with an immutable owner marker and staff-only counts"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#filters by search, role, status, and location while counting staff only"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#serves only the owner Admin and denies every other principal without data"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fixed-role creation with exact SR/branch/none assignment semantics, temporary credential state, and safe duplicate-email conflicts including concurrency"
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/user-management.test.ts#creates one of three fixed roles with exact server-resolved location semantics"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#rejects duplicate normalized email safely, including concurrent submissions"
        status: pass
    human_judgment: false
  - id: D3
    description: "Idempotent update/deactivate/reactivate/reset lifecycle rejecting Admin targets with unchanged postconditions and no delete surface"
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/user-management.test.ts#updates staff fields and enforces the full resulting assignment"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#deactivates and reactivates idempotently without duplicates or a delete surface"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#resets credentials safely without duplication, echo, or surviving sessions"
        status: pass
    human_judgment: false
  - id: D4
    description: "Access changes revoke every existing target session atomically; forced failures roll back both writes; old cookies receive immediate 401"
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/session-revocation.test.ts#deletes every existing target session atomically and rejects old cookies immediately"
        status: pass
      - kind: integration
        ref: "tests/integration/session-revocation.test.ts#rolls back access state and session deletion together on forced failure"
        status: pass
    human_judgment: false
  - id: D5
    description: "Concurrent access changes serialize to one valid final assignment with no surviving pre-change session; wrong newly persisted scope receives a data-free 403"
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/session-revocation.test.ts#serializes concurrent access changes to one valid final assignment with no surviving pre-change session"
        status: pass
      - kind: integration
        ref: "tests/integration/session-revocation.test.ts#gives the wrong newly persisted scope a data-free 403 after re-authentication"
        status: pass
    human_judgment: false
  - id: D6
    description: "Generic Better Auth Admin operations remain unroutable through the public catch-all while the lifecycle APIs exist"
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/session-revocation.test.ts#keeps generic Admin operations unroutable while lifecycle APIs exist"
        status: pass
      - kind: integration
        ref: "tests/integration/auth-admin-surface.test.ts (full Plan 01-17 regression matrix retained)"
        status: pass
    human_judgment: false

duration: 51 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 09: Owner-Admin User Lifecycle APIs Summary

**Durable owner-Admin-only user lifecycle APIs over Better Auth 1.6.23 internal primitives: fixed three-role creation with server-resolved locations, idempotent status/reset flows, and access-change-plus-session-revocation committed in one PostgreSQL transaction**

## Performance

- **Duration:** 51 min
- **Started:** 2026-08-25T11:00:55Z
- **Completed:** 2026-08-25T11:52Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Delivered the narrow owner-Admin User Management surface: GET/POST `/api/users`, PATCH `/api/users/:userId`, and POST status/password subroutes, each authorizing `users:manage` before parsing input.
- Created fixed Stock/Branch/Accounting staff accounts through the guarded unmounted `internalUserAuth` primitives with exact location semantics: Stock Staff always resolves to the active SR warehouse, Branch Staff requires exactly one active canonical branch, Accounting Staff never receives a location.
- Implemented idempotent deactivate/reactivate and credential reset; deactivation, role/location change, and reset each delete every target session inside the same Prisma transaction as the User write, proven under injected failures and concurrent requests with `FOR UPDATE` row locking.
- Added 13 new PostgreSQL integration tests (8 lifecycle/list/create + 5 revocation/atomicity) plus client-safe Zod contracts, typed DTOs, and same-origin client functions.

## Task Commits

Each task was committed atomically (TDD tasks carry RED and GREEN commits):

1. **Task 1 RED: Define owner-Admin list/create contract** - `dd86972` (test)
2. **Task 1 GREEN: Serve owner-Admin list and fixed-role creation** - `00a8ba1` (feat)
3. **Task 2 RED: Define idempotent lifecycle and reset contract** - `39ed572` (test)
4. **Task 2 GREEN: Add update/status/password endpoints** - `ceab9cd` (feat)
5. **Task 3: Prove atomic access change and immediate revocation** - `5560efe` (test)

## Files Created/Modified

- `lib/contracts/users.ts` - Safe DTOs, discriminated-union create schema, update/status/password/query schemas, stable `UsersApiError`, same-origin client functions.
- `lib/server/services/users.ts` - Owner policy, D-13 assignment resolution/validation, P2002→409 conflict mapping, transactional updates with row locks and fault-injection points, `usersErrorResponse` envelope mapper.
- `app/api/users/route.ts` - GET list / POST create with authorize-first ordering.
- `app/api/users/[userId]/route.ts` - PATCH with full resulting-assignment validation.
- `app/api/users/[userId]/status/route.ts` - Idempotent activate/deactivate.
- `app/api/users/[userId]/password/route.ts` - Credential reset; never echoes the submitted password.
- `tests/integration/user-management.test.ts` - List metadata/filters, creation matrix, duplicate-email safety/concurrency, authorization denials, lifecycle idempotency, reset secrecy.
- `tests/integration/session-revocation.test.ts` - Atomic revocation, injected-failure rollback, concurrent serialization, old-cookie 401 / new-scope 403, generic Admin unroutable.

## Decisions Made

- Create/update request shapes make hostile location fields inert: Stock and Accounting variants strip extra fields and the service resolves SR/null server-side, so a forged `locationId` can never produce a cross-branch or second-location assignment (T-01-01).
- Email uniqueness maps every path (pre-check, Prisma P2002, Better Auth conflict text) to one stable `EMAIL_IN_USE` 409, keeping exactly one user/account under concurrent duplicate submissions.
- Reset ordering runs Better Auth `setUserPassword` first (credential authority), then a short transaction re-arms `credentialSetupRequired` and deletes sessions; reset is not required by the plan to be atomic across both stores and this ordering keeps the prompt truthful about the current password.
- List pagination includes the immutable owner row when filters match it, while all counts (`totalItems`, staff totals) exclude ADMIN per the staff-only counting truth.

## Deviations from Plan

None - plan executed exactly as written. All eight modified files are plan-owned; unrelated dirty/untracked worktree items were left untouched.

## Issues Encountered

- A stale disposable PostgreSQL container from a truncated-pipe test invocation caused container-name conflicts during one full-suite run; after removing the leaked container the complete integration suite passed 33/33, confirming this was environmental, not a code defect.
- One initial concurrency-test expectation assumed a branch-to-branch move would always follow a role-preserving first pair; the first serialized pair may legitimately leave the target as Accounting Staff, whose location-only patch correctly ignores the requested branch (D-13). The test was corrected to state complete assignments.

## TDD Gate Compliance

Tasks 1 and 2 have verified RED (`test`) then GREEN (`feat`) commit pairs. Task 3's transactional behavior (same-transaction `Session.deleteMany` with row locking and fault injection) was already implemented in the Task 1/Task 2 GREEN commits because correct status/PATCH responses were inseparable from atomic revocation; Task 3 therefore ships as a proof/evidence `test` commit (`5560efe`) without a dedicated `feat` commit. Its five assertions all pass against the committed implementation, and the concurrency suite caught one genuine test-expectation defect (documented above), demonstrating the proofs are live.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the planned trust boundaries. Mitigations land as follows: T-01-01/T-01-06 by role allowlist, server-resolved assignments, owner immutability, and the retained single-Admin unique index; T-01-02 by `requireCapability` plus in-service owner assertions with data-free denials; T-01-03 by same-transaction revocation with rollback and old-cookie proofs; T-01-07 by the retained unmounted-instance regression matrix; T-01-08 by masked requests, no response/log echo assertions, and Better Auth hashing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01-10's first-login flow can consume `credentialSetupRequired`, which only these lifecycle services arm.
- The `/users` page UI can bind directly to `lib/contracts/users.ts` types, Zod schemas, and client functions without touching server code.
- No blocker remains for downstream consumers of the user management surface.

## Self-Check: PASSED

- All eight created files exist at their required paths.
- Commits `dd86972`, `00a8ba1`, `39ed572`, `ceab9cd`, and `5560efe` exist in repository history.
- Focused suites pass (user-management 8/8, session-revocation 5/5), full integration passes 7 files 33/33, unit suite passes 137/137, strict typecheck exits 0.
- Unrelated dirty/untracked files remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
