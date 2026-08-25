---
phase: 1
slug: trusted-foundation-and-data-onboarding
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-25
---

# Phase 1 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest, with the exact Node 20-compatible package/version selected by the blocking human supply-chain preflight in Plan 01-01 |
| **Config file** | `vitest.config.ts` - Plan 01-02 creates after Plan 01-01 approval |
| **Quick run command** | `npm run test -- <changed-test-file>` |
| **Node 20 data CLI commands** | `npm run data:profile -- <flags>` and `npm run data:generate -- <flags>`; both package scripts invoke executable `.mjs` entry points, never `node` against `.ts` |
| **Full suite command** | `npm run test && npm run test:integration && npm run typecheck` |
| **Estimated runtime** | Quick: under 30 seconds; full: under 180 seconds |

The integration suite must use a separately named disposable PostgreSQL instance and must never reset the development bind mount or an unknown database target.

Plan 01-01 package legitimacy is a blocking human decision checkpoint, not an automated Nyquist test. Automated sampling starts after Plan 01-02 installs the approved exact release and proves the one-shot `npm run test -- <changed-test-file>` command.

---

## Sampling Rate

- **After every task commit:** Run the changed Vitest file(s) and `npm run typecheck`.
- **After every plan wave:** Run `npm run test`; also run `npm run test:integration` after schema, seed, auth, authorization, or user-service changes.
- **Before `/gsd-verify-work`:** On the approved disposable target run `npm run verify:phase-01 -- --validate-evidence`; the runner applies fresh committed migrations, seeds, reloads twice with equivalence proof, runs full unit/integration/typecheck/build gates, captures the expected lint baseline separately, preserves manual UAT statuses, and validates the committed evidence file.
- **Max feedback latency:** 30 seconds for task-level checks.

---

## Per-Task Verification Map

Every row below is mapped to its final plan/task ID and must be preserved through execution.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-02-T1 | 01-02 | 2 | REQ-data-onboarding | T-DATA-01 | Source rows remain traceable and formulas are not executed | unit | `npm run test -- scripts/data-onboarding/workbook-profile.test.ts` | ❌ 01-02 | ⬜ pending |
| 01-03-T1 | 01-03 | 3 | REQ-data-onboarding | T-DATA-02 | Duplicate codes, invalid quantities, and unresolved prices cannot enter canonical data | unit | `npm run test -- scripts/data-onboarding/canonicalize.test.ts` | ❌ 01-03 | ⬜ pending |
| 01-13-T2 | 01-13 | 3 | REQ-role-authorization / REQ-user-management | T-HARNESS-01 | Persisted actors cover active/inactive/expired/revoked sessions and invalid role/location assignments; hostile query construction remains exact | PostgreSQL integration + unit | `npm run test:integration -- tests/helpers/factories.test.ts && npm run test -- tests/helpers/requests.test.ts` | ❌ 01-13 | ⬜ pending |
| 01-05-T2 | 01-05 | 5 | REQ-data-onboarding | T-DATA-03 | Approved input generates deterministic canonical output | unit | `npm run test -- scripts/data-onboarding/generate-seed.test.ts` | ❌ 01-05 | ⬜ pending |
| 01-06-T3 | 01-06 | 6 | REQ-data-onboarding | T-DATA-04 | Fresh migration and repeat seed create exact locations/products/balances | integration | `npm run test:integration -- tests/integration/seed.test.ts` | ❌ 01-06 | ⬜ pending |
| 01-06-T3 | 01-06 | 6 | REQ-data-onboarding | T-DATA-05 | Reset rejects production and unknown database targets | unit + integration | `npm run test -- lib/server/services/catalog-reset.test.ts` | ❌ 01-06 | ⬜ pending |
| 01-07-T1 | 01-07 | 7 | REQ-role-authorization | T-AUTHZ-01 | Missing/inactive/wrong-role/invalid-location access fails closed | unit | `npm run test -- lib/server/authorization.test.ts` | ❌ 01-07 | ⬜ pending |
| 01-14-T2 | 01-14 | 8 | REQ-role-authorization | T-AUTHZ-02 | Hostile branch parameters cannot escape persisted scope and Accounting remains inventory-denied | integration | `npm run test:integration -- tests/integration/inventory-scope.test.ts` | ❌ 01-14 | ⬜ pending |
| 01-08-T1 | 01-08 | 8 | REQ-role-authorization | T-AUTHZ-04 | Server-derived shell DTO gives all four roles exact global scope feedback while Accounting has no inventory capability | unit | `npm run test -- lib/server/shell.test.ts` | ❌ 01-08 | ⬜ pending |
| 01-15-T1 | 01-15 | 8 | REQ-role-authorization | T-AUTHZ-03 | Direct forbidden pages and APIs disclose no protected data | route | `npm run test -- proxy.test.ts` | ❌ 01-15 | ⬜ pending |
| 01-17-T2 | 01-17 | 8 | REQ-user-management | T-USER-05 | Pinned Better Auth internal create/reset works without exposing public sign-up or generic Admin endpoints | integration | `npm run test:integration -- tests/integration/auth-admin-surface.test.ts` | ❌ 01-17 | ⬜ pending |
| 01-09-T1 | 01-09 | 9 | REQ-user-management | T-USER-01 | Only owner Admin can mutate non-Admin users | integration | `npm run test:integration -- tests/integration/user-management.test.ts` | ❌ 01-09 | ⬜ pending |
| 01-09-T1 | 01-09 | 9 | REQ-user-management | T-USER-02 | Role/location combinations and the single-Admin invariant are enforced | integration | `npm run test:integration -- tests/integration/user-management.test.ts` | ❌ 01-09 | ⬜ pending |
| 01-09-T3 | 01-09 | 9 | REQ-user-management | T-USER-03 | Deactivation or access change revokes all prior sessions | integration | `npm run test:integration -- tests/integration/session-revocation.test.ts` | ❌ 01-09 | ⬜ pending |
| 01-10-T1 | 01-10 | 10 | REQ-user-management | T-USER-04 | Change and skip consume the first-login prompt until a later reset | integration | `npm run test:integration -- tests/integration/credential-setup.test.ts` | ❌ 01-10 | ⬜ pending |
| 01-11-T1 | 01-11 | 11 | REQ-user-management | T-USER-06 | Durable User Management renders all eight approved UI states after credential flow exists | build + manual | `npm run typecheck && npm run build` | ❌ 01-11 | ⬜ pending |
| 01-12-T3 | 01-12 | 12 | all Phase 1 requirements | T-EVIDENCE-01 | Fresh committed migration, seed, two deterministic reloads, full unit/integration/typecheck/build, expected lint-baseline capture, manual UAT status, and evidence-file validation | evidence gate | `npm run verify:phase-01 -- --validate-evidence` | ❌ 01-12 | ⬜ pending |

