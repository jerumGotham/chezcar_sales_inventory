---
phase: 01-trusted-foundation-and-data-onboarding
plan: 05
subsystem: data-onboarding
tags: [canonical-fixture, deterministic-generation, source-traceability, vitest]

requires:
  - phase: 01-04
    provides: Owner-approved one-to-one resolutions for all 855 workbook blockers
provides:
  - Byte-stable canonical fixture containing 1,432 reviewed products and 8,592 per-location opening balances
  - Fail-closed Node 20 generator with strict resolution/hash validation and committed-output checking
  - Canonical source trace map linking fixture records to reviewed workbook source IDs and hashes
affects: [01-06-safe-reload, database-schema, catalog-seed, phase-01-validation]

actuals:
  tokens: 4421876
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Profile and source evidence plus reviewed resolutions produce hashed byte-stable canonical outputs
    - Inactive non-sellable products retain opening stock with a null sale price

key-files:
  created:
    - scripts/data-onboarding/generate-seed.mjs
    - scripts/data-onboarding/generate-seed.d.mts
    - scripts/data-onboarding/generate-seed.test.ts
    - prisma/fixtures/opening-catalog.json
  modified:
    - scripts/data-onboarding/canonicalize.test.ts
    - scripts/data-onboarding/source-mapping.json

key-decisions:
  - "Canonical fixtures represent retained no-price products as INACTIVE, non-sellable, and salePrice: null; no zero sale price is invented."
  - "BL BEFORE remains trace evidence only, canonical SR has no workbook source and starts at zero, and each retained product receives six canonical location balances."
  - "Generated fixture and mapping hashes derive from stable reviewed content, while --check refuses any byte-stale committed output."

patterns-established:
  - "Fail-closed generation: validate all profile, source-map, and resolution invariants before creating temporary output files."
  - "Stable traceability: products and balances carry source IDs while generated metadata embeds workbook, resolution, source-map, fixture, and mapping hashes."

requirements-completed: [REQ-data-onboarding]

coverage:
  - id: D1
    description: "All 855 blocking findings have exactly one complete, current-workbook owner resolution, with malformed or mismatched coverage rejected."
    requirement: REQ-data-onboarding
    verification:
      - kind: unit
        ref: "scripts/data-onboarding/canonicalize.test.ts#approved owner resolution coverage"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reviewed evidence generates a byte-stable six-location fixture and trace map while preserving nullable inactive prices and source opening quantities."
    requirement: REQ-data-onboarding
    verification:
      - kind: unit
        ref: "scripts/data-onboarding/generate-seed.test.ts#generateCanonicalFixture"
        status: pass
      - kind: other
        ref: "npm run data:generate -- --profile scripts/data-onboarding/review-report.json --resolutions scripts/data-onboarding/resolutions.json --fixture-out prisma/fixtures/opening-catalog.json --mapping-out scripts/data-onboarding/source-mapping.json --check"
        status: pass
    human_judgment: false

duration: 12 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 05: Deterministic Canonical Fixture Summary

**Fail-closed Node 20 generation now turns all 855 owner-approved workbook decisions into a hashed canonical catalog with 1,432 products, six exact locations, and 8,592 traceable opening balances**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-25T08:01:13Z
- **Completed:** 2026-08-25T08:14:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Validated exact one-to-one owner-resolution coverage for all 855 blockers and proved stale, missing, unknown, duplicate, incomplete, and semantically ambiguous decisions fail closed.
- Generated the canonical six-location fixture with 1,432 products and six balances per product; 707 retained no-price products are inactive/non-sellable with `salePrice: null`, and no zero sale price was invented.
- Preserved workbook evidence in a canonical trace map with source IDs and deterministic workbook, resolution, source-map, fixture, and mapping hashes.
- Added byte-equivalence, untouched-output refusal, temporary-code, source-quantity, and committed `--check` coverage.

## Task Commits

Each task was committed atomically:

1. **Task 1: Record and validate every owner resolution** - `41dd701` (test)
2. **Task 2 RED: Define canonical generation contract** - `8c758a1` (test)
3. **Task 2 GREEN: Generate canonical fixture and trace map** - `6231af0` (feat)

## Files Created/Modified

- `scripts/data-onboarding/canonicalize.test.ts` - Validates current artifact coverage and malformed/stale refusal for all owner decisions.
- `scripts/data-onboarding/generate-seed.mjs` - Node 20 generator, CLI parser, semantic review validator, stable serializer, hasher, atomic writer, and `--check` implementation.
- `scripts/data-onboarding/generate-seed.d.mts` - Strict public declarations for generator inputs, fixture records, source mapping, output hashes, and CLI runner.
- `scripts/data-onboarding/generate-seed.test.ts` - Unit and file-boundary coverage for deterministic generation and fail-closed output behavior.
- `scripts/data-onboarding/source-mapping.json` - Reviewed evidence plus canonical product/balance trace links and generation hashes.
- `prisma/fixtures/opening-catalog.json` - Canonical reviewed locations, products, nullable prices, and opening balances.

## Decisions Made

- The fixture contract deliberately supports `salePrice: null` for inactive/non-sellable products. Plan 01-06 must preserve that meaning when adapting the persistence schema and loader.
- `BL AUGUST 2026@H` maps to canonical `BL`; `BL BEFORE@J` never contributes an opening balance. `SR` has no workbook source and receives zero for every retained product.
- Missing workbook item codes use `TMP-S{sheetIndex}-R{rowNumber}`. The owner-approved duplicate-code exception remains `TMP-R133`; all final code collisions fail generation.
- Money is emitted as normalized two-decimal strings using string operations rather than binary floating-point calculations.

## Deviations from Plan

### Owner-approved artifact already transcribed

Plan 01-04's approved continuation had already transcribed and committed `scripts/data-onboarding/resolutions.json`. Task 1 therefore validated that exact artifact and added regression coverage without rewriting owner decisions or manufacturing a no-op resolution change.

No unplanned product behavior or architectural changes were introduced.

## Issues Encountered

- The review report intentionally withholds canonical candidates while blockers exist, so complete row evidence remains in `source-mapping.json`. The generator treats the immutable source-evidence portion of that artifact as reviewed input, then deterministically enriches the same mapping output with canonical trace links.

## Authentication Gates

None.

## Known Stubs

None. Null sale prices are intentional reviewed domain values for inactive/non-sellable products, not placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01-06 can load the committed fixture only after its schema/loader contract preserves inactive/non-sellable products with nullable sale prices.
- The committed fixture hash is `a1570f220c260b7fe66e2e4a2eaf1eebe27538563b0b721fd0c9d80f6896d76b`; `--check` proves current fixture and mapping bytes are fresh.
- The owner workbook remained read-only and unrelated worktree changes remain untouched.

## Self-Check: PASSED

- All six plan-created/modified implementation artifacts and this summary exist at their required paths.
- Task commits `41dd701`, `8c758a1`, and `6231af0` exist in repository history.
- Focused canonicalization and generation tests, strict type-check, and committed fixture `--check` all pass.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
