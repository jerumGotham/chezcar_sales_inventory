---
phase: 01-trusted-foundation-and-data-onboarding
plan: 15
subsystem: authorization
tags: [proxy, middleware, capabilities, access-denied, vitest]

requires:
  - phase: 01-07
    provides: Pure fixed-role capability matrix with persisted active User/Location evaluation
provides:
  - Fail-closed page routing that separates missing/expired/inactive/revoked sessions from authenticated forbidden requests
  - Dedicated `/access-denied` server-component screen free of protected request data
  - Local-only callback validation for sign-in redirects
affects: [01-16, 01-17]

actuals:
  tokens: 3600
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - Central page-capability map at the proxy instead of hard-coded route clauses
    - Fixed denial URL without protected parameters crossing the proxy-to-denial-page boundary

key-files:
  created:
    - app/access-denied/page.tsx
  modified:
    - proxy.ts
    - proxy.test.ts

key-decisions:
  - "Authenticated denial redirects to a fixed `/access-denied` URL with no query, record, filter, or retry values; only unauthenticated/inactive sessions carry a validated local callback to sign-in."
  - "The denial page is a static server component accepting no props, so no protected request context can reach the rendered denial UI."

patterns-established:
  - "Page authorization at the proxy: resolve session, reload persisted User plus Location, map the first path segment to a named capability, and evaluate before rendering."
  - "Denial surfaces stay data-free by construction — fixed URL at the proxy and prop-free fixed copy at the page."

requirements-completed: [REQ-role-authorization]

coverage:
  - id: D1
    description: "Missing, expired, inactive, and revoked page sessions go to sign-in with a safe local callback while protocol-relative callbacks are rejected."
    requirement: REQ-role-authorization
    verification:
      - kind: unit
        ref: "proxy.test.ts#page session routing"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every fixed role's permitted pages continue and forbidden requests land on the fixed data-free /access-denied URL regardless of hostile query ordering."
    requirement: REQ-role-authorization
    verification:
      - kind: unit
        ref: "proxy.test.ts#persisted page capability routing"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run build"
        status: pass
    human_judgment: true

duration: 12 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 15: Fail-Closed Page Denial Path Summary

**The proxy now routes every page through persisted capabilities — bad sessions go to sign-in with a validated local callback, and authenticated forbidden requests hit a dedicated data-free `/access-denied` screen**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-25T09:42:30Z
- **Completed:** 2026-08-25T09:54:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced hard-coded proxy route clauses with the central page capability map (`dashboard:view`, `customers:view`, `customer-orders:view`, `products:view`, `inventory:view`, `users:manage`) evaluated over persisted active User/Location context.
- Kept missing/expired/inactive/revoked sessions on the sign-in path with local-only callback validation (protocol-relative and off-site callbacks fall back to `/dashboard`).
- Authenticated forbidden requests redirect to a fixed `/access-denied` URL carrying no requested route, query, record, or filter values.
- Added 18 focused tests covering all four session states, all four roles' allowed-page matrices, policy-order invariance under hostile query ordering, invalid persisted assignments, and disclosure absence in denial URLs.
- Built the fixed denial screen as a prop-free server component inside the authenticated shell.

## Task Commits

1. **Task 1 RED: Define fail-closed page routing** - `8318fc8` (test)
2. **Task 1 GREEN: Route page denials through persisted capabilities** - `2ebf50a` (feat)
3. **Task 2: Add fixed protected-data-free denial screen** - `413cb2f` (feat)

## Files Created/Modified

- `proxy.ts` - Central `PAGE_CAPABILITIES` map over persisted context, safe local-callback helper, fixed `/access-denied` redirect for authenticated denials.
- `proxy.test.ts` - Session-state matrix, role-by-role capability matrix, callback rejection, query-order invariance, and disclosure-absence assertions.
- `app/access-denied/page.tsx` - Server-component Card with Lucide `ShieldX`, exact approved copy, and one `Back to Dashboard` Next Link.

## Decisions Made

- Only unauthenticated/inactive requests receive a `callbackUrl`; authenticated denial uses a bare `/access-denied` URL so no protected parameter ever crosses the proxy-to-denial boundary (mitigates T-01-15-02/T-01-15-03).
- The denial page accepts no searchParams or props, making protected-data leakage into the denial UI structurally impossible rather than merely untested.
- `/access-denied` bypasses capability evaluation in the proxy so any authenticated user can always reach the denial surface itself.
- Exact UI-SPEC copy used verbatim: heading `Access denied`, body `Your account does not have access to this page. Return to the dashboard to continue.`, CTA `Back to Dashboard`.

## Verification Evidence

| Check | Result |
|---|---|
| `npm run test -- proxy.test.ts` | PASS — 18/18 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — `/access-denied` route emitted |
| human-check: direct forbidden navigation shows only approved copy, shell, and Back to Dashboard | Deferred to phase UAT per plan |

## Deviations from Plan

None - plan executed exactly as written. Pre-existing Better Auth base-url/secret warnings during build are unrelated environmental noise and out of scope.

## Issues Encountered

None.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. Both planned trust boundaries (URL/session→proxy, proxy→denial page) are enforced and tested; no new security-relevant surface was introduced beyond the planned `/access-denied` route.

## User Setup Required

None - no schema, package, or API changes.

## Next Phase Readiness

- Plans 01-16/01-17 can rely on `/access-denied` as the canonical authenticated denial destination for any remaining surfaces.
- Phase UAT should walk direct forbidden navigation per the plan's human-check before close-out.

## Self-Check: PASSED

- `proxy.ts`, `proxy.test.ts`, and `app/access-denied/page.tsx` exist at their required paths.
- Task commits `8318fc8`, `2ebf50a`, and `413cb2f` exist in repository history.
- Focused suite, strict type-check, and production build pass.
- Unrelated worktree items (`app/customer-orders/[id]/release/page.tsx`, `.planning/codebase/`, `excel/`, `opencode-error.txt`) remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
