---
gsd_state_version: 1.0
current_phase: 01
current_phase_name: Trusted Foundation and Data Onboarding
status: executing
stopped_at: Completed 01-12-PLAN.md
last_updated: "2026-08-25T14:49:12.506Z"
last_activity: 2026-08-25
last_activity_desc: Phase 01 execution started
state_head: d9c6af9d06daee507f7f429421eeddef578a2854
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 17
  completed_plans: 17
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-25)

**Core value:** Admin can monitor current sales and inventory while four fixed roles complete the simple receipt-sale, Stock Room transfer, discrepancy, Accounting, notification, and offline workflows durably and securely.
**Current focus:** Phase 01 — Trusted Foundation and Data Onboarding

## Current Position

Phase: 01 (Trusted Foundation and Data Onboarding) — EXECUTING
Plan: 13 of 17
Status: Ready to execute
Last activity: 2026-08-25 — Completed 01-16-PLAN.md (next incomplete plan: 01-10; 01-15/01-16/01-17 summaries exist on disk)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: No execution data

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 5 min | 1 tasks | 3 files |
| Phase 01 P02 | 3h 54m | 2 tasks | 10 files |
| Phase 01 P03 | 12 min | 2 tasks | 9 files |
| Phase 01 P13 | 7 min | 2 tasks | 6 files |
| Phase 01 P04 | 8 min | 1 tasks | 4 files |
| Phase 01 P05 | 12 min | 2 tasks | 6 files |
| Phase 01 P06 | 25 min | 3 tasks | 16 files |
| Phase 01 P07 | 10 min | 2 tasks | 8 files |
| Phase 01 P08 | 12 min | 3 tasks | 9 files |
| Phase 01 P14 | 11 min | 2 tasks | 5 files |
| Phase 01 P15 | 12 min | 2 tasks | 3 files |
| Phase 01 P17 | 30 min | 2 tasks | 3 files |
| Phase 01 P09 | 51 min | 3 tasks | 8 files |
| Phase 01 P16 | 6 min | 2 tasks | 3 files |
| Phase 01 P10 | 20 min | 2 tasks | 5 files |
| Phase 01 P11 | 25 min | 2 tasks | 2 files |
| Phase 01 P12 | 33 min | 3 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md. Current constraints:

