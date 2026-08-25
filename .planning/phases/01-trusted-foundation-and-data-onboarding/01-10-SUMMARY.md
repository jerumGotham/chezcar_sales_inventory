---
phase: 01-trusted-foundation-and-data-onboarding
plan: 10
subsystem: auth
tags: [better-auth, first-login, temporary-password, dialog, session-revocation, vitest]

requires:
  - phase: 01-09
    provides: Owner-Admin lifecycle that arms `credentialSetupRequired` on create/reset and revokes sessions transactionally
  - phase: 01-17
    provides: Pinned Better Auth 1.6.23 public instance with `disableSignUp` and core `changePassword` primitive
provides:
  - GET/POST `/api/credential-setup`: authenticated current-user prompt-state query plus discriminated `action: change|skip` consumption
  - First-login credential state machine: prompt consumed after one successful change or skip; later Admin reset re-arms it (D-15)
  - Accessible blocking `CredentialSetupDialog` with exact approved UI-SPEC copy and masked Current/New/Confirm fields
  - Post-sign-in callback gating in the sign-in form so the prompt appears before any business navigation
affects: [01-11-users-page-ui, phase-01-uat]

actuals:
  tokens: 9300
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - Current-user self-service endpoints gated by an all-roles capability (`dashboard:view`) as a pure authenticated-active-identity check
    - Other-session revocation performed server-side with `session.deleteMany({ id: { not: currentSessionId } })` instead of Better Auth's `revokeOtherSessions` (which also replaces the initiating session cookie)
    - Blocking controlled Base UI dialog whose only exits are the two consuming actions

key-files:
  created:
    - app/api/credential-setup/route.ts
    - components/credential-setup-dialog.tsx
    - tests/integration/credential-setup.test.ts
  modified:
    - lib/server/services/users.ts
    - app/sign-in/sign-in-form.tsx

key-decisions:
  - "Change flow calls Better Auth `changePassword` without `revokeOtherSessions` and then deletes every other session server-side; the built-in flag deletes ALL sessions and mints a new cookie, which would break the continuing login."
  - "`dashboard:view` is used as the current-user gate for the credential surface because every fixed role holds it, making the route exactly an authenticated-active-persisted-identity check with no resource grant (T-01-02)."
  - "The exact UI-SPEC failure copy is owned by the server envelope (`CREDENTIAL_CHANGE_FAILED`) and mirrored client-side, so every failure path renders the same fixed message with no policy internals or submitted values."
  - "A transient GET state-check failure never blocks sign-in navigation; nothing consumed the prompt server-side, so it re-arms on the next login."

patterns-established:
  - "First-login prompts are consumed exactly once per arming; skip makes no password-change claim anywhere in UI or response bodies."
  - "Password component state lives only in local useState inside the dialog and is cleared on close/success; passwords never enter React Query, URLs, logs, or page text."

requirements-completed: [REQ-user-management, REQ-role-authorization]

coverage:
  - id: D1
    description: "Authenticated GET/POST /api/credential-setup reporting and consuming the D-15 prompt state with stable error envelopes and no echo"
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/credential-setup.test.ts#prompts once after reset and consumes on skip until a later re-arm"
        status: pass
      - kind: integration
        ref: "tests/integration/credential-setup.test.ts#rejects missing, expired, and revoked sessions with 401 and no state change"
        status: pass
    human_judgment: false
  - id: D2
    description: "Password change verifies the current credential through Better Auth, consumes the prompt, keeps the initiating session, and revokes all other sessions"
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/credential-setup.test.ts#changes the password through Better Auth, consumes the prompt, and revokes other sessions"
        status: pass
      - kind: integration
        ref: "tests/integration/credential-setup.test.ts#keeps state unchanged on a wrong current password and leaks nothing"
        status: pass
    human_judgment: false
  - id: D3
    description: "Blocking accessible first-login dialog with exact copy, field/server errors, loading labels, and no secret outside masked inputs"
    requirement: REQ-user-management
    verification:
      - kind: integration
        ref: "tests/integration/credential-setup.test.ts#keeps state unchanged on a wrong current password and leaks nothing (exact failure copy asserted)"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run build (exit 0) — dialog compiles into the /sign-in bundle"
        status: pass
    human_judgment: true
    rationale: "Visual/keyboard/reduced-motion/light-dark behavior at 320px and desktop is scheduled for phase UAT per the plan's human-check row."

duration: 20 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 10: Temporary-Credential State Machine and First-Login Prompt Summary

