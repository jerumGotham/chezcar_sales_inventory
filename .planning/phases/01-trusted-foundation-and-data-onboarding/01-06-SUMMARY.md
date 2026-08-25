---
phase: 01-trusted-foundation-and-data-onboarding
plan: 06
subsystem: database
tags: [postgresql-17, prisma, canonical-fixture, transactional-seed, better-auth]

requires:
  - phase: 01-05
    provides: Approved hashed canonical fixture with nullable inactive-product prices
  - phase: 01-13
    provides: Fixed-identity disposable PostgreSQL 17 integration harness
provides:
  - Additive account-state and Better Auth 1.6.23 compatibility migration with database role/Admin invariants
  - Hash-validated transactional opening catalog load for 1,432 products and 8,592 balances
  - Positive reset target gates with production, bind-mount, unknown-target, and connected-database refusal
affects: [01-07-authorization, 01-09-user-management, 01-10-credential-setup, catalog-reads]

actuals:
  tokens: 14236
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - Committed additive Prisma migration augmented with hand-reviewed PostgreSQL constraints
    - Validated fixture replacement in one short transaction after positive environment and live database identity checks

key-files:
  created:
    - prisma/migrations/20260825_trusted_foundation/migration.sql
    - lib/server/services/catalog-reset.ts
    - lib/server/services/catalog-reset.test.ts
    - tests/integration/migration.test.ts
    - tests/integration/seed.test.ts
  modified:
    - prisma/schema.prisma
    - prisma/seed.mjs
    - package.json
    - tests/helpers/factories.ts
    - docs/DATABASE.md

key-decisions:
  - "Persist approved no-price products as inactive rows with a null Decimal price; never map null to zero in Prisma or the product DTO/UI."
  - "Accept catalog replacement only on the exact no-bind-mount test or isolated development identity, then verify current_database() matches before the first write."
  - "Keep User.status authoritative for application activation while Better Auth Admin-plugin ban fields remain false/null compatibility storage."

patterns-established:
  - "Reset safety: validate environment, URL, fixture shape/hash, live database identity, and user location compatibility before deleting catalog rows."
  - "Singleton owner: a partial unique PostgreSQL index backs the seed's explicit different-Admin refusal."

requirements-completed: [REQ-data-onboarding, REQ-role-authorization, REQ-user-management]

coverage:
  - id: D1
    description: "A fresh PostgreSQL 17 database applies the additive auth/catalog migration and rejects invalid role nullability or a second Admin."
    requirement: REQ-role-authorization
    verification:
      - kind: integration
        ref: "tests/integration/migration.test.ts#trusted foundation migration"
        status: pass
    human_judgment: false
  - id: D2
    description: "The approved fixture loads 6 locations, 1,432 products, and 8,592 balances equivalently on rerun while retaining all 707 null-price inactive products."
    requirement: REQ-data-onboarding
    verification:
      - kind: integration
        ref: "tests/integration/seed.test.ts#canonical opening seed"
        status: pass
      - kind: other
        ref: "npm run db:catalog:reload twice; SQL counts 6/1432/8592/707"
        status: pass
    human_judgment: false
  - id: D3
    description: "Catalog replacement is atomic, preserves users/auth, and refuses production, the bind mount, unknown targets, target/client mismatch, and a different Admin before writes."
    requirement: REQ-user-management
    verification:
      - kind: unit
        ref: "lib/server/services/catalog-reset.test.ts#reloadOpeningCatalog safety"
        status: pass
      - kind: integration
        ref: "tests/integration/seed.test.ts#rollback and refusal paths"
        status: pass
    human_judgment: false

duration: 25 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 06: Trusted Migration and Canonical Opening Load Summary

**Additive PostgreSQL invariants and a hash-validated transactional loader now preserve 707 inactive null-price products across deterministic 1,432-product, six-location opening-catalog reruns**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-25T08:19:33Z
- **Completed:** 2026-08-25T08:44:40Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Generated the additive migration through `npm run db:migrate -- --name trusted_foundation`, hand-reviewed it, and added fixed role/location nullability plus singleton-Admin PostgreSQL enforcement.
- Loaded the approved fixture transactionally as exactly six locations, 1,432 products, and 8,592 opening balances, retaining exactly 707 inactive products with `price = NULL` after one and two runs.
- Added fail-closed fixture hash/coverage validation, rollback injection, auth preservation, conflicting-Admin refusal, and environment/URL/live-database target checks without adding an HTTP reset surface.

