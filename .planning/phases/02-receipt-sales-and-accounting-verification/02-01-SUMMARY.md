---
phase: 02-receipt-sales-and-accounting-verification
plan: 01
subsystem: database
tags: [prisma, postgres, sales, accounting, verification, zod, vitest, Serializable]
requires:
  - phase: 01-trusted-foundation
    provides: Canonical locations/products, persisted auth, disposable PG harness, user factories
provides:
  - Per-branch receipt composite unique (locationId+receiptBooklet+manualReceiptNumber) with backfill and migration
  - Sale.version and MISMATCH_REPORTED enum, NotificationRelatedType.SALE
  - Direct sale posting with deductSaleLines guard, P2002 handling, Serializable FOR UPDATE
  - Accounting VERIFIED terminal state machine (ACCOUNTING_STAFF only) and GET /api/sales/:id
  - Tracer integration harness and receipt contract (lib/contracts/sales.ts)
affects: [02-02 mismatch enum, 02-03 void-and-replace, 02-04 UI, sales reporting]
actuals:
  tokens: 10718
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns: ["Per-branch composite unique via Prisma @@unique + P2002 mapping", "Serializable tx with SELECT FOR UPDATE lock pattern", "Branch-scoped receipt identity (booklet+number)", "Terminal verification state machine"]
key-files:
  created:
    - prisma/migrations/20260827000000_sale_per_branch_receipt_verification/migration.sql
    - app/api/sales/[saleId]/route.ts
    - lib/contracts/sales.ts
    - tests/integration/sales-tracer.test.ts
  modified:
    - prisma/schema.prisma
    - lib/server/services/customer-sales.ts
    - lib/server/services/notifications.ts
    - tests/helpers/factories.ts
    - tests/integration/customer-sales.test.ts
key-decisions:
  - "Use receiptBooklet String @default '' with composite @@unique([locationId, receiptBooklet, manualReceiptNumber]) — minimal additive change, backfill '' for history, composite on ManualReceipt as well"
  - "Rename AccountingReviewStatus.FLAGGED→MISMATCH_REPORTED via RENAME VALUE and restrict tracer review to VERIFIED only (mismatch deferred to 02-02)"
  - "Gate verification to ACCOUNTING_STAFF only via assertAccountingStrict, rejecting ADMIN per ADR 0014 §2, with Serializable FOR UPDATE terminal guard"
  - "Keep directSaleSchema receiptBooklet default '' and pass locationId+booklet to ManualReceipt for per-branch P2002 mapping"
patterns-established:
  - "Receipt identity is locationId+receiptBooklet+manualReceiptNumber — manualReceiptNumber alone is not unique"
  - "DeductSaleLines checks onHand-reserved>=qty and increments InventoryBalance.version, wrapped in Serializable tx"
  - "ReviewSale locks Sale and SaleAccountingReview FOR UPDATE and rejects any transition from non-UNVERIFIED"
requirements-completed: [REQ-sales-posting]
coverage:
  - id: D1
    description: "Branch Staff posts same booklet+number to two branches → two Sales with separate stock deductions and movements"
    requirement: REQ-sales-posting
    verification:
      - kind: integration
        ref: "tests/integration/sales-tracer.test.ts#proves branch receipt reuse"
        status: pass
    human_judgment: false
  - id: D2
    description: "Duplicate receipt in same branch/booklet returns 409 DUPLICATE_RECEIPT"
    requirement: REQ-sales-posting
    verification:
      - kind: integration
        ref: "tests/integration/sales-tracer.test.ts#duplicate same branch"
        status: pass
    human_judgment: false
  - id: D3
    description: "Posting deducts onHand atomically, never drives available negative, leaves onHand unchanged on insufficient stock, creates immutable DIRECT_SALE movements"
    requirement: REQ-sales-posting
    verification:
      - kind: integration
        ref: "tests/integration/sales-tracer.test.ts#insufficient stock and deduction"
        status: pass
    human_judgment: false
  - id: D4
    description: "Accounting Staff marks UNVERIFIED→VERIFIED, reload preserves VERIFIED via GET /api/sales/:id, second verify 409, BRANCH/ADMIN verify 403"
    requirement: REQ-sales-posting
    verification:
      - kind: integration
        ref: "tests/integration/sales-tracer.test.ts#Accounting VERIFIED terminality"
        status: pass
    human_judgment: false
  - id: D5
    description: "Receipt contract documents per-branch identity and exports SaleDto with receiptBooklet"
    requirement: REQ-sales-posting
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
duration: 21min
completed: 2026-08-26
status: complete
---

# Phase 02 Plan 01: Tracer per-branch receipt sale + Accounting VERIFIED Summary

**Per-branch receipt composite unique, Serializable stock deduction, and Accounting-only VERIFIED terminal verification with tracer harness and contract**

## Performance

- **Duration:** 21 min
- **Started:** 2026-08-26T15:36:38Z
- **Completed:** 2026-08-26T15:57:50Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Migrated Sale and ManualReceipt to per-branch composite uniqueness (locationId+receiptBooklet+manualReceiptNumber), added Sale.version and receiptBooklet, renamed FLAGGED→MISMATCH_REPORTED and added NotificationRelatedType.SALE via additive hand-authored migration
- Wired direct sale posting with server-calculated totals, deductSaleLines onHand-reserved guard, version increment, per-branch P2002→DUPLICATE_RECEIPT, and Serializable transaction; added registerReceipt with locationId/booklet
- Implemented reviewSale as Serializable FOR UPDATE with UNVERIFIED→VERIFIED terminal guard, ACCOUNTING_STAFF-only authorization rejecting ADMIN/BRANCH/STOCK, and GET /api/sales/:id for reload proof
- Created tracer integration harness proving cross-branch reuse succeeds, same-branch duplicate 409, insufficient stock 409 with no negative, server total validation, Decimal round-trip, movements immutable, and role/terminal guards
- Added lib/contracts/sales.ts documenting ADR 0014 §1 receipt identity and exporting SaleDto, receiptBooklet helpers, and placeholder mismatch categories

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end per-branch receipt sale and Accounting VERIFIED** - `d23ec94` (feat)
2. **Task 2: Create tracer integration harness and factories** - `d5203de` (feat)
3. **Task 2 fix: correct insufficient-stock amount in tracer test** - `7d7a03a` (fix)
4. **Task 3: Add lib contract for receipt identity** - `72f1e0c` (feat)

