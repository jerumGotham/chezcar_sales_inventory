---
phase: 01-trusted-foundation-and-data-onboarding
plan: 03
subsystem: data-onboarding
tags: [xlsx, zod, vitest, node-20, canonicalization, source-traceability]

requires:
  - phase: 01-02
    provides: Read-only selected-sheet workbook profile, inert formula evidence, and hostile XLSX fixture
provides:
  - Fail-closed row classification and owner-review finding contracts
  - Complete owner-workbook source mapping with raw, normalized, formula, cache, and coordinate evidence
  - Keyed review report and blank resolution template for every unresolved blocker
affects: [01-04-owner-review, 01-05-canonical-fixture, phase-01-validation]

actuals:
  tokens: 4311542
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Strict Zod contracts paired with Node 20-executable checked JavaScript and declaration files
    - Profile then classify then block before any canonical output
    - Deterministic finding IDs with one-to-one unresolved resolution keys

key-files:
  created:
    - scripts/data-onboarding/canonicalize.mjs
    - scripts/data-onboarding/canonicalize.d.mts
    - scripts/data-onboarding/canonicalize.test.ts
    - scripts/data-onboarding/source-mapping.json
    - scripts/data-onboarding/review-report.json
    - scripts/data-onboarding/resolutions.json
  modified:
    - scripts/data-onboarding/workbook-profile.mjs
    - scripts/data-onboarding/workbook-profile.d.mts
    - scripts/data-onboarding/workbook-profile.test.ts

key-decisions:
  - "Use REALTIME INVENTORY AUGUST 2026 as the default selected source while retaining all 21 sheet names and visibility states as workbook evidence."
  - "Disambiguate the two BL columns only by their preserved formula source labels; keep BL BEFORE and the absent SR source as unresolved owner decisions."
  - "Classify identity-empty formula rows as spacers and the two code-less ACCESSORIES labels as headings before temporary-code generation."
  - "Emit no canonical candidates while any finding is unresolved; the resolution template remains entirely blank for Plan 01-04 owner input."

patterns-established:
  - "Finding traceability: stable ID, workbook hash, source ID, cell coordinate, raw/normalized value, formula/cache evidence, and resolution key travel together."
  - "Fail closed: unresolved source mapping, duplicate identity, invalid quantity, or price evidence forces canonicalCandidates to remain empty."

requirements-completed: [REQ-data-onboarding]

coverage:
  - id: D1
    description: "Pure row classification excludes headings and spacers, generates deterministic temporary codes only for products, and withholds all candidates on blockers."
    requirement: REQ-data-onboarding
    verification:
      - kind: unit
        ref: "scripts/data-onboarding/canonicalize.test.ts#classifySourceRow and buildReviewFindings"
        status: pass
    human_judgment: false
  - id: D2
    description: "The owner workbook produces a deterministic source mapping, complete blocking review report, and one blank resolution record per finding."
    requirement: REQ-data-onboarding
    verification:
      - kind: unit
        ref: "scripts/data-onboarding/workbook-profile.test.ts#owner review package"
        status: pass
      - kind: other
        ref: "npm run data:profile -- --workbook excel/REALTIME INVENTORY- NEW 3.xlsx --mapping-out scripts/data-onboarding/source-mapping.json --report-out scripts/data-onboarding/review-report.json --resolutions-out scripts/data-onboarding/resolutions.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "Profiling preserves the owner workbook byte hash and modification time and generates no canonical seed fixture."
    requirement: REQ-data-onboarding
    verification:
      - kind: other
        ref: "before/after SHA-256 and mtime assertion plus canonical fixture absence assertion"
        status: pass
    human_judgment: false

duration: 12 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 03: Owner Workbook Review Evidence Summary

**Fail-closed workbook canonicalization evidence with 1,490 classified rows, 855 traceable owner blockers, and zero canonical seed candidates**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-25T06:36:10Z
- **Completed:** 2026-08-25T06:48:38Z
- **Tasks:** 2
- **Files modified:** 9 source, declaration, test, and generated review artifacts

## Accomplishments

- Added strict `ProfileEvidence`, `ReviewFinding`, `ResolutionRecord`, and `CanonicalCandidate` contracts plus pure row classification and finding construction.
- Classified all 1,490 post-header rows in the current August rollup as 1,443 products, 2 headings, and 45 spacers without promoting formula-only rows or section labels into products.
- Preserved the complete selected-source mapping, all-sheet visibility metadata, workbook hash, coordinates, raw/normalized values, formulas, and cached values in deterministic artifacts.
- Emitted 855 unresolved keyed findings, including both workbook-source decisions, all four duplicate-code rows for codes `40` and `958`, 10 blank quantities, the negative quantity at `J1411`, 716 product price gaps, the nonnumeric price at `O1092`, and one conflicting-price group.
- Left all 855 resolution records blank and returned zero canonical candidates; no `prisma/fixtures/opening-catalog.json` was created.

## Task Commits

Each task was committed atomically, with Task 1 following the required TDD gates:

1. **Task 1 RED: fail-closed canonicalization behavior** - `292eeb4` (test)
2. **Task 1 GREEN: strict classification and finding contracts** - `fdd582f` (feat)
3. **Task 2: complete owner review evidence package** - `fd67150` (feat)

## Files Created/Modified

