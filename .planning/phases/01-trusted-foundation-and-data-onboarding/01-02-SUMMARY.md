---
phase: 01-trusted-foundation-and-data-onboarding
plan: 02
subsystem: testing
tags: [vitest, sheetjs, xlsx, node-20, data-onboarding]

requires:
  - phase: 01-01
    provides: Human-approved exact vitest@4.1.11 release
provides:
  - Node 20 Vitest unit and serial integration projects
  - Read-only selected-sheet workbook profile with source traceability
  - Deterministic hostile XLSX fixture covering planned workbook ambiguity cases
affects: [01-03-canonicalization, 01-04-owner-review, 01-05-seed-generation, phase-01-validation]

actuals:
  tokens: 20601
  tasks: 2
  commits: 7

tech-stack:
  added: [vitest@4.1.11, SheetJS CE 0.20.3]
  patterns:
    - Node 20-executable .mjs data tooling with strict sibling .d.mts declarations
    - Selected-sheet XLSX parsing that records formulas and caches without execution
    - Synthetic hostile workbook fixtures compared by parsed evidence

key-files:
  created:
    - vitest.config.ts
    - scripts/data-onboarding/workbook-profile.mjs
    - scripts/data-onboarding/workbook-profile.d.mts
    - scripts/data-onboarding/workbook-profile.test.ts
    - tests/fixtures/create-workbook-fixture.ts
    - tests/fixtures/workbook-edge-cases.xlsx
  modified:
    - package.json
    - package-lock.json
    - docs/TESTING.md
    - docs/CONFIGURATION.md

key-decisions:
  - "Profile exactly one selected sheet while retaining all-sheet visibility metadata and workbook-package findings."
  - "Treat formulas as inert source strings; compare only direct references to cached values without evaluating expressions."
  - "Prove fixture determinism through equivalent parsed evidence rather than XLSX container byte identity."

patterns-established:
  - "Workbook evidence: SHA-256, sheet visibility/range, one-based source coordinates, raw values, formulas, and cached values travel together."
  - "Workbook safety: missing and empty input fail closed, and profiling never writes beside or mutates its input."

requirements-completed: [REQ-data-onboarding]

coverage:
  - id: D1
    description: "A Node 20 developer CLI profiles one owner-workbook sheet read-only with source traceability and inert formula evidence."
    requirement: REQ-data-onboarding
    verification:
      - kind: unit
        ref: "scripts/data-onboarding/workbook-profile.test.ts#profileWorkbook"
        status: pass
      - kind: other
        ref: "npm run data:profile -- --help"
        status: pass
      - kind: other
        ref: "owner workbook selected-sheet profile and before/after hash/mtime check"
        status: pass
    human_judgment: false
  - id: D2
    description: "The checked-in hostile XLSX fixture preserves every Plan 01-02 poisoning and ambiguity case and rebuilds to equivalent evidence."
    requirement: REQ-data-onboarding
    verification:
      - kind: unit
        ref: "scripts/data-onboarding/workbook-profile.test.ts#hostile workbook fixture"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exact approved dependency locks and deterministic Node unit/integration command interfaces are checked in."
    requirement: REQ-data-onboarding
    verification:
      - kind: other
        ref: "package-lock exact-version assertion and npm run typecheck"
        status: pass
      - kind: integration
        ref: "npm run test:integration -- --passWithNoTests"
        status: pass
    human_judgment: false

duration: 3h 54m
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 02: Read-Only Workbook Tracer Summary

**Node 20 workbook profiling with exact Vitest/SheetJS locks, inert formula evidence, source coordinates, and a reproducible hostile XLSX fixture**

## Performance

- **Duration:** 3h 54m
- **Started:** 2026-08-25T02:37:02Z
- **Completed:** 2026-08-25T06:31:40Z
- **Tasks:** 2
- **Files modified:** 10 production/test/documentation files plus this summary and planning progress artifacts

## Accomplishments

- Installed only human-approved `vitest@4.1.11` and official SheetJS CE `0.20.3`, with Node unit and serial integration projects plus one-shot package scripts.
- Implemented `profileWorkbook` and its CLI to hash a workbook, parse one selected sheet, retain all sheet visibility, emit one-based cell coordinates/raw/formula/cache evidence, and report stale direct-reference caches, external references, macros, and package links without execution.
- Profiled `REALTIME INVENTORY AUGUST 2026` from the 116,466,467-byte owner workbook as 1,493 by 16 with 20,024 evidence cells; SHA-256 and modification time remained unchanged.
- Added a small reproducible hostile workbook covering hidden/category/spacer rows, formulas/caches, duplicate/missing codes, invalid quantities, and missing/conflicting/nonnumeric prices.
- Established nine passing unit tests and strict TypeScript declarations for downstream workbook plans.

## Task Commits

TDD work was committed as explicit infrastructure, RED, and GREEN gates:

1. **Task 1 infrastructure: exact dependencies and test projects** - `020a7dd` (chore)
2. **Task 1 RED: workbook profile behavior** - `e738ef8` (test)
3. **Task 1 GREEN: read-only selected-sheet profiler** - `cad6efe` (feat)
4. **Task 2 RED: hostile fixture evidence contract** - `75afb2d` (test)
5. **Task 2 GREEN: deterministic hostile fixture** - `123ac70` (feat)
6. **AGENTS.md-required command documentation** - `e83a524` (docs)