## Task Commits

TDD tasks include separate RED and GREEN commits:

1. **Task 1 RED: Define trusted migration invariants** - `bc3da7e` (test)
2. **Task 1 GREEN: Define canonical account and price state** - `ee6a4f4` (feat)
3. **Task 2: Enforce trusted database invariants** - `1dd0f05` (feat)
4. **Task 3 RED: Define safe canonical reload behavior** - `0500729` (test)
5. **Task 3 GREEN: Transactionally reload canonical opening data** - `87a9d44` (feat)
6. **Deviation: Align auth factories with singleton/nullability constraints** - `f9b14cd` (fix)
7. **Deviation: Bind reset gate to connected database identity** - `d8d009d` (fix)

## Files Created/Modified

- `prisma/schema.prisma` - Nullable approved prices, credential prompt state, and pinned Better Auth compatibility fields.
- `prisma/migrations/20260825_trusted_foundation/migration.sql` - Additive columns, nullable price, role/location check, and singleton Admin index.
- `tests/integration/migration.test.ts` - Fresh-deploy probes for defaults, nullable price, role scope, and second-Admin rejection.
- `lib/server/services/catalog-reset.ts` - Validated, target-gated, transactionally scoped catalog replacement.
- `lib/server/services/catalog-reset.test.ts` - Pre-write environment/target/fixture refusal coverage.
- `prisma/seed.mjs` - Canonical fixture load plus environment-only owner Admin provisioning.
- `tests/integration/seed.test.ts` - Exact rows, rerun, rollback, auth preservation, and refusal coverage.
- `package.json` - Protected `db:catalog:reload` CLI script.
- `.env.example`, `docs/DATABASE.md`, `docs/CONFIGURATION.md` - Safe target, environment, migration, schema, and command documentation.
- `lib/catalog.ts`, `lib/server/catalog.ts`, `app/products/page.tsx` - End-to-end nullable price contract without zero substitution.
- `tests/helpers/factories.ts`, `tests/integration/factories.test.ts` - Singleton owner reuse and only database-valid domain-invalid scope fixtures.

## Decisions Made

- Nullable sale prices remain explicit from reviewed fixture through PostgreSQL, API DTO, and display; inactive products show an em dash rather than an invented numeric value.
- The checked-in port-5435 development bind mount is not reset-capable. Only exact isolated identities at the dedicated test target or documented development target can pass the first gate.
- The reset service confirms `current_database()` inside the opened transaction before any catalog mutation, preventing accepted environment metadata from authorizing a mismatched Prisma client.
- Database constraints own row-local role nullability and singleton Admin enforcement; later services still own Stock Room-versus-branch relation semantics.

## Verification Evidence

All database checks ran under Node `v20.19.0` against disposable `postgres:17` with no bind mount. The named test container was removed after every run; the existing `chezcar_postgres` development container and `data/` directory were not reset or inspected.

| Check | Result |
|---|---|
| `npm run test -- lib/server/services/catalog-reset.test.ts` | PASS — 6/6 tests |
| `npm run test:integration -- tests/integration/migration.test.ts` | PASS — 2/2 tests; fresh deploy applied both committed migrations |
| `npm run test:integration -- tests/integration/seed.test.ts` | PASS — 2/2 tests; exact rerun, rollback, auth, and refusal assertions |
| `npm run db:catalog:reload` twice on fresh disposable PostgreSQL 17 | PASS — SQL counts `6 / 1432 / 8592 / 707` |
| `npm run test` | PASS — 6 files, 55/55 unit tests |
| `npm run test:integration` | PASS — 3 files, 5/5 PostgreSQL integration tests |
| `npm run prisma:generate` | PASS — Prisma Client 6.12.0 generated |
| `npm run typecheck` | PASS |
| Post-run named-container check | PASS — disposable `chezcar_test_postgres_01_13` absent |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved nullable canonical prices through existing catalog reads**
- **Found during:** Task 1
- **Issue:** The approved fixture contains 707 intentional null prices, but the existing Prisma model, DTO mapper, and product presentation required a number and would either reject or invent a value.
- **Fix:** Made Product.price nullable and propagated `number | null` through server mapping and UI display without converting null to zero.
- **Files modified:** `prisma/schema.prisma`, `lib/catalog.ts`, `lib/server/catalog.ts`, `app/products/page.tsx`
- **Verification:** Prisma generation and strict type-check pass; seed integration verifies all 707 rows remain null/inactive.
- **Committed in:** `ee6a4f4`

