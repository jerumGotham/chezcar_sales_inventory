# Phase 1 Multi-Source Coverage Audit

SOURCE | ID | Feature/Requirement | Plan | Status | Notes
--- | --- | --- | --- | --- | ---
GOAL | — | Canonical catalog/opening inventory, individual accounts, and server-enforced role/location access | 01-02–01-17 | COVERED | Tracer through final evidence gate
REQ | REQ-data-onboarding | Profile, review, canonicalize, migrate, seed, and safely reload workbook-derived data | 01-02–01-06, 01-12–01-13 | COVERED | Owner checkpoint is 01-04
REQ | REQ-role-authorization | Four fixed roles, active session, persisted scope on pages/reads/mutations | 01-06–01-09, 01-11–01-17 | COVERED | Global Accounting scope feedback remains separate from Inventory capability
REQ | REQ-user-management | Owner Admin manages only valid non-Admin accounts with immediate revocation | 01-09–01-12, 01-17 | COVERED | Exactly one owner Admin; no generalized model
RESEARCH | — | Package legitimacy, Node 20 Vitest, SheetJS official CDN | 01-01–01-02 | COVERED | Blocking-human package gate precedes install
RESEARCH | — | Profile→review→generate→load and deterministic output | 01-02–01-06 | COVERED | Node 20 `.mjs` package-script entry points; no fixture before complete 01-04 owner review
RESEARCH | — | Additive migration and disposable PostgreSQL verification | 01-06, 01-13 | COVERED | Separate protected harness precedes [BLOCKING] schema application
RESEARCH | — | Central persisted policy and hostile request matrix | 01-07–01-08, 01-14–01-16 | COVERED | Shell, page, API, and persisted data scope remain independent
RESEARCH | — | Narrow Better Auth-backed lifecycle and atomic revocation | 01-06, 01-09–01-10, 01-17 | COVERED | Pinned 1.6.23 internal unmounted instance; public generic Admin endpoints/sign-up are tested unavailable
RESEARCH | — | External API coverage decision | COVERAGE.md | COVERED | No external network API integration; Better Auth is pinned in-process code behind first-party routes
RESEARCH | — | Approved Chezcar UI contract and all eight UI states | 01-08, 01-10–01-12, 01-15–01-16 | COVERED | Empty/loading/error/populated/partial/overflow/zero-one-many/long-text plus committed UAT status
CONTEXT | D-01 | Owner workbook is developer input and seed basis | 01-02–01-06 | COVERED | No application upload surface
CONTEXT | D-02 | Normalize rather than copy spreadsheet shape; preserve traceability | 01-02–01-05 | COVERED | Source coordinates/hashes retained
CONTEXT | D-03 | SR Stock Room; QC/BL/LU/VC/SP branches | 01-03–01-08 | COVERED | Owner resolves workbook source mapping
CONTEXT | D-04 | Seed opening quantities per location | 01-05–01-06 | COVERED | Transactional seed/reload
CONTEXT | D-05 | Development/test reload; production blocked | 01-06 | COVERED | Positive target gate, no HTTP route
CONTEXT | D-06 | Suspected duplicates require owner review | 01-03–01-05 | COVERED | No automatic merge
CONTEXT | D-07 | Missing codes receive deterministic temporary codes | 01-03, 01-05 | COVERED | `TMP-S{sheetIndex}-R{rowNumber}`, collision fails
CONTEXT | D-08 | Invalid quantity blocks until confirmed | 01-03–01-05 | COVERED | Empty/unresolved yields no fixture
CONTEXT | D-09 | Conflicting price requires explicit owner confirmation | 01-03–01-05 | COVERED | No winner heuristic
CONTEXT | D-10 | Hide unauthorized UI and independently authorize server requests | 01-07–01-08, 01-11, 01-14–01-16 | COVERED | No forbidden flash; Accounting has no Inventory entitlement
CONTEXT | D-11 | Dedicated access-denied screen without protected data | 01-15 | COVERED | Sign-in remains for missing/inactive session
CONTEXT | D-12 | Admin All/specific; Branch fixed; Stock defaults SR | 01-08, 01-14, 01-16 | COVERED | Accounting Business-wide appears globally, not on Inventory
CONTEXT | D-13 | Exact role/location assignment matrix | 01-06–01-09, 01-11, 01-13–01-14, 01-16–01-17 | COVERED | DB + service + shell/UI/API
CONTEXT | D-14 | Admin-only lifecycle for three non-Admin roles; no custom permissions/second Admin | 01-08–01-11, 01-17 | COVERED | Primary identity unchanged
CONTEXT | D-15 | Offline temporary password; change prompt may be skipped | 01-09–01-11 | COVERED | Prompt consumed after change/skip
CONTEXT | D-16 | Deactivation revokes sessions immediately | 01-09 | COVERED | Atomic transaction
CONTEXT | D-17 | Role/location change revokes sessions immediately | 01-09 | COVERED | Concurrency/rollback test
CONTEXT | D-18 | Improve current Chezcar style without redesign | 01-08, 01-10–01-11, 01-15–01-16 | COVERED | Approved primitives/tokens preserved

## Spec-less prohibition recall

Stage 1 adversarial recall considered silent upload/import expansion, heuristic workbook cleanup, production/global reset, generalized roles/multiple Admins, client-authoritative access, raw Better Auth Admin exposure, credential echo/online handoff, and later-workflow scope creep.

Stage 2 dropped routine correctness/hygiene and canon OWASP items (authorization/injection/secret handling remain covered by the Phase threat models and `/gsd-secure-phase`). The bespoke product/safety prohibitions retained descriptor-less and flagged-unverified in PLAN frontmatter are:

1. Workbook onboarding must not become an application upload/import or HTTP/production reset facility.
2. Fixed internal roles must not become generalized editable permissions or permit another Admin.
3. Temporary credentials must not become browser-generated, echoed, logged, URL-encoded, cached, or represented as an online handoff artifact.

No source item is missing. Deferred custom permissions, recurring in-app import, physical discrepancy resolution, sales, receiving, transfer, notification, and offline workflows are excluded by explicit phase scope.