## Files Created/Modified

- `package.json` / `package-lock.json` - Exact dependencies and executable Node 20 test/data command interfaces.
- `vitest.config.ts` - Node unit and serial integration projects.
- `scripts/data-onboarding/workbook-profile.mjs` - Read-only selected-sheet profiler and guarded CLI.
- `scripts/data-onboarding/workbook-profile.d.mts` - Strict exported profile/options contract.
- `scripts/data-onboarding/workbook-profile.test.ts` - Nine source, safety, formula, and hostile-fixture tests.
- `tests/fixtures/create-workbook-fixture.ts` - Deterministic synthetic workbook builder.
- `tests/fixtures/workbook-edge-cases.xlsx` - Small checked-in hostile XLSX output.
- `docs/TESTING.md` / `docs/CONFIGURATION.md` - Current runnable commands, boundaries, and deferred integration/generation status.

## Decisions Made

- A formula is always emitted as source text and never evaluated. Cache disagreement detection follows only a direct same-sheet cell reference and compares recorded values.
- Fixture reproducibility is defined as equivalent sheet/cell/finding evidence, avoiding false failures from XLSX ZIP container metadata.
- The owner workbook remains outside quick tests; only the synthetic fixture is checked in and rebuilt by test support.

## Verification Evidence

All commands below ran with Node `v20.19.0`:

| Check | Result |
|---|---|
| `npm run test -- scripts/data-onboarding/workbook-profile.test.ts` | PASS — 9/9 tests |
| `npm run test` | PASS — 1 file, 9/9 tests |
| `npm run test:integration -- --passWithNoTests` | PASS — serial project configured; no integration files yet |
| `npm run data:profile -- --help` | PASS |
| `npm run typecheck` | PASS |
| Exact lock assertion | PASS — Vitest `4.1.11`, SheetJS `0.20.3` from official CDN tarball |
| Owner workbook read-only profile | PASS — SHA-256 `5f15eb60c81a238c168f390ab90e4abe6cd95e5e5ecd5a0f980a706c65a888ac`, hash/mtime unchanged |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regenerated the checked-in-schema Prisma Client after dependency installation**
- **Found during:** Task 1 verification
- **Issue:** npm's script approval policy did not run existing Prisma postinstall scripts, leaving stale generated client types and causing unrelated schema-shaped type errors.
- **Fix:** Ran the existing `npm run prisma:generate` command under Node 20; only ignored `node_modules` output changed.
- **Files modified:** None committed.
- **Verification:** `npm run typecheck` passed.
- **Committed in:** Not applicable (generated dependency output only).

**2. [Rule 2 - Missing Critical] Updated testing and configuration documentation required by AGENTS.md**
- **Found during:** Overall verification
- **Issue:** Existing docs still claimed no test command or test framework existed after this plan added both.
- **Fix:** Documented the exact runnable commands, Node projects, workbook safety boundary, dependency sources, and deferred integration/generation status.
- **Files modified:** `docs/TESTING.md`, `docs/CONFIGURATION.md`
- **Verification:** Documentation matches `package.json`, `vitest.config.ts`, and the passing commands above.
- **Committed in:** `e83a524`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes were required for a valid verification environment and accurate operational documentation; no product or canonical seed scope was added.

## Issues Encountered

- SheetJS ESM does not automatically register filesystem writing. The RED fixture setup was corrected before commit to use `XLSX.write(..., { type: "buffer" })` followed by Node filesystem writes; production profiling reads supplied bytes and never needs SheetJS write APIs.

## Authentication Gates

None.

## User Setup Required

None - dependencies and commands are checked in and require no external service configuration.

## Known Stubs

| File | Line | Stub | Reason |
|---|---:|---|---|
| `package.json` | 15 | `data:generate` targets `scripts/data-onboarding/generate-seed.mjs`, which does not exist yet. | Intentional interface reserved for Plan 01-05 after owner review; this plan must not generate approved canonical seed data. |

The stub is recorded in `.planning/WINDOWS.md` and does not block this plan's read-only profiling goal.

## Threat Flags

None - workbook file access, formula/reference poisoning, and dependency trust are all covered by the plan threat model.

## Next Phase Readiness

- Plan 01-03 can consume strict profile evidence and the hostile fixture for canonical row classification without reading the 116 MB owner workbook in quick tests.
- Owner mapping, duplicate identity, quantity, and price decisions remain intentionally unresolved until the planned review checkpoint; no canonical seed data was created.

## Self-Check: PASSED

- All six created implementation/test artifacts exist at their required paths.
- Commits `020a7dd`, `e738ef8`, `cad6efe`, `75afb2d`, `123ac70`, and `e83a524` exist in git history.
- Every task acceptance command and the plan-level Node 20 verification passed.
- The owner workbook SHA-256 remains `5f15eb60c81a238c168f390ab90e4abe6cd95e5e5ecd5a0f980a706c65a888ac`.
- Unrelated dirty/untracked worktree items remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