**2. [Rule 1 - Bug] Updated auth factories after database constraints invalidated old fixtures**
- **Found during:** Overall integration verification after Task 3
- **Issue:** Plan 01-13's factory created multiple Admins and persisted nullability-invalid users, which the newly required database invariants correctly reject.
- **Fix:** Reused one owner Admin across namespaces and retained only Stock-at-branch/Branch-at-SR fixtures, which are domain-invalid but satisfy row-local database nullability for later service-policy tests.
- **Files modified:** `tests/helpers/factories.ts`, `tests/integration/factories.test.ts`
- **Verification:** Full integration suite passes 5/5 tests.
- **Committed in:** `f9b14cd`

**3. [Rule 2 - Missing Critical] Verified the connected database identity before writes**
- **Found during:** Task 3 threat-surface review
- **Issue:** Environment metadata could identify an approved URL while an injected Prisma client pointed at a different database.
- **Fix:** Queried `current_database()` in the transaction and compared it with the approved URL before the first catalog write; added mismatched-client coverage.
- **Files modified:** `lib/server/services/catalog-reset.ts`, `tests/integration/seed.test.ts`
- **Verification:** Focused seed integration and full integration suite pass.
- **Committed in:** `d8d009d`

**4. [Rule 2 - Missing Critical] Updated schema/reset configuration documentation required by AGENTS.md**
- **Found during:** Task 3
- **Issue:** Existing docs described the old inline seed and bind-mounted setup, which would misstate the new schema and safe command boundary.
- **Fix:** Documented the additive migration, nullable prices, auth fields, exact reset identities, `ALLOW_CATALOG_RESET`, and the catalog-only CLI.
- **Files modified:** `.env.example`, `docs/DATABASE.md`, `docs/CONFIGURATION.md`
- **Verification:** Documentation matches executable scripts and tested target constants.
- **Committed in:** `87a9d44`

---

**Total deviations:** 4 auto-fixed (3 missing critical, 1 bug)
**Impact on plan:** All changes were required to preserve reviewed values, keep the full suite green, close the destructive-target boundary, or satisfy repository documentation rules. No new application workflow or HTTP surface was added.

## Issues Encountered

- Prisma generated `20260825082446_trusted_foundation`; after hand review, the migration was committed at the plan-prescribed additive path `20260825_trusted_foundation` and proven from a fresh database with `migrate deploy`.

## Authentication Gates

None.

## Known Stubs

None. Null sale prices are approved canonical domain values, and `failAfterDelete` is an intentional rollback-test injection that always aborts the transaction.

## Threat Flags

None. The fixture-to-database, CLI-to-reset, and User-constraint surfaces are all identified and mitigated in the plan threat model; no route handler or network reset endpoint was introduced.

## User Setup Required

None for automated verification. Developer catalog reload requires the documented isolated development database identity plus explicit `ALLOW_CATALOG_RESET=true`; the checked-in bind-mounted database remains intentionally refused.

## Next Phase Readiness

- Plans 01-07 and 01-09 can rely on fixed role/location nullability, exactly one owner Admin, credential prompt persistence, and pinned Better Auth compatibility columns.
- Canonical Product and InventoryBalance reads now have durable six-location opening data while inactive null-price semantics remain intact.
- Production reset remains structurally unavailable; deployment data onboarding requires a separate non-reset operational plan.

## Self-Check: PASSED

- All five created migration/service/test artifacts and this summary exist at their required paths.
- Task/deviation commits `bc3da7e`, `ee6a4f4`, `1dd0f05`, `0500729`, `87a9d44`, `f9b14cd`, and `d8d009d` exist in repository history.
- Full unit, integration, Prisma generation, strict type-check, fresh migration, and deterministic CLI rerun gates pass.
- The disposable test container is absent, and unrelated worktree files remain untouched.

---
*Phase: 01-trusted-foundation-and-data-onboarding*
*Completed: 2026-08-25*
