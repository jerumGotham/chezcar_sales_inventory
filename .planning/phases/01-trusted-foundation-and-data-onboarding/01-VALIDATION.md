---
phase: 1
slug: trusted-foundation-and-data-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-25
---

# Phase 1 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest, with an exact Node 20-compatible version verified before installation in Wave 0 |
| **Config file** | `vitest.config.ts` - Wave 0 creates |
| **Quick run command** | `npm run test -- <changed-test-file>` |
| **Full suite command** | `npm run test && npm run test:integration && npm run typecheck` |
| **Estimated runtime** | Quick: under 30 seconds; full: under 180 seconds |

The integration suite must use a separately named disposable PostgreSQL instance and must never reset the development bind mount or an unknown database target.

---

## Sampling Rate

- **After every task commit:** Run the changed Vitest file(s) and `npm run typecheck`.
- **After every plan wave:** Run `npm run test`; also run `npm run test:integration` after schema, seed, auth, authorization, or user-service changes.
- **Before `/gsd-verify-work`:** Run `npm run test && npm run test:integration && npm run typecheck && npm run build`; record the existing lint baseline separately.
- **Max feedback latency:** 30 seconds for task-level checks.

---

## Per-Task Verification Map

The planner must replace each `TBD` task reference with the final plan/task ID while preserving every row.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | REQ-data-onboarding | T-DATA-01 | Source rows remain traceable and formulas are not executed | unit | `npm run test -- scripts/data-onboarding/workbook-profile.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-data-onboarding | T-DATA-02 | Duplicate codes, invalid quantities, and unresolved prices cannot enter canonical data | unit | `npm run test -- scripts/data-onboarding/canonicalize.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-data-onboarding | T-DATA-03 | Approved input generates deterministic canonical output | unit | `npm run test -- scripts/data-onboarding/generate-seed.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-data-onboarding | T-DATA-04 | Fresh migration and repeat seed create exact locations/products/balances | integration | `npm run test:integration -- tests/integration/seed.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-data-onboarding | T-DATA-05 | Reset rejects production and unknown database targets | unit + integration | `npm run test -- lib/server/services/catalog-reset.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-role-authorization | T-AUTHZ-01 | Missing/inactive/wrong-role/invalid-location access fails closed | unit | `npm run test -- lib/server/authorization.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-role-authorization | T-AUTHZ-02 | Hostile branch parameters cannot escape persisted scope | integration | `npm run test:integration -- tests/integration/inventory-scope.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-role-authorization | T-AUTHZ-03 | Direct forbidden pages and APIs disclose no protected data | route | `npm run test -- proxy.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-user-management | T-USER-01 | Only owner Admin can mutate non-Admin users | integration | `npm run test:integration -- tests/integration/user-management.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-user-management | T-USER-02 | Role/location combinations and the single-Admin invariant are enforced | integration | `npm run test:integration -- tests/integration/user-management.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-user-management | T-USER-03 | Deactivation or access change revokes all prior sessions | integration | `npm run test:integration -- tests/integration/session-revocation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | REQ-user-management | T-USER-04 | Change and skip consume the first-login prompt until a later reset | integration | `npm run test:integration -- tests/integration/credential-setup.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending | ✅ green | ❌ red | ⚠ flaky*

---

## Wave 0 Requirements

- [ ] Verify a legitimate Node 20-compatible Vitest release, install it intentionally, and add `vitest.config.ts`, `test`, and `test:integration`.
- [ ] Add a disposable PostgreSQL lifecycle helper that refuses the development bind mount and unknown database targets.
- [ ] Add role/session/location fixture factories and direct request helpers without importing prototype user fixtures.
- [ ] Add a small synthetic XLSX fixture covering formulas, hidden sheets, category rows, duplicate/missing codes, invalid quantities, and conflicting/missing prices.
- [ ] Add the unit and integration test files referenced in the verification map.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| User Management visual and interaction contract | REQ-user-management | No browser test runner is configured in Phase 1 Wave 0 | Walk `/users` at 320px and desktop widths in light/dark themes; cover loading, empty, filtered-empty, populated, updating, failure, create, edit, reset, deactivate, and reactivate states. |
| Role-aware navigation and denied route | REQ-role-authorization | Shell hydration and focus behavior require browser inspection | Sign in as each fixed role; verify no forbidden-link flash, correct scope label, direct denied-route behavior, keyboard focus, and no protected content disclosure. |
| First-login credential prompt | REQ-user-management | Dialog focus, password-manager behavior, and responsive layout require browser inspection | Exercise change, skip, validation error, server failure, later reset, keyboard-only use, reduced motion, and sign-in continuation. |
| Owner workbook approval checkpoint | REQ-data-onboarding | `SR`/`BL BEFORE`, duplicate-code, and missing-price meanings require owner judgment | Review the generated source-traceability report and record explicit decisions before canonical fixture generation. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all missing references.
- [ ] No watch-mode flags.
- [ ] Feedback latency is under 30 seconds for task checks.
- [ ] Planner replaced every `TBD` map reference with a final plan/task ID.
- [ ] `nyquist_compliant: true` is set after the validation audit passes.

**Approval:** pending
