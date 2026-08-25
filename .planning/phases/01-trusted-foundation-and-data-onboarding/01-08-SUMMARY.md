---
phase: 01-trusted-foundation-and-data-onboarding
plan: 08
subsystem: ui-auth-shell
tags: [nextjs, react-context, better-auth, persisted-scope, capability-menu]

requires:
  - phase: 01-07
    provides: Persisted active-user/location reload and fixed named capability policy
provides:
  - Browser-safe authenticated shell identity, capability, navigation, and location-scope DTOs
  - Async server shell boundary hydrating a focused client context without changing the server root layout
  - Capability-filtered sidebar and global authoritative scope feedback for all four fixed roles
affects: [01-09-user-management, 01-14-inventory-scope, 01-15-page-denial, authenticated-shell]

actuals:
  tokens: 7698
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - Server-derived serializable shell DTO passed through one client context
    - Capability-filtered plain navigation model mapped to client-only Lucide icons

key-files:
  created:
    - lib/contracts/access.ts
    - lib/server/shell.ts
    - lib/server/shell.test.ts
    - components/app-layout-shell-client.tsx
    - components/shell-access-context.tsx
  modified:
    - lib/menu.ts
    - components/app-sidebar.tsx
    - components/app-layout-shell.tsx
    - components/app-header.tsx

key-decisions:
  - "Keep prototype routes without a named central capability out of authenticated navigation rather than inventing client-side role arrays."
  - "Treat the Admin location cookie as a validated presentation preference only; persisted role capabilities remain authoritative and invalid selections fall back to All locations."

patterns-established:
  - "No-flash shell: load active persisted access on the server, serialize only permitted menu entries, and never render a full client menu while access loads."
  - "Scope-versus-authority: location feedback may describe Business-wide or a selected Admin location without granting or broadening a capability."

requirements-completed: [REQ-role-authorization]

coverage:
  - id: D1
    description: "All four fixed roles receive exact browser-safe persisted identity, capability, menu, and scope DTOs while invalid or anonymous context fails closed."
    requirement: REQ-role-authorization
    verification:
      - kind: unit
        ref: "lib/server/shell.test.ts#loadShellAccess"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "The unchanged server root layout hydrates one server-derived access context and the responsive sidebar renders only its prefiltered entries without forbidden-link flash."
    requirement: REQ-role-authorization
    verification:
      - kind: other
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: true
    rationale: "Phase UAT must visually confirm no forbidden-link flash and preserved desktop/mobile drawer behavior."
  - id: D3
    description: "The global AppHeader renders authoritative All locations, selected location, Stock Room (SR), branch, or Business-wide feedback without granting Accounting inventory access."
    requirement: REQ-role-authorization
    verification:
      - kind: unit
        ref: "lib/server/shell.test.ts#four-role labels and Accounting inventory denial"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: true
    rationale: "Phase UAT must inspect responsive wrapping and light/dark presentation for each authenticated role."

duration: 12 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 08: Server-Derived Authenticated Shell Summary

**A persisted server access loader now hydrates capability-filtered navigation and exact four-role scope feedback into the global shell without exposing Prisma or deriving authority from browser state**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-25T09:07:45Z
- **Completed:** 2026-08-25T09:19:47Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added a minimal discriminated browser DTO and server-only loader that reloads active persisted User/Location records, validates fixed assignment rules, and returns only permitted capabilities and navigation.
- Preserved `app/layout.tsx` as a server component while splitting pathname and drawer interactions into a focused client shell beneath one server-hydrated access provider.
- Replaced unfiltered navigation with exact capability-filtered entries, renamed `Users & Roles` to `User Management`, and withheld policy-less prototype routes.
- Added an accessible global header scope indicator for Admin, Stock Staff, Branch Staff, and Accounting while explicitly proving Accounting has no `inventory:view` capability or Inventory link.

## Task Commits

Task 1 followed RED/GREEN TDD:

1. **Task 1 RED: Define authenticated shell access contract** - `3606125` (test)
2. **Task 1 GREEN: Derive persisted shell access** - `37995dc` (feat)
3. **Task 2: Hydrate the client shell from server access** - `7efe21a` (feat)
4. **Task 3: Show authoritative scope in the header** - `63f37ad` (feat)

## Files Created/Modified

- `lib/contracts/access.ts` - Browser-safe role, capability, menu, identity, and location-scope DTOs.
- `lib/server/shell.ts` - Active persisted user/location reload, validated Admin presentation preference, and filtered DTO derivation.
- `lib/server/shell.test.ts` - Twelve table-driven four-role, invalid-assignment, anonymous, selected-Admin, and Accounting-denial assertions.
- `lib/menu.ts` - Named-capability menu metadata with `User Management` and no custom-role navigation.
- `components/app-layout-shell.tsx` - Async server boundary that calls the authenticated shell loader.
- `components/app-layout-shell-client.tsx` - Client-only pathname/POS/auth layout selection and sidebar composition.
- `components/shell-access-context.tsx` - Typed access provider and required consumer hook.
- `components/app-sidebar.tsx` - Responsive rendering of already-filtered browser-safe menu entries.
- `components/app-header.tsx` - Server-derived identity and persistent accessible scope feedback.

## Decisions Made

- Routes without a named capability in the central persisted policy are omitted from navigation. This fails closed and avoids reintroducing independent browser role arrays.
- The Admin location cookie persists display preference only. The server validates it against active canonical locations, keeps it outside capability evaluation, and falls back to `All locations` when absent, stale, or invalid.
- Accounting's `Business-wide` scope is represented by a null location ID and informational label; it never becomes an all-inventory entitlement.

## Verification Evidence

| Check | Result |
|---|---|
| `npm run test -- lib/server/shell.test.ts` | PASS — 12/12 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — Next.js 16.3.2 production build; existing Better Auth base URL/default-secret environment warnings emitted during page collection |
| `npm run test` | PASS — 9 files, 113/113 unit tests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Narrowed shell menu hrefs for Next.js typed routes**
- **Found during:** Task 2 (Preserve the server root while providing shell access to client children)
- **Issue:** A generic DTO `string` href could not be passed to the project's typed Next.js `Link` component.
- **Fix:** Added the exact plan-owned `ShellMenuHref` route union and used it in menu definitions and browser DTOs.
- **Files modified:** `lib/contracts/access.ts`, `lib/menu.ts`
- **Verification:** `npm run typecheck` and `npm run build` pass.
- **Committed in:** `7efe21a`

---

**Total deviations:** 1 auto-fixed (1 blocking issue)
**Impact on plan:** The fix preserves strict typed routes and narrows rather than expands the browser contract. No scope creep.

## Issues Encountered

- The production build passed but repeated the existing environment warnings for an unset Better Auth base URL and default development secret during page collection. No secret or environment file was changed.

## Authentication Gates

None.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01-09 can use `users:manage` for independently authorized User Management routes while the shell presents that entry only to Admin.
- Plan 01-14 can migrate Inventory to its named capability and data-scope closure without changing Accounting's global informational feedback.
- Phase UAT still owns responsive/light-dark visual confirmation; no implementation blocker remains.

## Self-Check: PASSED

- All nine created/modified implementation and test files exist at their required paths.
- Task commits `3606125`, `37995dc`, `7efe21a`, and `63f37ad` exist in repository history.
- Focused shell tests, strict type-check, production build, and the complete unit suite pass.
- Unrelated dirty and untracked worktree items remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
