---
phase: 01-trusted-foundation-and-data-onboarding
plan: 11
subsystem: ui
tags: [nextjs, react-query, base-ui, user-management, accessibility, session-revocation]

requires:
  - phase: 01-08
    provides: Capability-filtered authenticated shell and `users:manage` navigation gating
  - phase: 01-09
    provides: Owner-Admin-only `/api/users` list/create/update/status/password surface with safe DTOs and typed client functions
  - phase: 01-10
    provides: First-login temporary-password prompt consuming the armed credential state
provides:
  - Admin-gated `/users` server page rendering the approved User Management experience over durable APIs
  - Filtered, paginated seven-column staff table with every approved loading/empty/error/populated/partial state
  - Create/edit dialogs with fixed three-role assignment, role-driven location behavior, and revocation warning
  - Deactivate/reactivate/reset lifecycle confirmations with exact approved copy and status/alert announcements
affects: [phase-01-uat]

actuals:
  tokens: 34000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - Server page fails closed on `users:manage` before hydrating a focused client component
    - Complete React Query key (page/pageSize/search/role/location/status) with applied-vs-draft filter semantics and retained rows during refetch
    - Dialog components own their mutation pending/error state and report success through one invalidation-and-banner path

key-files:
  created:
    - app/users/users-client.tsx
  modified:
    - app/users/page.tsx

key-decisions:
  - "The server page gates on `users:manage` (held by the owner Admin only) so non-Admins are redirected to /access-denied before any protected data or client code can render."
  - "Location filter/assignment options derive from canonical active Location rows loaded server-side in canonical SR/QC/BL/LU/VC/SP order, never from free text."
  - "Create Status offers Inactive as a visibly disabled option because the durable create API provisions active accounts; the helper copy directs Admins to deactivate after creation instead of pretending create-time deactivation exists."
  - "The safe list DTO carries no sign-in timestamp yet, so Last Sign-in renders `Never` per the partial-data contract until the API adds the field."

patterns-established:
  - "Applied-vs-draft filters: Apply commits drafts and resets to page 1; pagination reads only the complete applied key; Reset clears both and returns to page 1."
  - "Mutation success closes its dialog, awaits `invalidateQueries(['users'])`, then announces exact UI-SPEC copy in a dismissible role=\"status\" banner; failure keeps values and shows operation-specific role=\"alert\" copy with retry."

requirements-completed: [REQ-user-management, REQ-role-authorization]

coverage:
  - id: D1
    description: "Admin-gated /users server page that redirects anonymous sessions to sign-in and unauthorized roles to /access-denied before any protected render"
    requirement: REQ-role-authorization
    verification:
      - kind: other
        ref: "npm run typecheck && npm run build (exit 0)"
        status: pass
    human_judgment: true
    rationale: "No-flash/denial routing for each role is scheduled for phase UAT per the plan's human-check row."
  - id: D2
    description: "Durable filtered/paginated staff table with summary cards, human labels, immutable Owner Admin row, both empty states, load error/retry, Updating… retention, and zero-one-many result copy"
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/user-management.test.ts#lists paginated safe DTOs with an immutable owner marker and staff-only counts"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#filters by search, role, status, and location while counting staff only"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run build (exit 0)"
        status: pass
    human_judgment: true
    rationale: "Visual states (320px, dark mode, long names/emails) require phase UAT inspection per the plan."
  - id: D3
    description: "Create/edit dialogs with fixed roles, deterministic role/location behavior, validation with first-invalid focus, revocation warning, and exact footer/progress/failure/success copy"
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/user-management.test.ts#creates one of three fixed roles with exact server-resolved location semantics"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#updates staff fields and enforces the full resulting assignment"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run build (exit 0)"
        status: pass
    human_judgment: true
    rationale: "Keyboard/focus/Escape, 320px scrolling, and light/dark dialog presentation are phase-UAT items per the plan."
  - id: D4
    description: "Deactivate/reactivate/reset lifecycle confirmations with exact copy, destructive/neutral styling, and success/failure banners wired to the durable APIs"
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/session-revocation.test.ts#deletes every existing target session atomically and rejects old cookies immediately"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#deactivates and reactivates idempotently without duplicates or a delete surface"
        status: pass
      - kind: integration
        ref: "tests/integration/user-management.test.ts#resets credentials safely without duplication, echo, or surviving sessions"
        status: pass
    human_judgment: true
    rationale: "Banner announcement, focus return, and confirmation flow feel require human UAT per the plan's human-check row."

duration: 25 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 11: Durable Admin User Management UI Summary

