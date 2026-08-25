---
phase: 01-trusted-foundation-and-data-onboarding
plan: 16
subsystem: inventory-ui
tags: [inventory, scope-control, authorization, nextjs, react]

requires:
  - phase: 01-08
    provides: Server-derived ShellAccessDto/LocationScopeDto and persisted shell access loader
  - phase: 01-14
    provides: Independent inventory:view API capability gate and persisted Admin/Branch/SR data scope
  - phase: 01-15
    provides: Fail-closed proxy page denial to /access-denied

provides:
  - Capability-gated Inventory server page hydrating only browser-safe scope DTOs into a focused client
  - Role-clamped LocationScopeControl (Admin enabled selector, Stock/Branch read-only, Accounting nothing)
affects: [phase-02-inventory]

actuals:
  tokens: 51000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - Async server page gates capability and passes only serializable DTOs to a focused client component
    - Client controls initialize and clamp from the server-derived DTO; the API re-enforces independently

key-files:
  created:
    - app/inventory/inventory-client.tsx
    - components/location-scope-control.tsx
  modified:
    - app/inventory/page.tsx

key-decisions:
  - "The server page reloads persisted shell access itself; Accounting is redirected to /access-denied before InventoryClient or any protected render."
  - "LocationScopeControl renders only for inventory-capable roles; Accounting's Business-wide feedback stays exclusively in the global AppHeader."
  - "Applied location queries are clamped from the LocationScopeDto — only Admin can request anything besides All locations — while Plan 01-14 API enforcement remains authoritative for direct requests."

patterns-established:
  - "Server page → client DTO seam: authorize on the server, hydrate browser-safe role/scope/location props, never pass auth or Prisma policy code into the client bundle."

requirements-completed: [REQ-role-authorization]

coverage:
  - id: D1
    description: "Inventory renders only for inventory:view-capable roles with scope controls matching persisted policy; Accounting cannot reach page or control."
    requirement: REQ-role-authorization
    verification:
      - kind: unit
        ref: "lib/server/shell.test.ts#four-role labels and Accounting inventory denial"
        status: pass
      - kind: unit
        ref: "tests/routes/authorization.test.ts#inventory authorization and guard order"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run build"
        status: pass
    human_judgment: true
    rationale: "Phase UAT must visually inspect Admin/Stock/Branch controls and Accounting direct-navigation denial per plan human-check."

duration: 6 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 16: Authoritative Inventory Scope Controls Summary

**Inventory now renders through a capability-gated server page feeding a focused client whose location control is clamped exactly to each role's persisted Admin/Branch/SR scope, with Accounting structurally excluded**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-25T12:01:23Z
- **Completed:** 2026-08-25T12:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Converted `app/inventory/page.tsx` into an async server page that reloads persisted shell access, requires `inventory:view`, redirects unauthenticated sessions to sign-in and unauthorized roles (including Accounting) to `/access-denied` before anything renders.
- Moved all interactive query/table/dialog/sheet state out of the page into `app/inventory/inventory-client.tsx` without copying stale `USER_ROLE` constants; mutation affordances now derive from the server-derived role.
- Added `components/location-scope-control.tsx`: Admin gets an enabled All/SR/QC/BL/LU/VC/SP selector over canonical active locations ordered per UI-SPEC; Stock Staff sees read-only `Stock Room (SR)`; Branch Staff sees read-only assigned branch; Accounting renders no control at all.
- Initialized and clamped applied location queries from the server-derived `LocationScopeDto`; non-Admin applied values stay neutral (`all`) because Plan 01-14 fixes their persisted scope server-side.

## Task Commits

1. **Task 1: Split Inventory into an authorized server page and focused client** - `bfd526d` (feat)
2. **Task 2: Clamp Inventory controls to authorized Admin, Stock, and Branch scope** - `ff37df5` (feat)

## Files Created/Modified

- `app/inventory/page.tsx` - Capability-gated async server page loading persisted scope plus canonical active locations.
- `app/inventory/inventory-client.tsx` - Focused interactive inventory UI consuming only browser-safe DTOs.
- `components/location-scope-control.tsx` - Per-role authoritative scope control (Admin enabled selector, Stock/Branch read-only, Accounting null).

## Decisions Made

- The server page performs its own `loadShellAccess` gate in addition to the Plan 01-15 proxy check, so Accounting rejection happens before `InventoryClient` code or protected data can render.
- Canonical location options are queried server-side (active SR warehouse plus QC/BL/LU/VC/SP branches) and passed as plain data, keeping Prisma entirely out of the client bundle.
- The prototype's mock `LOCATION_OPTIONS` (Main Warehouse/QC Main/Makati/Pasig) remain only inside the Stock Card, Availability, and Adjust prototype surfaces; the live list query uses canonical codes accepted by Plan 01-14 scope resolution.
- No preference cookie write was added: the Admin cookie remains a validated presentation preference consumed by `loadShellAccess`; the control consumes whatever the server derives without client-side authority.

## Verification Evidence

| Check | Result |
|---|---|
| `npm run test -- lib/server/shell.test.ts tests/routes/authorization.test.ts` | PASS — 31/31 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — compiled successfully; `/inventory` emitted as dynamic route |
| `npm run test` | PASS — 10 files, 137/137 unit tests |
| Node runtime | PASS — Node.js v20.19.0 |
| human-check: Admin/Stock/Branch control inspection and Accounting direct-navigation denial | Deferred to phase UAT per plan |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing unrelated worktree items (`app/customer-orders/[id]/release/page.tsx`, `.planning/codebase/`, `.planning/config.json`, `.planning/milestone.lock`, `excel/`, `opencode-error.txt`) were left untouched.

## Authentication Gates

None.

## Known Stubs

None new. The Stock Card, Availability, and Adjust surfaces remain intentional prototype behavior over mock fixtures (pre-existing, documented in AGENTS.md); this plan did not change their mock nature.

## Threat Flags

None. Both planned trust boundaries hold: only authorized browser-safe `LocationScopeDto` data crosses the server-page-to-client boundary, and client location input stays untrusted with Plan 01-14 API enforcement independent of UI clamping (T-01-16-01/02/03 mitigations in place).

## User Setup Required

None - no schema, package, or API changes.

## Next Phase Readiness

- Phase UAT owns the visual walk of Admin/Stock/Branch Inventory controls and Accounting direct-navigation denial with its global Business-wide header feedback.
- Phase 02 inventory workflows can extend `InventoryClient` and `LocationScopeControl` against the same DTO seam.

## Self-Check: PASSED

- `app/inventory/page.tsx`, `app/inventory/inventory-client.tsx`, `components/location-scope-control.tsx`, and this Summary exist at required paths.
- Task commits `bfd526d` and `ff37df5` exist in repository history.
- Focused suites, full unit suite, strict type-check, and production build pass.
- Unrelated dirty and untracked worktree items remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