*Status: ⬜ pending | ✅ green | ❌ red | ⚠ flaky*

---

## Blocking Preflight and Validation Bootstrap Ownership

- [ ] Plan 01-01 records the blocking human decision approving one exact legitimate Node 20-compatible Vitest release and the downstream one-shot test-command contract; this is not an automated Nyquist check.
- [ ] Plan 01-02 installs only that approved release, creates `vitest.config.ts`, `test`/`test:integration`, the workbook profile test, and the hostile synthetic XLSX fixture.
- [ ] Plan 01-13 adds and tests the disposable PostgreSQL lifecycle plus persisted actor/session and hostile-request helpers.
- [ ] Remaining mapped tests stay with their final owners: 01-03 canonicalization, 01-05 generation, 01-06 migration/seed/reset, 01-07 policy/four routes, 01-08 shell scope, 01-14 Inventory scope, 01-15 proxy denial, 01-17 auth surface, 01-09 user/revocation, and 01-10 credential setup.
- [ ] Plans 01-02 and 01-05 own the `data:profile` and `data:generate` Node 20 `.mjs` package-script entry points with strict `.d.mts` declarations; direct Node execution of `.ts` is not supported.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vitest package legitimacy preflight | all Phase 1 requirements | Registry/repository identity and too-new release suitability require a human supply-chain decision | In Plan 01-01, review the two official sources and record the exact approved package/version plus Node 20 compatibility before Plan 01-02 changes dependencies. |
| User Management visual and interaction contract | REQ-user-management | No browser test runner is configured in Phase 1 | Walk `/users` at 320px and desktop widths in light/dark themes; cover loading, empty, filtered-empty, populated, updating, failure, create, edit, reset, deactivate, and reactivate states. |
| Role-aware navigation and denied route | REQ-role-authorization | Shell hydration and focus behavior require browser inspection | Sign in as each fixed role; verify no forbidden-link flash, correct scope label, direct denied-route behavior, keyboard focus, and no protected content disclosure. |
| First-login credential prompt | REQ-user-management | Dialog focus, password-manager behavior, and responsive layout require browser inspection | Exercise change, skip, validation error, server failure, later reset, keyboard-only use, reduced motion, and sign-in continuation. |
| Owner workbook approval checkpoint | REQ-data-onboarding | `SR`/`BL BEFORE`, duplicate-code, and missing-price meanings require owner judgment | Review the generated source-traceability report and record explicit decisions before canonical fixture generation. |
| Consolidated Phase 1 UAT evidence | all Phase 1 requirements | Responsive/theme/focus and owner judgment require human observation | Record each role/UI/security check as pending/pass/fail with notes in `docs/verification/phase-01-evidence.md`; pending is never treated as passed. |

---

## Validation Sign-Off

- [ ] Every code-producing task has an automated verify; Plan 01-01 and Plan 01-04 are explicitly blocking human-only checkpoints.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Every missing test/helper reference has an explicit owning plan in the verification map and bootstrap ownership list.
- [ ] No watch-mode flags.
- [ ] Feedback latency is under 30 seconds for task checks.
- [x] Planner replaced every placeholder map reference with a final plan/task ID.
- [x] `nyquist_compliant: true` is set after the validation audit passes.

**Approval:** planning audit passed; execution evidence pending
