---
phase: 01-trusted-foundation-and-data-onboarding
plan: 17
subsystem: auth
tags: [better-auth, admin-plugin, prisma, postgres, vitest, server-only]

requires:
  - phase: 01-06
    provides: Additive schema with plugin compatibility fields (role/banned/banReason/banExpires) and role/location CHECK constraint
  - phase: 01-07
    provides: Persisted capability boundary and fail-closed authorization primitives
provides:
  - Server-only unmounted Better Auth 1.6.23 Admin-plugin credential engine (`internalUserAuth`) exposing only guarded createUser/setUserPassword primitives
  - Regression proof that public sign-up and all generic Admin endpoints are unreachable through the public catch-all
affects: [01-09-user-management, 01-10-first-login]

actuals:
  tokens: 5078
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Unmounted Better Auth instance narrowed to a guarded facade so Admin-plugin HTTP surface cannot exist by construction
    - Real sign-in to capture Better Auth 1.6.23 HMAC-signed session cookies for server-side privileged-call tests

key-files:
  created:
    - lib/server/internal-user-auth.ts
    - tests/integration/auth-admin-surface.test.ts
  modified:
    - lib/server/auth.ts

key-decisions:
  - "Export `internalUserAuth` as a two-method facade (createUser/setUserPassword) over an unmounted admin() instance instead of the raw instance, making a generic user-administration HTTP surface structurally impossible while Plan 01-09 still consumes internalUserAuth.api."
  - "createUser accepts only STOCK_STAFF/BRANCH_STAFF/ACCOUNTING_STAFF (runtime guard even against type-lying callers); setUserPassword requires owner request Headers and refuses ADMIN targets, so second-Admin creation is blocked by guard plus the User_single_admin_key unique index."
  - "Staff creation carries locationId through the plugin's `data` record because Better Auth strips unknown body keys; exact D-13 assignment validation stays in Plan 01-09 with the DB CHECK constraint as backstop."
  - "Integration tests obtain owner credentials by real public sign-in and read Set-Cookie, because 1.6.23 session cookies are HMAC-signed and raw fixture tokens do not authenticate."

patterns-established:
  - "Internal credential mechanism: trusted server services call guarded internalUserAuth.api primitives after their own owner/capability checks; the public catch-all keeps the Admin-plugin-free auth instance."
  - "Public-surface regression tests invoke the unchanged catch-all handler directly for sign-up and every generic Admin operation and assert non-routing plus zero database mutation."

requirements-completed: [] # REQ-user-management completes with Plan 01-09; REQ-role-authorization was already complete via Plan 01-07

coverage:
  - id: D1
    description: "Internal createUser creates exactly one fixed-role credential record per supported staff role against the shared Prisma adapter, with correct persisted locationId and no status/ban-field drift."
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/auth-admin-surface.test.ts#creates exactly one fixed-role credential record per supported staff role"
        status: pass
  - id: D2
    description: "Second-Admin creation is rejected through the supported mechanism and remains impossible at the database boundary."
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/auth-admin-surface.test.ts#refuses to create a second Admin through the supported mechanism"
        status: pass
  - id: D3
    description: "setUserPassword replaces the credential without creating another User, Account, or Session; old password stops working and the new one authenticates."
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/auth-admin-surface.test.ts#replaces credentials without creating another User, Account, or Session"
        status: pass
  - id: D4
    description: "Application User.status stays the active/inactive authority and plugin ban fields remain false/null across credential resets."
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/auth-admin-surface.test.ts#keeps application status authoritative while plugin ban fields stay inert"
        status: pass
  - id: D5
    description: "Public sign-up is refused with EMAIL_PASSWORD_SIGN_UP_DISABLED before any database mutation, and eight generic Admin operations return 404 through the unchanged catch-all."
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/auth-admin-surface.test.ts#public auth surface"
        status: pass
  - id: D6
    description: "The catch-all imports only better-auth/next-js and @/lib/server/auth; nothing under app/ references internal-user-auth; the internal module is server-only."
    requirement: REQ-user-management
    verification:
      - kind: unit
        ref: "tests/integration/auth-admin-surface.test.ts#binds the catch-all to the public auth instance only"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass

duration: 30 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 17: Internal Credential Mechanism Summary

**A server-only unmounted Better Auth 1.6.23 Admin-plugin facade now provides guarded staff createUser/setUserPassword primitives while regression proofs pin public sign-up and generic Admin routes unavailable**

## Performance