- `scripts/data-onboarding/canonicalize.mjs` / `.d.mts` - Strict evidence, finding, resolution, and candidate contracts with fail-closed pure classification.
- `scripts/data-onboarding/canonicalize.test.ts` - Table-driven malformed quantity/price, duplicate, traceability, heading, spacer, and unresolved-location coverage.
- `scripts/data-onboarding/workbook-profile.mjs` / `.d.mts` - Multi-flag review-package CLI, source mapping, deterministic atomic output, and keyed resolution template.
- `scripts/data-onboarding/workbook-profile.test.ts` - Deterministic package and zero-canonical-output tests using the hostile fixture.
- `scripts/data-onboarding/source-mapping.json` - Full selected-sheet source trace for every classified row.
- `scripts/data-onboarding/review-report.json` - Owner-reviewable blocker inventory for workbook hash `5f15eb60c81a238c168f390ab90e4abe6cd95e5e5ecd5a0f980a706c65a888ac`.
- `scripts/data-onboarding/resolutions.json` - One unresolved owner-decision template entry per finding ID.

## Decisions Made

- The exact selected source is recorded as `REALTIME INVENTORY AUGUST 2026`; all workbook sheets remain visible in metadata, but no other sheet is silently joined by row position or name.
- Formula source text identifies `BL AUGUST 2026` and `BL BEFORE` as distinct evidence. It does not decide how either maps to canonical `BL`, and it does not infer an `SR` source.
- Missing code plus missing name is a spacer even when copied formulas contain cached zeroes. Missing code plus an `ACCESSORIES` label is a heading. Other named product rows receive `TMP-S{sheetIndex}-R{rowNumber}` only after classification.
- Findings are intentionally unresolved and canonical candidates are intentionally empty until Plan 01-04 records owner decisions.

## Verification Evidence

All commands ran with Node `v20.19.0`:

| Check | Result |
|---|---|
| `npm run test -- scripts/data-onboarding/workbook-profile.test.ts scripts/data-onboarding/canonicalize.test.ts` | PASS - 2 files, 24/24 tests |
| `npm run typecheck` | PASS |
| Required `npm run data:profile -- ...` owner-workbook command | PASS - 1,490 rows, 855 unresolved findings, zero canonical candidates |
| Finding completeness assertion | PASS - SR, BL BEFORE, duplicate, quantity, and price categories plus exact `J1411`/`O1092` evidence present |
| Resolution coverage assertion | PASS - 855 finding IDs map one-to-one to 855 unresolved records |
| Workbook read-only assertion | PASS - SHA-256 and mtime unchanged |
| Canonical fixture absence assertion | PASS - `prisma/fixtures/opening-catalog.json` does not exist |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented identity-empty formula rows and accessory labels from becoming products**
- **Found during:** Task 2 owner-workbook profile
- **Issue:** Copied quantity formulas with cached zeroes made visually blank rows look populated, and code-less accessory headings also carried zero-valued formulas.
- **Fix:** Classified rows with no code/name as spacers and code-less `ACCESSORIES` labels as headings before temporary-code generation; added regression coverage.
- **Files modified:** `scripts/data-onboarding/canonicalize.mjs`, `scripts/data-onboarding/canonicalize.test.ts`
- **Verification:** Focused suites pass; rows 1431 and 1475 are headings and all formula-only identity-empty rows are spacers.
- **Committed in:** `fd67150`

**2. [Rule 2 - Missing Critical] Extended the profiler declaration contract with the new package API**
- **Found during:** Task 2 implementation
- **Issue:** The task's file list omitted the existing strict sibling declaration even though the profiler gained `buildReviewPackage` and `runCli` exports.
- **Fix:** Added strict review-package and CLI declarations so type consumers do not drift from runtime exports.
- **Files modified:** `scripts/data-onboarding/workbook-profile.d.mts`
- **Verification:** `npm run typecheck` passes.
- **Committed in:** `fd67150`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical functionality)
**Impact on plan:** Both fixes enforce the planned fail-closed and strict-interface guarantees. No owner decision, canonical fixture, database behavior, or unrelated application scope was added.

## Issues Encountered

- Context7 CLI was unavailable, so no external API lookup was used. Existing locked Zod and SheetJS interfaces plus executable tests were the source of truth.
- The owner workbook remains large (116,466,467 bytes); the required profile completed successfully and generated about 16.6 MB of deterministic review artifacts.

## Authentication Gates

None.

## User Setup Required

None - Plan 01-04 collects owner decisions through its designed checkpoint.

## Known Stubs

| File | Line | Stub | Reason |
|---|---:|---|---|
| `scripts/data-onboarding/resolutions.json` | 8 | All 855 records remain `status: "unresolved"` with null reviewer, decision, reason, and canonical value. | Intentional blank owner-review template; Plan 01-04 must fill keyed decisions without reinterpretation before Plan 01-05 can generate a fixture. |

This intentional stub is the central fail-closed output of this plan and prevents canonical seed generation rather than preventing the review-package goal.

## Next Phase Readiness

- Plan 01-04 has a stable report and one-to-one resolution template for the current workbook hash.
- The owner must decide the `SR` source, explain `BL BEFORE`, and resolve every keyed duplicate, quantity, product-name, suspected-duplicate, and price finding. No decision has been guessed.
- Plan 01-05 remains structurally blocked from fixture generation until all 855 records are explicitly resolved against the same workbook hash.

## Self-Check: PASSED

- All nine implementation, declaration, test, mapping, report, and resolution artifacts exist at their required paths.
- Commits `292eeb4`, `fdd582f`, and `fd67150` exist in git history.
- Both focused suites, strict type-check, the exact owner-workbook command, finding completeness assertions, one-to-one resolution coverage, read-only workbook checks, and canonical-fixture absence checks passed under Node `v20.19.0`.
- Unrelated `app/customer-orders/[id]/release/page.tsx`, `.planning/codebase/`, owner workbook content, and `opencode-error.txt` remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
