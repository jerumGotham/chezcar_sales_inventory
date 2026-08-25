---
phase: 01-trusted-foundation-and-data-onboarding
plan: 14
subsystem: authorization
tags: [inventory, authorization, prisma, postgres, vitest]

requires:
  - phase: 01-07
    provides: Named capabilities, persisted access context, and stable authorization errors
  - phase: 01-13
    provides: Disposable PostgreSQL and direct-request integration helpers
provides:
  - Independent inventory:view route authorization before query parsing
  - Typed persisted Branch and Stock inventory scopes plus canonical Admin selection
  - Hostile direct-request PostgreSQL proof for Admin, Stock, Branch, and denied Accounting
affects: [01-15-page-denial, 01-16-inventory-controls, phase-02-inventory]

actuals:
  tokens: 5240
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - Persisted authorization context determines data scope before Prisma filters
    - Duplicate caller scope is role-aware and order-invariant

key-files:
  created:
    - tests/integration/inventory-scope.test.ts
  modified:
    - app/api/inventory/route.ts
    - lib/server/catalog.ts
    - tests/routes/authorization.test.ts
    - docs/API.md

key-decisions:
  - "Branch Staff location input is ignored in favor of its persisted active branch, while Stock Staff is always fixed to persisted SR."
  - "Admin may select all inventory or one active canonical location by ID, code, or exact name; conflicting duplicate scope values fail with 400."
  - "Accounting has no inventory:view capability and receives a data-free 403 before query parsing or catalog work."

patterns-established:
  - "Inventory scope resolution: validate persisted assignment and capability again at the service boundary, then construct only a typed all/location Prisma scope."
  - "Hostile query normalization: fixed-scope roles discard caller location values; Admin conflicting duplicates are rejected independent of order."

requirements-completed: [REQ-role-authorization]

coverage:
  - id: D1
    description: "Inventory independently requires inventory:view before parsing filters or executing protected catalog work, with stable data-free 401/403 responses."
    requirement: REQ-role-authorization
    verification:
      - kind: unit
        ref: "tests/routes/authorization.test.ts#inventory authorization and guard order"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Branch remains in its persisted branch, Stock remains in SR, Admin receives only authorized selected scope, and Accounting receives no inventory rows under hostile direct requests."
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/inventory-scope.test.ts#inventory persisted location scope"
        status: pass
    human_judgment: false

duration: 11 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 14: Hostile Inventory Scope Boundary Summary

**Inventory now authorizes through `inventory:view` and derives every Prisma location filter from persisted Branch/SR scope or a validated canonical Admin selection, with Accounting denied before protected work**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-25T09:24:05Z
- **Completed:** 2026-08-25T09:34:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Replaced Inventory's route-owned role array with the named persisted `inventory:view` capability before query parsing and catalog execution.
- Added typed `resolveLocationScope` enforcement: Branch Staff cannot leave its persisted active branch, Stock Staff is fixed to persisted `SR`, and Admin can use All or one active canonical location.
- Added disposable PostgreSQL direct-request proof using distinct SR/QC/BL markers, hostile duplicate/reordered scope parameters, invalid assignments, and explicit data-free Accounting denial.
- Documented the enforced Inventory API scope contract.

## Task Commits

TDD tasks include separate RED and GREEN commits:

1. **Task 1 RED: Define inventory capability boundary** - `6508088` (test)
2. **Task 1 GREEN: Gate Inventory by persisted capability** - `1b8302f` (feat)
3. **Task 2 RED: Prove hostile inventory scope isolation** - `ae8ffac` (test)
4. **Task 2 GREEN: Enforce persisted inventory data scope** - `fa14681` (feat)
5. **Required API synchronization** - `5da54bd` (docs)

## Files Created/Modified

- `app/api/inventory/route.ts` - Authorizes `inventory:view`, then parses role-aware query scope and delegates with persisted context.
- `lib/server/catalog.ts` - Canonicalizes query values, resolves typed persisted location scope, and applies it consistently to data and summaries.
- `tests/routes/authorization.test.ts` - Adds Inventory to the direct-handler capability matrix plus inactive/revoked and guard-order proof.
- `tests/integration/inventory-scope.test.ts` - Seeds marker balances and proves hostile four-role behavior against disposable PostgreSQL 17.
- `docs/API.md` - Records named capability, Accounting denial, fixed Branch/SR scope, and canonical Admin selection.

## Decisions Made

- Non-Admin location parameters cannot affect scope: Branch and Stock requests normalize the caller location to a neutral value before the persisted resolver fixes the actual location.
- Admin scope accepts canonical active locations by persisted ID, code, or exact name so current name-based clients remain compatible while later controls can use stable identifiers.
- Distinct duplicate Admin location values are invalid rather than using first/last parameter order; identical duplicates remain deterministic.

## Verification Evidence

| Check | Result |
|---|---|
| `npm run test -- tests/routes/authorization.test.ts` | PASS — 19/19 tests |
| `npm run test:integration -- tests/integration/inventory-scope.test.ts` | PASS — 1/1 hostile PostgreSQL scope test |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — 9 files, 119/119 unit tests |
| Node runtime | PASS — Node.js v20.19.0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Synchronized the Inventory API contract required by AGENTS.md**
- **Found during:** Overall verification
- **Issue:** The existing API documentation still stated that Stock Staff could select a location, which contradicted the newly enforced persisted `SR` scope.
- **Fix:** Documented the named capability, Accounting denial, fixed Branch/SR behavior, canonical Admin selection, and duplicate handling.
- **Files modified:** `docs/API.md`
- **Verification:** Documentation checked against the passing direct-route and PostgreSQL integration evidence.
- **Committed in:** `5da54bd`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Documentation synchronization was required by repository instructions and did not expand runtime scope.

## Issues Encountered

- The first disposable PostgreSQL attempt reached the container before the published host port accepted Prisma traffic; the established database helper passed immediately afterward and all subsequent focused runs passed.
- The canonical database check constraint correctly prevents a missing Branch assignment. The hostile test drops that constraint only inside the disposable target to prove the application boundary still fails closed if persistence is corrupted.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. The session/query-to-route and persisted-context-to-Prisma surfaces were planned explicitly and are covered by data-free denial and hostile marker-row tests.

## User Setup Required

None - the integration suite creates and removes its dedicated disposable PostgreSQL 17 container.

## Next Phase Readiness

- Plan 01-16 can build Inventory controls over the now-authoritative Admin/Branch/SR scope contract.
- Accounting remains inventory-denied, and no caller-controlled location value can broaden Branch or Stock data.
- No blocker remains for downstream page denial and Inventory presentation plans.

## Self-Check: PASSED

- All five implementation/test/documentation files and this Summary exist at their required paths.
- Task commits `6508088`, `1b8302f`, `ae8ffac`, `fa14681`, and `5da54bd` exist in repository history.
- Focused route and disposable PostgreSQL suites, strict type-check, and the complete unit suite pass.
- Unrelated dirty and untracked worktree items remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