- ADR 0005 is locked: Next.js route handlers, server-only Prisma, PostgreSQL authority, thin handlers, application-service policy/transactions.
- ADR 0007 is locked: Better Auth, Zod, committed migrations, durable Notification rows, `pg` listener wake-ups, authenticated SSE plus polling; no Redis/general queue initially.
- ADRs 0001-0004 are accepted: simple handwritten-receipt sales, `SR`-to-branch transfers, branch confirm-or-discrepancy, Stock Staff investigation/Admin resolution, individual Accounting verification, durable notifications, browser push attempts, and limited non-negative-stock offline continuity.
- ADR 0006 and the detailed future data model remain proposed/provisional.
- [Phase 01]: Approved exact package vitest@4.1.11 for Plan 01-02 after registry metadata and official npm/Vitest source review confirmed vitest-dev/vitest, Node 20 support, GitHub OIDC trusted publishing, and provenance. — The blocking supply-chain checkpoint requires explicit human approval before any dependency mutation.
- [Phase 01]: Workbook formulas remain inert source evidence; only direct same-sheet references are compared with cached values. — Detect stale caches without evaluating untrusted formulas.
- [Phase 01]: Synthetic workbook reproducibility is measured by equivalent parsed evidence rather than XLSX container bytes. — ZIP metadata can vary while source evidence remains deterministic.
- [Phase 01]: Use the current August rollup as the selected source while retaining all-sheet workbook metadata.
- [Phase 01]: Preserve BL formula source labels and leave BL BEFORE and SR mapping unresolved for owner review.
- [Phase 01]: Classify identity-empty formula rows as spacers and code-less ACCESSORIES labels as headings before temporary codes.
- [Phase 01]: Withhold all canonical candidates until every keyed owner finding is resolved against the current workbook hash.
- [Phase 01]: Use only the exact localhost:55435 disposable PostgreSQL 17 target with no bind mount. — A complete positive identity check prevents destructive integration work from reaching development, production, or unknown databases.
- [Phase 01]: Represent revoked Better Auth sessions by deleted Session rows. — Immediate revocation is fail-closed without adding a noncanonical schema field.
- [Phase 01]: Require explicit opt-in before persisting invalid role/location fixtures. — Canonical defaults stay valid while later authorization tests can deliberately prove fail-closed handling.
- [Phase 01]: Canonical SR has no workbook source and starts at zero; BL BEFORE@J is excluded as historical/reference evidence.
- [Phase 01]: Code 40 rows remain separate as 40 and TMP-R133; code 958 row 662 remains inactive while row 677 is excluded.
- [Phase 01]: Missing-price products retain source opening quantities but remain inactive/non-sellable with no invented sale price.
- [Phase 01]: Canonical fixtures retain no-price products as inactive/non-sellable with salePrice null; no zero sale price is invented.
- [Phase 01]: BL BEFORE remains trace-only evidence; canonical SR has no workbook source and zero opening stock.
- [Phase 01]: Fixture and mapping outputs are byte-stable and embed reviewed input/output hashes.
- [Phase 01]: Persist approved no-price products as inactive rows with a null Decimal price; never map null to zero.
- [Phase 01]: Accept catalog replacement only on exact isolated identities and verify the live database name before writes.
- [Phase 01]: Keep User.status authoritative while Better Auth Admin-plugin ban fields remain compatibility storage.
- [Phase 01]: Only active SR/WAREHOUSE is valid for Stock Staff, active canonical branches are valid for Branch Staff, and Admin/Accounting require no location.
- [Phase 01]: The four migrated reads preserve existing role reach through named capabilities; Accounting remains denied Products and Inventory.
- [Phase 01]: Keep prototype routes without a named central capability out of authenticated navigation rather than inventing client-side role arrays.
- [Phase 01]: Treat the Admin location cookie as a validated presentation preference only; persisted role capabilities remain authoritative and invalid selections fall back to All locations.
- [Phase 01]: Branch Staff inventory scope always comes from its persisted active branch, and Stock Staff inventory scope always maps to persisted SR.
- [Phase 01]: Admin inventory scope accepts All or one active canonical location; conflicting duplicate scope values fail independent of parameter order.
- [Phase 01]: Accounting remains inventory-denied and receives a data-free 403 before query parsing or catalog work.
- [Phase 01]: Authenticated page denial redirects to a fixed /access-denied URL with no protected query, record, or retry values; only unauthenticated/inactive sessions carry a validated local callback.
- [Phase 01]: The /access-denied screen is a prop-free server component with exact UI-SPEC copy, making protected-data leakage structurally impossible.
- [Phase 01]: Plan 01-17: Expose Better Auth 1.6.23 Admin-plugin credentials only through a guarded server-only internalUserAuth facade (three staff roles, owner-header resets); never mount it or expose generic Admin routes.
- [Phase 01]: Plan 01-17: disableSignUp must live inside emailAndPassword options for Better Auth 1.6.23; a top-level flag is silently ignored.
- [Phase 01]: Plan 01-09: Stock/Accounting create and update payloads cannot persist hostile location fields; Stock Staff resolves to active SR server-side and Accounting never carries a location.
- [Phase 01]: Plan 01-09: Access changes and required session revocation commit in one Prisma transaction with FOR UPDATE row locking; injected failures roll back both writes.
- [Phase 01]: Plan 01-09: Duplicate emails map to a stable EMAIL_IN_USE 409 with one user/account; repeated status/reset requests are idempotent no-ops.
- [Phase 01]: [Phase 01]: Plan 01-16: Inventory renders only through a capability-gated server page whose client controls clamp to the persisted LocationScopeDto; Accounting is redirected before any render and shows Business-wide feedback only in the global header.
- [Phase 01]: Plan 01-10: Credential change revokes other sessions server-side (Better Auth revokeOtherSessions would also replace the initiating session); the route is a current-user-only all-roles capability gate and skip/change each consume the D-15 prompt once per arming.
- [Phase 01]: Plan 01-11: /users renders the approved User Management UI over the durable /api/users surface behind the users:manage server gate; location options derive from canonical active locations only.
- [Phase 01]: Plan 01-11: Create dialog disables Inactive (create API has no status field) with truthful helper copy; Last Sign-in renders Never until the DTO adds a timestamp.
- [Phase 01]: Plan 01-12: The phase evidence runner provisions and removes its own disposable PostgreSQL container before the integration harness boots its identical instance, and treats only the lint baseline as an expected failure.
- [Phase 01]: Plan 01-12: Fresh 2026-08-25 gate lint baseline is 96 errors / 49 warnings, superseding the stale 104/41 figures in README/TESTING/AGENTS while lint remains a failing quality gate.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1 `UI-SPEC.md` is approved; refresh `01-RESEARCH.md` against the reconciled scope before planning.
- Vitest unit infrastructure, workbook coverage, and the isolated PostgreSQL integration harness now exist; CI remains pending, and lint still has documented baseline failures.
- Existing business screens and mutations are mock/local prototypes; preserve the distinction from durable behavior.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Accounting | Daily closing and cash/collection reconciliation | Deferred pending requirements | Initialization | v1 |
| Product boundary | Customer-facing receipt/invoice printing | Out of scope | Initialization | v1 |
| Product boundary | Customer Orders, Job Orders, advanced CRM, and customer returns/exchanges/refunds | Deferred | Scope confirmation | v1 |
| Inventory | Branch-to-branch transfers and direct supplier-to-branch receiving | Deferred | Scope confirmation | v1 |

## Session Continuity

Last session: 2026-08-25T14:49:12.474Z
Stopped at: Completed 01-12-PLAN.md
Resume file: None