**Owner-Admin User Management at /users now renders the approved accessible experience — filtered seven-column staff table, fixed-role create/edit dialogs, and deactivate/reactivate/reset lifecycles — entirely over the durable /api/users surface with no mock users remaining**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-25T13:49Z
- **Completed:** 2026-08-25T14:12Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Rewrote `/users` as an Admin-gated server component (`users:manage`) that redirects anonymous sessions to sign-in and unauthorized roles to `/access-denied` before any protected data renders, then loads canonical active locations in SR/QC/BL/LU/VC/SP order.
- Replaced the entire mock Users & Roles prototype (mock users, editable permission modules, react-select styling, Delete language, Manage Roles link) with `UsersClient`: three staff-only summary cards, search + Role/Location/Status filters with applied/reset semantics, retained rows with `Updating…` during refetch, seven-column semantic table, human role/scope/status labels (`Branch Staff`, `Stock Room (SR)`, `Business-wide`, `Never`), immutable Owner Admin row, both empty states, load-error retry, zero-one-many result copy, and 10-row Previous/Next pagination with a page-clamp guard.
- Implemented the shared create/edit dialog with exact field order/defaults, fixed three-role selector (Admin never an option), role-driven read-only SR/Business-wide scope or required branch selector with incompatible-location clearing, masked temporary-password pair with offline-handoff helper, blur+submit validation with first-invalid focus and `aria-invalid`, edit-mode revocation warning above the footer, and exact footer/progress/failure/success copy.
- Added the separate `Reset Temporary Password` dialog plus destructive Deactivate and neutral Reactivate confirmations with exact copy; all operations call their narrow typed API once per flight, close/refetch/announce via a dismissible `role="status"` banner on success, and keep open with unchanged-state `role="alert"` copy and retry actions on failure.

## Task Commits

Each task was committed atomically:

1. **Task 1: Render the durable Admin staff list and all table states** - `b2de6a3` (feat)
2. **Task 2: Wire exact create/edit/deactivate/reactivate/reset dialogs** - `bf64259` (feat)

## Files Created/Modified

- `app/users/page.tsx` - Server-side capability gate plus canonical location loading; renders `UsersClient`.
- `app/users/users-client.tsx` - Full approved User Management client: filters/table/pagination states and all five dialogs over `lib/contracts/users.ts`.

## Decisions Made

- The create dialog's Status field ships with Inactive as a visibly disabled option plus helper copy ("New accounts start active. You can deactivate an account after it is created.") because the Plan 01-09 create contract intentionally has no status field and this plan forbids schema/route changes; chaining a hidden second mutation would have risked a half-applied creation with false failure copy.
- `Last Sign-in` renders `Never` for every row through a dedicated formatter because the safe list DTO deliberately carries no sign-in timestamp; when the API adds the field only the formatter changes.
- Dialog mutations live inside each dialog component and report success through one parent path (`invalidateQueries(['users']) → close → banner`), keeping pending/error state local and secrets cleared on unmount.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Create-time Inactive status is not expressible in the durable API**
- **Found during:** Task 2 (create dialog implementation)
- **Issue:** The approved UI-SPEC lists a Status field (default Active) on the create form, but the committed create contract (`createUserRequestSchema`) carries no status and this plan owns no contract/service files; silently accepting an Inactive selection would create an active account while implying otherwise.
- **Fix:** Rendered the field with Inactive visible-but-disabled and added truthful helper copy directing Admins to deactivate after creation; documented here rather than expanding plan-owned files.
- **Files modified:** `app/users/users-client.tsx`
- **Verification:** `npm run typecheck`, `npm run build`, and the user-management integration suite pass.
- **Committed in:** `bf64259`

---

**Total deviations:** 1 auto-fixed (1 blocking contract mismatch resolved client-side)
**Impact on plan:** No scope creep; the full lifecycle remains available through the table's Deactivate action backed by the durable status endpoint.

## Issues Encountered

None beyond the known baseline: the production build repeats the pre-existing Better Auth unset-baseURL/default-secret warnings during page collection (documented in Plans 01-08/01-09); no environment file was changed.

## Verification Evidence

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS — Next.js 16 production build; existing Better Auth env warnings only |
| `npm run test:integration -- tests/integration/user-management.test.ts tests/integration/session-revocation.test.ts` | PASS — 2 files, 13/13 tests |
| Lint | NOT RUN as a gate — `npm run lint` remains the documented failing baseline (104 errors/41 warnings); new file avoids `any` |

## Authentication Gates

None.

## Known Stubs

- `Last Sign-in` column always renders `Never` (`app/users/users-client.tsx`, `formatLastSignIn`) — intentional until the list DTO exposes a sign-in timestamp; recorded in `.planning/WINDOWS.md`.
- Create dialog `Status: Inactive` option disabled (see deviation) — lifecycle parity is preserved via the table's Deactivate action.

## Threat Flags

None beyond the planned trust boundaries. Mitigations land as follows: T-01-01 by fixed options, incompatible-location clearing, and canonical-server-derived location options (server validation remains decisive); T-01-02/T-01-06 by the `users:manage` server gate, no Admin role option, and the action-free Owner Admin row; T-01-03 by the edit revocation warning and immediate sign-out copy mirroring the proven transactional revocation; T-01-07 by calling only the Chezcar typed routes through `lib/contracts/users.ts`; T-01-08 by masked inputs, local-only password state cleared on completion, and no password value in banners, keys, URLs, or logs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase UAT can exercise all eight must_haves human checks: first-load, updating, both empty states, error/retry, one/many rows, pagination, long text, 320px/desktop, and light/dark across list and dialogs.
- The prototype `app/users/roles/page.tsx` is now unreachable from navigation but still exists; it is not plan-owned here and can be removed in a later cleanup.
- No blocker remains for downstream consumers of the User Management page.

## Self-Check: PASSED

- Both plan-owned files exist at their required paths (`app/users/page.tsx`, `app/users/users-client.tsx`).
- Task commits `b2de6a3` and `bf64259` exist in repository history.
- Strict typecheck, production build, and the two focused integration suites pass on the final committed state.
- Unrelated dirty/untracked worktree items remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
