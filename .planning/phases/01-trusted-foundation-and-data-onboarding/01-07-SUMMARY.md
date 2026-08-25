---
phase: 01-trusted-foundation-and-data-onboarding
plan: 07
subsystem: authorization
tags: [better-auth, prisma, capabilities, persisted-scope, vitest]

requires:
  - phase: 01-06
    provides: Persisted active account state, fixed role nullability, and canonical active locations
provides:
  - Pure fixed capability and exact persisted role/location assignment policy
  - Per-request active User and Location reload with fail-closed 401/403 outcomes
  - Named capability guards for dashboard, customers, customer orders, and products
affects: [01-08-shell-access, 01-09-user-management, 01-14-inventory-scope, 01-15-page-denial]

actuals:
  tokens: 5842
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Pure role-capability evaluation over persisted active User and canonical Location context
    - Route authorization before query parsing or protected service execution

key-files:
  created:
    - lib/server/policy/access.ts
    - lib/server/authorization.test.ts
    - tests/routes/authorization.test.ts
  modified:
    - lib/server/authorization.ts
    - app/api/dashboard/route.ts
    - app/api/customers/route.ts
    - app/api/customer-orders/route.ts
    - app/api/products/route.ts

key-decisions:
  - "Treat only SR as the active Stock Staff warehouse and only QC, BL, LU, VC, or SP as active Branch Staff assignments; every other persisted combination fails closed."
  - "Preserve the four migrated routes' existing role reach while expressing it through named capabilities; Accounting remains denied Products and Inventory."

patterns-established:
  - "Persisted authorization: resolve the Better Auth session, reload User plus Location, validate assignment, then evaluate one named capability."
  - "Denied route work: authorize before parsing filters or calling protected services and return only the stable error envelope."

requirements-completed: [REQ-role-authorization]

coverage:
  - id: D1
    description: "All four roles and every missing, extra, incompatible, or inactive location assignment produce deterministic fail-closed capability decisions from persisted context."
    requirement: REQ-role-authorization
    verification:
      - kind: unit
        ref: "lib/server/authorization.test.ts#fixed persisted access policy and requireCapability"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dashboard, customers, customer orders, and products independently authorize with named capabilities before protected work and return data-free 401/403 envelopes on denial."
    requirement: REQ-role-authorization
    verification:
      - kind: unit
        ref: "tests/routes/authorization.test.ts#parameterized direct-handler authorization"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false

duration: 10 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 07: Persisted Capability Boundary Summary

**A pure fixed-role capability matrix now reloads active persisted User/Location scope on every sensitive request and independently guards four read routes with data-free denial envelopes**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-25T08:54:17Z
- **Completed:** 2026-08-25T09:04:26Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Defined typed resources, actions, named capabilities, persisted access context, exact assignment validation, and deterministic capability evaluation for all four roles.
- Reloaded active User and Location code/type/status on each guard and ignored caller/session role or location fields.
- Migrated dashboard, customers, customer orders, and products from route-owned role arrays to independent named capability checks before protected work.
- Added 46 focused policy and direct-handler assertions, with the complete unit suite passing 101 tests.

## Task Commits

TDD tasks include separate RED and GREEN commits:

1. **Task 1 RED: Define persisted capability boundary** - `a14ef3e` (test)
2. **Task 1 GREEN: Enforce persisted capability policy** - `e8ec253` (feat)
3. **Task 2 RED: Define sensitive route capability gates** - `c856c5e` (test)
4. **Task 2 GREEN: Guard sensitive reads by capability** - `58387ac` (feat)

## Files Created/Modified

- `lib/server/policy/access.ts` - Fixed capabilities, exact canonical role/location validation, and pure access evaluation.
- `lib/server/authorization.ts` - Persisted active-user/location loader plus `requireCapability`; temporary inventory compatibility still uses the same validated loader pending Plan 01-14.
- `lib/server/authorization.test.ts` - Four-role assignment, capability, session, and persisted-context matrix.
- `tests/routes/authorization.test.ts` - Parameterized direct-handler 401/403/success and guard-order proof.
- `app/api/dashboard/route.ts` - `dashboard:view` guard.
- `app/api/customers/route.ts` - `customers:view` guard.
- `app/api/customer-orders/route.ts` - `customer-orders:view` guard.
- `app/api/products/route.ts` - `products:view` guard before query parsing and Prisma service execution.

## Decisions Made

- Canonical assignment validity is closed over the fixed six location codes: Stock Staff requires active `SR`/`WAREHOUSE`; Branch Staff requires one active `QC`, `BL`, `LU`, `VC`, or `SP`/`BRANCH`; Admin and Accounting require no location.
- Current endpoint reach remains unchanged while route policy moves to names: all fixed roles can read dashboard/customers/customer orders, while Products remains Admin/Stock only. Accounting explicitly has no Inventory capability.
- Inventory's existing role-array API is retained only as a compatibility caller over the new exact persisted loader; Plan 01-14 owns its named `inventory:view` migration and typed data-scope closure.

## Verification Evidence

| Check | Result |
|---|---|
| `npm run test -- lib/server/authorization.test.ts` | PASS — 33/33 tests |
| `npm run test -- tests/routes/authorization.test.ts` | PASS — 13/13 tests |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — 8 files, 101/101 unit tests |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Vitest does not resolve the project's TypeScript `@/*` path alias by default. Focused tests use relative imports for modules under test and mock existing alias-based server boundaries; production imports remain consistent with repository conventions.

## Authentication Gates

None.

## Known Stubs

None. The inventory compatibility wrapper is an explicit dependency boundary for Plan 01-14, not an incomplete deliverable of this four-route plan.

## Threat Flags

None. The session-to-persisted-context and route-to-capability surfaces are the planned trust boundaries and are covered by fail-closed tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01-08 can derive shell capabilities and scope labels from the pure persisted policy without granting Accounting Inventory access.
- Plans 01-09 and 01-14 can reuse `requireCapability` for owner-only user operations and named Inventory authorization.
- No blocker remains for the Wave 8 authorization consumers.

## Self-Check: PASSED

- All eight created/modified implementation and test files exist at their required paths.
- Task commits `a14ef3e`, `e8ec253`, `c856c5e`, and `58387ac` exist in repository history.
- Both focused suites, strict type-check, and the complete unit suite pass.
- Unrelated dirty/untracked files remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