**Authenticated change/skip credential state machine over Better Auth with a blocking exact-copy first-login dialog that gates post-sign-in navigation and never exposes a password value**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-25T13:22Z
- **Completed:** 2026-08-25T13:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added the narrow current-user credential surface: GET `/api/credential-setup` returns only whether the active account still requires setup, and POST consumes the prompt through a discriminated `action: change | skip` body with stable error envelopes.
- Implemented the D-15 state machine: change verifies the current password through Better Auth, replaces the hashed credential, consumes the prompt, and revokes every other session while the initiating login continues; skip consumes the prompt without claiming any password change; repeated actions are idempotent and a later Admin reset re-arms the prompt.
- Built the blocking `CredentialSetupDialog` with the exact approved copy (`Change your temporary password`, primary `Change Password`, secondary `Skip for Now`, fixed failure copy with `Try Changing Password Again`), masked Current/New/Confirm fields, blur+submit validation, first-invalid focus, `aria-invalid`/`role="alert"`/`aria-live` wiring, in-flight close prevention, and local-only secret state cleared on completion.
- Gated post-sign-in navigation: the sign-in form queries the prompt state before navigating to the validated local callback, showing the blocking dialog whenever the prompt is armed.
- Added four PostgreSQL integration tests covering skip/re-arm, change/session-revocation, wrong-current-password unchanged state with leak assertions, and missing/revoked-session 401s.

## Task Commits

Each task was committed atomically (TDD task carries RED and GREEN commits):

1. **Task 1 RED: Prove credential prompt change/skip/reset transitions** - `fcefaf9` (test)
2. **Task 1 GREEN: Add authenticated credential prompt state, change, and skip API** - `7793bde` (feat)
3. **Task 2: Gate post-sign-in navigation with the first-login credential dialog** - `8e34481` (feat)
4. **Task 2 amendment: Assert initiating session survives after credential change** - `74a642b` (test)

## Files Created/Modified

- `app/api/credential-setup/route.ts` - Thin GET/POST handler delegating to the users service; never echoes submitted values.
- `lib/server/services/users.ts` - Added `getCredentialSetupRequired`, `skipCredentialSetup`, `changeOwnCredential`, request schemas, and the shared failure-copy constant behind the existing error envelope mapper.
- `tests/integration/credential-setup.test.ts` - Full state-machine sequence proofs including reset→login→skip/change→re-arm, retry failures, and serialized-body/log leak assertions.
- `components/credential-setup-dialog.tsx` - Blocking accessible first-login dialog with exact copy and local-only secret state.
- `app/sign-in/sign-in-form.tsx` - Queries prompt state after successful sign-in and renders the blocking dialog before callback navigation.

## Decisions Made

- Better Auth 1.6.23's `changePassword` with `revokeOtherSessions: true` deletes ALL sessions (including the caller's) and mints a replacement cookie. The service instead changes the password without that flag and then runs `session.deleteMany({ where: { userId, id: { not: currentSession.id } } })`, preserving the continuing login while still revoking every other session (T-01-03).
- The credential route uses `requireCapability(headers, "dashboard:view")` — held by all four fixed roles — as an exact authenticated-active-persisted-identity gate, keeping the route current-user-only without inventing a new capability (T-01-02/T-01-07).
- Server-side validation mirrors the Admin reset rules (8–128 chars, letter + number) plus confirm-match, so weak or mismatched replacements are rejected before Better Auth is ever invoked.
- A transient failure of the pre-navigation GET never blocks sign-in; because consumption happens only through POST change/skip, an unchecked prompt simply re-arms on the next sign-in.

## Deviations from Plan

None - plan executed exactly as written. All five touched files are plan-owned; the unrelated dirty file (`app/customer-orders/[id]/release/page.tsx`) and untracked worktree items were left untouched.

## Issues Encountered

- The first GREEN implementation used Better Auth's `revokeOtherSessions` flag, and the integration suite immediately caught that the initiating session was also revoked (Better Auth deletes all sessions then creates a new one). Fixed by revoking other sessions explicitly server-side; a regression assertion (`afterChange.status === 200`) was added to lock the behavior.

## TDD Gate Compliance

Task 1 has verified RED (`fcefaf9`, 4/4 failing on the missing route module) then GREEN (`7793bde`, 4/4 passing) commit pair. Task 2 is not a TDD task; its behavior is exercised end-to-end by the Task 1 integration suite plus typecheck/build verification, with visual/accessibility checks deferred to phase UAT as the plan specifies.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the planned trust boundaries. Mitigations land as follows: T-01-02/T-01-07 by the all-roles capability gate and the narrow two-action route (no generic admin surface); T-01-03 by explicit other-session revocation proven by integration test; T-01-08 by masked inputs, non-echoing envelopes, log-capture assertions, local-only secret state cleared on completion, and no URL/cache placement.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The prompt is fully armed/consumed by existing lifecycle services; Plan 01-11 (User Management page UI) can proceed independently.
- Phase UAT should exercise the human-check rows: blank/loading/error/change/skip/later-reset at 320px and desktop, keyboard-only, reduced motion, light/dark, and long validation text.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