**Plan metadata:** `72f1e0c` (docs: complete plan)

## Files Created/Modified

- `prisma/schema.prisma` - Added receiptBooklet, version, composite uniques, MISMATCH_REPORTED, SALE related type
- `prisma/migrations/20260827000000_sale_per_branch_receipt_verification/migration.sql` - Additive migration with RENAME VALUE, ADD VALUE, column adds, index swaps, FK
- `lib/server/services/customer-sales.ts` - Per-branch sale creation, deductSaleLines, Serializable reviewSale with FOR UPDATE and terminal guard, getSaleById
- `lib/server/services/notifications.ts` - Extended relatedType to include SALE
- `app/api/sales/[saleId]/route.ts` - GET /api/sales/:id returning serializeSale with receiptBooklet and reviewStatus
- `lib/contracts/sales.ts` - Receipt identity docs, Zod helpers, SaleDto, SalesApiResponse, re-exported mismatch placeholder
- `tests/helpers/factories.ts` - Branch staff fixture, product/balance helpers, authContextFor
- `tests/integration/sales-tracer.test.ts` - Tracer proof covering all success criteria
- `tests/integration/customer-sales.test.ts` - Fixed to composite unique and VERIFIED enum for typecheck

## Decisions Made

- Chose minimal receiptBooklet String @default("") rather than split receiptBooklet+receiptNumber fields — preserves manualReceiptNumber as display string while composite enforces uniqueness; backfill is trivial and historical booklet loss is acceptable for MVP per RESEARCH A1.
- Kept FLAGGED rename via ALTER TYPE ... RENAME VALUE instead of adding new enum value and deprecating — matches plan additive migration and avoids stale FLAGGED writes; dashboard/reports now check MISMATCH_REPORTED.
- Restricted tracer verification to VERIFIED only (mismatch deferred to 02-02) and enforced ACCOUNTING_STAFF-only via new assertAccountingStrict — aligns with ADR 0014 §2 busy-owner concern and prevents Admin verifying own encoding.
- Added report phrasing for insufficient stock test to use correct amountPaid (1000 for 20×50) so the guard is exercised before payment validation — Rule 1 fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing customer-sales integration test for new composite unique and renamed enum**
- **Found during:** Task 1 (End-to-end tracer) — `npm run typecheck` failed on `Sale_manualReceiptNumber_key` and `"FLAGGED"` not assignable
- **Issue:** `prisma.sale.findUniqueOrThrow({ where: { manualReceiptNumber } })` no longer valid after dropping global unique; `reviewSale` with `"FLAGGED"` mismatched new `AccountingReviewStatus.MISMATCH_REPORTED` and tracer's `VERIFIED`-only schema
- **Fix:** Changed lookup to `findFirstOrThrow({ where: { manualReceiptNumber } })`, added `receiptBooklet: ""` to `createDirectSale` calls, changed flagged expectation to `VERIFIED`
- **Files modified:** `tests/integration/customer-sales.test.ts`
- **Verification:** `npm run typecheck` passes; `npm run test:integration -- tests/integration/customer-sales.test.ts` passes (3/3)
- **Committed in:** `d23ec94` (part of tracer commit)

**2. [Rule 1 - Bug] Corrected tracer insufficient-stock amountPaid**
- **Found during:** Task 2 verification — `npm run test:integration -- tests/integration/sales-tracer.test.ts` failed with INVALID_PAYMENT instead of INSUFFICIENT_STOCK
- **Issue:** Test sent amountPaid 500 for 20×50=1000 total, so server total validation fired before stock guard
- **Fix:** Changed amountPaid to 1000 to reach deductSaleLines INSUFFICIENT_STOCK path
- **Files modified:** `tests/integration/sales-tracer.test.ts`
- **Verification:** `npm run test:integration -- tests/integration/sales-tracer.test.ts` passes (1/1)
- **Committed in:** `7d7a03a`

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness and to keep existing harness green after schema migration. No scope creep or architectural change.

## Issues Encountered

- `npm run prisma:generate` transiently failed with EPERM rename of query_engine — removed stale .tmp and regenerated successfully. No code change.
- Docker test container startup took ~5s; sufficient memory for Serializable transactions verified via per-branch isolation test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Tracer slice is runnable end-to-end against disposable PG: per-branch reuse, 409 guards, stock deduction, and VERIFIED terminality are proven.
- Ready for 02-02 (structured mismatch enum + photoUrl + notification fan-out) which will extend accountingReviewSchema from VERIFIED-only to discriminated union and add MismatchCategory enum.
- No blockers. Existing inventory and transfer tests remain green.

---
*Phase: 02-receipt-sales-and-accounting-verification*
*Completed: 2026-08-26*

## Self-Check: PASSED
- Found: prisma/schema.prisma
- Found: prisma/migrations/20260827000000_sale_per_branch_receipt_verification/migration.sql
- Found: app/api/sales/[saleId]/route.ts
- Found: lib/contracts/sales.ts
- Found: tests/integration/sales-tracer.test.ts
- Found commit d23ec94
- Found commit d5203de
- Found commit 72f1e0c
- Found commit 7d7a03a