- **Duration:** 30 min
- **Started:** 2026-08-25T10:11:08Z
- **Completed:** 2026-08-25T10:41Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Established `internalUserAuth`: an unmounted Better Auth 1.6.23 `admin()` instance sharing the public Prisma adapter and fixed uppercase additional fields, exposed only as narrow guarded `api.createUser` / `api.setUserPassword` primitives.
- Proved internal create works for Stock, Branch, and Accounting Staff with exactly one credential account each, correct persisted locations, and no banned/status drift.
- Proved second-Admin creation is rejected at the module guard, the database unique index, and (later plans) the service layer.
- Proved credential reset replaces the password without new User/Account/Session rows and that old/new passwords fail/succeed against the public instance.
- Caught and fixed a real security bug: `disableSignUp` sat at the top level where Better Auth 1.6.23 silently ignores it.
- Added direct catch-all regression matrix: sign-up returns `EMAIL_PASSWORD_SIGN_UP_DISABLED`, eight generic Admin operations return 404, all with zero database mutation.

## Task Commits

1. **Task 1 RED:** `a6b5db9` — test(01-17): define internal staff credential primitive contract
2. **Task 1 GREEN:** `f99273a` — feat(01-17): wire unmounted Better Auth 1.6.23 staff credential primitives
3. **Task 2 RED:** `d90fd07` — test(01-17): prove public sign-up and generic Admin surface stay unavailable
4. **Task 2 GREEN (Rule 1 fix):** `03842f1` — fix(01-17): honor disableSignUp inside emailAndPassword options

## Files Created/Modified

- `lib/server/internal-user-auth.ts` — Server-only unmounted admin() engine plus the `internalUserAuth` two-primitive facade with staff-only creation, owner-header resets, and ADMIN-target refusal.
- `tests/integration/auth-admin-surface.test.ts` — Disposable-PostgreSQL proof of internal create/reset semantics, signed-cookie owner sessions, public sign-up denial, generic Admin 404 matrix, and import-boundary assertions.
- `lib/server/auth.ts` — Moved `disableSignUp` into `emailAndPassword` so the pinned version actually enforces it (Rule 1 auto-fix).

## Decisions Made

- The plan's prohibition ("never mounted, never a generic administration HTTP surface") is enforced structurally: only two guarded primitives are reachable from `internalUserAuth`; there is no handler, route, or client export anywhere.
- `locationId` flows through the Admin plugin's `body.data` record because zod strips top-level extras; D-13 assignment resolution/validation remains Plan 01-09's responsibility with the `User_role_location_check` constraint as backstop.
- Owner sessions in tests come from a real `signInEmail` round-trip because 1.6.23 signs session cookies (HMAC), so raw fixture tokens cannot authorize privileged calls.

## Verification Evidence

| Check | Result |
|---|---|
| `npm run test:integration -- tests/integration/auth-admin-surface.test.ts` | PASS — 14/14 tests |
| `npm run test:integration` | PASS — 5 files, 20/20 integration tests |
| `npm run test` | PASS — 10 files, 137/137 unit tests |
| `npm run typecheck` | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Rule 2 - Security] Public sign-up was effectively enabled**
- **Found during:** Task 2 (RED)
- **Issue:** `lib/server/auth.ts` declared `disableSignUp: true` at the config top level; Better Auth 1.6.23 only reads `emailAndPassword.disableSignUp`, so the public catch-all accepted sign-up requests and attempted user creation (blocked in practice only by the `User_role_location_check` constraint accident).
- **Fix:** Moved the flag into `emailAndPassword.disableSignUp`; the catch-all now returns 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED` before any write.
- **Files modified:** `lib/server/auth.ts`
- **Commit:** `03842f1`

Note: Task 2's RED gate failed on exactly this one case (13 of 14 assertions already passed), which is the expected shape for absence-proofs: the deliverable is an unchanged public surface, and the failing assertion identified the genuine defect above.

### Out-of-Scope Discoveries

None logged; unrelated dirty/untracked worktree items were left untouched.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the planned trust boundaries. T-01-17-01/T-01-17-02 mitigations are proven by the direct-handler matrix; T-01-17-03 by the status-authority test; T-01-17-04 by the server-only guard and import-boundary scan.

## User Setup Required

None.

## Next Phase Readiness

- Plan 01-09 can consume `internalUserAuth.api.createUser({ body: { email, password, name, role, locationId? } })` after owner/capability checks and `internalUserAuth.api.setUserPassword({ body: { userId, newPassword }, headers })` with the incoming owner request headers.
- Plan 01-10's first-login flow can rely on `credentialSetupRequired` remaining untouched by the internal primitives (services own that flag).
- No blocker remains for the Wave 9 consumers.

## Self-Check: PASSED

- `lib/server/internal-user-auth.ts` and `tests/integration/auth-admin-surface.test.ts` exist at their required paths.
- Task commits `a6b5db9`, `f99273a`, `d90fd07`, and `03842f1` exist in repository history.
- Focused suite (14/14), full integration (20/20), full unit (137/137), and strict typecheck pass.
- Unrelated dirty/untracked files remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
