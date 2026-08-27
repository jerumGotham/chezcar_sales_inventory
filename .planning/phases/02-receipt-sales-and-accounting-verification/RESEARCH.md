# Phase 02: Receipt Sales and Accounting Verification — Research

**Researched:** 2026-08-26
**Domain:** Manual-receipt sales posting, branch stock deduction, Accounting verification / mismatch / void-and-replace correction
**Confidence:** HIGH (direct source-file reads this session + accepted ADR)

## Summary

Phase 2 makes the sales slice durable: Branch Staff encodes one system `Sale` per handwritten receipt, the server deducts branch available stock atomically and writes immutable `InventoryMovement` rows, and Accounting verifies each sale against the paper receipt without ever editing the sale or stock in place. Corrections use an auditable **void-and-replace** pattern with compensating movements. The current codebase (`lib/server/services/customer-sales.ts`, `prisma/schema.prisma`, `app/api/sales/*`, `app/api/customer-orders/*`) already implements durable direct sales, customer-order reservation/release, and a stub Accounting review (`UNVERIFIED/VERIFIED/FLAGGED`), but its schema, enums, receipt uniqueness, and review state machine diverge from **ADR 0014** and **PRODUCT-REQUIREMENTS.md Workflows 1 & 2**. The research below enumerates every gap, cites line ranges verbatim, and prescribes the minimal additive migration + service work to align with the accepted decisions.

**Primary recommendation:** Keep the existing `Sale`/`SaleLine`/`ManualReceipt`/`SaleAccountingReview` foundation; add an additive migration that (1) replaces branch receipt uniqueness with `@@unique([locationId, receiptBooklet, receiptNumber])` (or equivalent parsed composite) per ADR 0014, (2) replaces `AccountingReviewStatus.FLAGGED` with `MISMATCH_REPORTED` and adds `VOIDED` handling via `Sale.status` + linked replacement, (3) introduces a closed `MismatchCategory` enum and `receiptPhotoUrl`, (4) adds `Sale.correctionOfId`/`Sale.voidedAt`/`voidedById` for void-and-replace, and (5) extends `NotificationRelatedType` + inventory-movement check to cover sale verification/correction — all behind the existing `Serializable` + `FOR UPDATE` transaction pattern already proven in `stock-transfers.ts`.

## Current Implementation (verified this session)

### Customer Orders (reservation → release)

- **Source:** `lib/server/services/customer-sales.ts:142-186` (`createCustomerOrder`), `196-216` (`releaseCustomerOrder`), `218-231` (`cancelCustomerOrder`)
- **Flow:** `RESERVATION_NO_DP`/`RESERVATION_WITH_DP` → `RESERVED` immediately increments `InventoryBalance.reserved` (`customer-sales.ts:90-96` `reserveLines`) leaving `onHand` unchanged; `WAITING_STOCK` does not reserve (`customer-sales.ts:159` `if (status === RESERVED) await reserveLines`). No auto-expiry — matches requirements.
- **Downpayment:** `RESERVATION_WITH_DP` requires `downpaymentReceiptNumber` + `downpaymentAmount > 0` (`customer-sales.ts:145`), stored globally unique, registered via `ManualReceipt` (`customer-sales.ts:179`). `cancelCustomerOrder` is Admin-only when `downpaymentAmount > 0` and requires a note (`customer-sales.ts:225` `DP_CANCEL_ADMIN_ONLY`) — matches spec.
- **Release:** `releaseCustomerOrder` validates `amountPaid === remainingBalance` (`customer-sales.ts:204`), calls `releaseReservedLines` which decrements both `reserved` and `onHand` atomically (`customer-sales.ts:98-106`), creates `Sale` + `SALE` lines snapshotting `productItemCode`/`productName`/`finalUnitPrice`, creates `CUSTOMER_ORDER_RELEASE` movements, registers `ManualReceipt` purpose `CUSTOMER_ORDER_FINAL`, and creates `accountingReview: { create: {} }` defaulting to `UNVERIFIED` — all in `Serializable` (`customer-sales.ts:206-210`).

### Direct Sales (branch handwritten-receipt encoding)

- **Source:** `lib/server/services/customer-sales.ts:233-254` (`createDirectSale`), `app/api/sales/route.ts:21-27`
- **Authorization:** `assertBranchOrAdmin` + `actorLocationId` — Branch Staff is branch-scoped, Admin allowed (`customer-sales.ts:62-75`). Capability on route is `customer-orders:view` (`app/api/sales/route.ts:14,23`) — narrower than ideal; plan should introduce a dedicated `sales:post` or reuse `customer-orders:view` intentionally and document it.
- **Posting:** Validates unique product per line, resolves active products (`activeProducts`), computes server-authoritative total, rejects `amountPaid !== total` (`customer-sales.ts:243` `INVALID_PAYMENT`), calls `deductSaleLines` which checks `onHand - reserved >= quantity` and decrements `onHand` (`customer-sales.ts:108-114`), creates `Sale` with `SaleLine` snapshots (`productItemCode`/`productName`/`unitPrice` Decimal), registers `ManualReceipt` purpose `DIRECT_SALE`, writes `DIRECT_SALE` movements, creates default `accountingReview` row (`customer-sales.ts:245-247`).

### Accounting Review (stub)

- **Source:** `lib/server/services/customer-sales.ts:52-56` (`accountingReviewSchema`), `264-268` (`reviewSale`), `prisma/schema.prisma:87-92` (`AccountingReviewStatus`), `503-516` (`SaleAccountingReview`)
- **Current status:** `accountingReviewSchema` [VERIFIED: lib/server/services/customer-sales.ts:52-56] is:
  ```ts
  export const accountingReviewSchema = z.object({
    status: z.enum(["VERIFIED", "FLAGGED"]),
    mismatchCategory: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(1_000).optional(),
  });
  ```
  `reviewSale` [VERIFIED: lib/server/services/customer-sales.ts:264-268] does:
  ```ts
  export async function reviewSale(actor: AuthContext, saleId: string, input: z.infer<typeof accountingReviewSchema>) {
    assertAccounting(actor);
    if (input.status === "FLAGGED" && (!input.mismatchCategory || !input.notes)) throw new CustomerSalesError("FLAG_DETAILS_REQUIRED", "Flagged reviews require category and notes", 400);
    return prisma.saleAccountingReview.upsert({ where: { saleId }, create: { saleId, status: input.status, mismatchCategory: input.mismatchCategory || null, notes: input.notes || null, reviewedById: actor.userId, reviewedAt: new Date() }, update: { status: input.status, mismatchCategory: input.mismatchCategory || null, notes: input.notes || null, reviewedById: actor.userId, reviewedAt: new Date() } });
  }
  ```
  This diverges from ADR 0014 on every dimension (see Schema Gaps).

### API + UI surfaces

- `app/api/sales/route.ts` [VERIFIED: app/api/sales/route.ts:12-27] — `GET`/`POST` behind `customer-orders:view`; error envelope `{ error: { code, message } }` with 400/403/409.
- `app/api/sales/[saleId]/review/route.ts` [VERIFIED: app/api/sales/[saleId]/review/route.ts:14-21] — `POST` behind `customer-orders:view` then `assertAccounting` (so Admin passes, Branch/Stock denied) — partially matches ADR but capability is over-broad.
- `app/api/customer-orders/route.ts` [VERIFIED: app/api/customer-orders/route.ts:14-30] — `GET`/`POST` behind `customer-orders:view`; release/cancel are `POST /api/customer-orders/:orderId/:action` (per `docs/API.md:56`).
- `app/customer-orders/page.tsx` [VERIFIED: app/customer-orders/page.tsx:1,138-209] — client page that fetches `/api/customer-orders`, filters/paginates in-browser, shows order-status and payment-status badges, and opens a downpayment `Dialog` — not yet sales-verification UI. No dedicated `/sales` or `/accounting/verify` page exists; Phase 2 must create it.
- `lib/server/policy/access.ts:76-89` [VERIFIED: lib/server/policy/access.ts:76-89] — `ACCOUNTING_STAFF` holds `dashboard:view`, `customers:view`, `customer-orders:view`, `reports:view` — notably **not** `inventory:view` or `stock-transfers:view`; correct per ADR that Accounting cannot adjust stock.

## Schema Gaps for Verification States

### Current enums (verbatim — do not paraphrase)

`prisma/schema.prisma:73-76` [VERIFIED: prisma/schema.prisma:73-76]:
```prisma
enum SaleStatus {
  POSTED
  VOIDED
}
```
`prisma/schema.prisma:87-91` [VERIFIED: prisma/schema.prisma:87-91]:
```prisma
enum AccountingReviewStatus {
  UNVERIFIED
  VERIFIED
  FLAGGED
}
```
`prisma/schema.prisma:460-486` [VERIFIED: prisma/schema.prisma:460-486]:
```prisma
model Sale {
  id                  String                @id @default(cuid())
  reference           String                @unique
  manualReceiptNumber String                @unique
  locationId          String
  customerId          String?
  orderId             String?               @unique
  status              SaleStatus            @default(POSTED)
  paymentMethod       PaymentMethod
  totalAmount         Decimal               @db.Decimal(12, 2)
  amountPaid          Decimal               @db.Decimal(12, 2)
  notes               String?               @db.Text
  postedById          String
  postedAt            DateTime              @default(now())
  ...
  accountingReview    SaleAccountingReview?
}
```
`prisma/schema.prisma:503-516` [VERIFIED: prisma/schema.prisma:503-516]:
```prisma
model SaleAccountingReview {
  id               String                 @id @default(cuid())
  saleId           String                 @unique
  status           AccountingReviewStatus @default(UNVERIFIED)
  mismatchCategory String?
  notes            String?                @db.Text
  reviewedById     String?
  reviewedAt       DateTime?
  sale             Sale                   @relation(fields: [saleId], references: [id], onDelete: Restrict)
  reviewedBy       User?                  @relation("SaleReviewedBy", fields: [reviewedById], references: [id])
}
```

### Required states per ADR 0014 §3 + PRODUCT-REQUIREMENTS.md Workflow 2

ADR 0014 prescribes four sale verification states [VERIFIED: docs/adr/0014-accounting-verification.md:22-27]:
> `UNVERIFIED` (default) → `VERIFIED` (terminal) ; `UNVERIFIED` → `MISMATCH_REPORTED` ; `MISMATCH_REPORTED` → `VOIDED` + linked `REPLACEMENT` OR `VERIFIED` via “confirm correct”.

Current schema maps to this as **two-table state** (intentional): `Sale.status = POSTED|VOIDED` + `SaleAccountingReview.status = UNVERIFIED|VERIFIED|FLAGGED`. The plan must migrate to the ADR vocabulary:

| ADR concept | Current column | Gap | Required change |
|---|---|---|---|
| `UNVERIFIED` | `SaleAccountingReview.status = UNVERIFIED` | OK — matches | Keep default |
| `VERIFIED` | `SaleAccountingReview.status = VERIFIED` | OK | Keep |
| `MISMATCH_REPORTED` | `FLAGGED` | **Name mismatch** — ADR closed enum uses `MISMATCH_REPORTED`; service/docs use `FLAGGED` | Rename enum value `FLAGGED` → `MISMATCH_REPORTED` (migration `ALTER TYPE ... RENAME VALUE`) or add `MISMATCH_REPORTED` and deprecate `FLAGGED`; update `accountingReviewSchema`, `reviewSale`, dashboards, reports |
| `VOIDED` | `Sale.status = VOIDED` | Partial — exists but has **no link to replacement** and no guard that `VOIDED` is only reachable via `MISMATCH_REPORTED` | Add void-and-replace link (next section) + service state-machine guard |
| `RESOLVED_MISTAKEN` | Absent | ADR §7 “Confirm correct” marks mismatch `RESOLVED_MISTAKEN` and transitions sale to `VERIFIED` | Either (a) add `resolution` enum/field on `SaleAccountingReview` (`RESOLVED_CORRECTED` / `RESOLVED_MISTAKEN`) or (b) differentiate via `status = VERIFIED` + `mismatchCategory = null` + audit notes. Recommend explicit `resolution` column to avoid ambiguous history |

**Must also enforce terminality:** `VERIFIED` and `VOIDED` are terminal; no further `upsert` should mutate them. Current `reviewSale` is an unconditional `upsert` with no state-transition check — the plan must add guards.

## Receipt Uniqueness Constraints

### Current constraint (global uniqueness — incorrect per ADR)

`prisma/schema.prisma:463` [VERIFIED: prisma/schema.prisma:463]: `manualReceiptNumber String @unique` — global uniqueness across all branches.
`prisma/migrations/20260826050000_customer_orders_sales_accounting/migration.sql:131-132` [VERIFIED: prisma/migrations/20260826050000_customer_orders_sales_accounting/migration.sql:131-132]:
```sql
CREATE UNIQUE INDEX "Sale_manualReceiptNumber_key" ON "Sale"("manualReceiptNumber");
CREATE UNIQUE INDEX "ManualReceipt_number_key" ON "ManualReceipt"("number");
```
`lib/server/services/customer-sales.ts:116-123` [VERIFIED: lib/server/services/customer-sales.ts:116-123] — `registerReceipt` catches `P2002` and rethrows `DUPLICATE_RECEIPT` 409; `directSaleSchema:45` [VERIFIED: lib/server/services/customer-sales.ts:45] has `manualReceiptNumber: z.string().trim().min(1).max(100)` with no booklet/series field.

### Required constraint (per-branch per ADR 0014 §1 + PRD Sales Rules)

ADR 0014 §1 [VERIFIED: docs/adr/0014-accounting-verification.md:12-16]:
> Receipt identity is unique **per branch** (`locationId + receiptBooklet + receiptNumber`), not globally. Different branches may reuse the same number. Enforce a hard DB unique constraint; duplicate posting returns 409 `DUPLICATE_RECEIPT`.

PRD Sales Rules [VERIFIED: docs/product/PRODUCT-REQUIREMENTS.md:136-138]:
> Receipt identity is unique by branch, receipt booklet/series, and receipt number. Skipped or cancelled receipt identities are recorded explicitly; duplicate/reused identities are blocked.

**Gap:** No `receiptBooklet`/`receiptSeries` column exists; no composite unique. Branches legitimately reuse booklet numbers in the field, so global uniqueness blocks valid operation and contradicts ADR’s rejected alternative “Global receipt uniqueness: rejected” [VERIFIED: docs/adr/0014-accounting-verification.md:71].

**Prescribed migration (choose one, document in PLAN):**

- **Option A (preferred, minimal):** Add `receiptBooklet String?` (or `receiptSeries String @default("")`) to `Sale`, replace `manualReceiptNumber @unique` with `@@unique([locationId, receiptBooklet, manualReceiptNumber])` (or `[locationId, receiptBooklet, receiptNumber]` if splitting). Backfill existing rows with `receiptBooklet = ""` for backward compat, or `SALE-<booklet>` parse if available. Drop global `ManualReceipt.number @unique` or scope it similarly.
- **Option B (normalized):** Add `receiptBooklet` + `receiptNumber` split, keep `manualReceiptNumber` as display string, but enforce uniqueness on the normalized triple. Heavier but cleaner for reporting.

Either way, `ManualReceipt` must mirror the same composite uniqueness — currently `ManualReceipt.number @unique` [VERIFIED: prisma/schema.prisma:399] must become composite or reference `Sale`’s composite.

**Service changes:** Update `directSaleSchema` to require `receiptBooklet` (or default), update `releaseOrderSchema`’s `finalReceiptNumber` similarly, update `registerReceipt` + `createDirectSale`/`releaseCustomerOrder` to handle `P2002` on the new composite index, and include `locationId` in the receipt identity when checking duplicates.

**Deferred per ADR:** Skipped/cancelled receipt identity recording is explicitly out of scope [VERIFIED: docs/adr/0014-accounting-verification.md:16].

## Mismatch Enum

### ADR closed set (verbatim — do not paraphrase)

`docs/adr/0014-accounting-verification.md:30-32` [VERIFIED: docs/adr/0014-accounting-verification.md:30-32]:
> Closed enum for MVP: `PRICE_MISMATCH`, `QUANTITY_MISMATCH`, `ITEM_MISMATCH`, `TOTAL_MISMATCH`, `RECEIPT_NOT_FOUND`, `OTHER`.

Stored per mismatch report with required `notes` and optional photo URL.

### Current state (free string)

`prisma/schema.prisma:507` [VERIFIED: prisma/schema.prisma:507]: `mismatchCategory String?` — unconstrained.
`lib/server/services/customer-sales.ts:54` [VERIFIED: lib/server/services/customer-sales.ts:54]: `mismatchCategory: z.string().trim().max(100).optional()` — accepts any string.

**Gap:** Free text defeats reporting (`dashboard: unverified/verified/mismatch counts`, `reports: accounting reconciliation` per `customer-sales.ts:337-342` and `docs/ARCHITECTURE.md:91`). PRD Workflow 2 step 4 [VERIFIED: docs/product/PRODUCT-REQUIREMENTS.md:150-151] requires “structured mismatch category”.

**Prescribed change:** Create Prisma enum (e.g., `enum MismatchCategory { PRICE_MISMATCH QUANTITY_MISMATCH ITEM_MISMATCH TOTAL_MISMATCH RECEIPT_NOT_FOUND OTHER }`) and migrate `SaleAccountingReview.mismatchCategory` from `String?` to `MismatchCategory?` (or keep string with Zod `z.enum(...)` validation — enum table is stronger). Update `accountingReviewSchema` to:

```ts
z.enum(["PRICE_MISMATCH","QUANTITY_MISMATCH","ITEM_MISMATCH","TOTAL_MISMATCH","RECEIPT_NOT_FOUND","OTHER"])
```

Add rule: when `status === "MISMATCH_REPORTED"` (`FLAGGED` successor), `mismatchCategory` + `notes` are **required**; when `status === "VERIFIED"`, both must be `null` to avoid stale data after “confirm correct”.

### Evidence / photo

ADR §5 [VERIFIED: docs/adr/0014-accounting-verification.md:34-36]: Accounting may attach **optional** `receiptPhotoUrl` when filing a mismatch. No such column exists on `SaleAccountingReview`. Add `receiptPhotoUrl String?` (validated as URL, max 1000). Defer damage/materiality threshold required-photo logic.

## Void-and-Replace Pattern

### ADR prescription (verbatim intent)

`docs/adr/0014-accounting-verification.md:44-48` [VERIFIED: docs/adr/0014-accounting-verification.md:44-48]:
> Never mutate a posted sale in place. On “Fix with correction”, create a new `Sale` row linked via `correctionOfId` (or `voidedSaleId`), mark original `VOIDED`, post compensating inventory movements (reverse original deduction, apply corrected deduction) in one transaction. “Confirm correct” keeps original, marks mismatch `RESOLVED_MISTAKEN`, and transitions sale to `VERIFIED`. Corrected replacement is **auto-VERIFIED**; no re-verification loop. Authorized actors for correction: `ADMIN` **or** `ACCOUNTING_STAFF`.

PRD Sales Rules [VERIFIED: docs/product/PRODUCT-REQUIREMENTS.md:143]: “Posted sales are not directly edited or hard-deleted. An encoding correction uses an auditable void-and-replace flow.” Audit rules [VERIFIED: docs/product/PRODUCT-REQUIREMENTS.md:293-294]: “Corrections and discrepancy resolutions remain linked to their source records.”

### Current state (no linkage, no reversal)

- No `correctionOfId` / `voidedSaleId` / `replacementId` FK on `Sale`.
- No `voidedAt`, `voidedById`, `voidReason` audit fields.
- No `SALE_VOID` / `SALE_CORRECTION` movement type. Current `InventoryMovementType` [VERIFIED: prisma/schema.prisma:42-52]:
  ```prisma
  enum InventoryMovementType {
    SUPPLIER_RECEIPT TRANSFER_DISPATCH TRANSFER_RECEIPT TRANSFER_RESTORATION TRANSFER_LOSS TRANSFER_RESOLUTION MANUAL_ADJUSTMENT CUSTOMER_ORDER_RELEASE DIRECT_SALE
  }
  ```
  `prisma/migrations/20260826060000_sales_inventory_movement_constraint/migration.sql:2-6` [VERIFIED: prisma/migrations/20260826060000_sales_inventory_movement_constraint/migration.sql:2-6] enforces `type IN ('MANUAL_ADJUSTMENT','CUSTOMER_ORDER_RELEASE','DIRECT_SALE') AND transferId IS NULL AND receiptId IS NULL` — sale correction movements already fit this source-less pattern, but the plan should explicitly add `SALE_VOID`/`SALE_CORRECTION` or reuse with distinct `reference`/`remarks`.
- `reviewSale` never touches `Sale.status` or `InventoryBalance`.

### Prescribed implementation

**Schema (additive migration `..._sale_verification_correction`):**
```prisma
model Sale {
  status              SaleStatus            @default(POSTED)
  voidedAt            DateTime?
  voidedById          String?
  voidedBy            User?                 @relation("SaleVoidedBy", fields: [voidedById], references: [id])
  correctionOfId      String?               @unique // or voidedSaleId — one replacement per voided sale
  correctionOf        Sale?                 @relation("SaleCorrection", fields: [correctionOfId], references: [id])
  replacement         Sale?                 @relation("SaleCorrection")
  // keep version Int @default(1) if optimistic locking desired (mirrors StockTransfer.version)
}
```
Add `@@index([correctionOfId])`. Keep `Sale.orderId @unique` — replacement sale for a released order must null out or branch correctly (deferred: owner must confirm whether corrected sales may re-link to the same `CustomerOrder`).

**Service transaction (one `Serializable` tx — mirrors `stock-transfers.ts:299-320` `resolveTransfer` pattern):**
1. `SELECT ... FOR UPDATE` on the Sale row + its `SaleAccountingReview` + `InventoryBalance` rows for affected product/locations (use `lockTransfer`-style `prisma.$queryRaw SELECT FOR UPDATE`).
2. Validate caller is `ADMIN` or `ACCOUNTING_STAFF` (ADR §7 — both share one service, audit records `actorId`).
3. Validate current review is `MISMATCH_REPORTED` and `Sale.status === POSTED` (guard `STALE_VERSION` / `INVALID_STATE`).
4. **Branch A — Confirm correct:** set `SaleAccountingReview.status = VERIFIED`, `mismatchCategory = null`, `notes = "Confirmed correct — <reason>"`, `reviewedById/At`, optionally `resolution = RESOLVED_MISTAKEN`. No stock change.
5. **Branch B — Fix with correction:**
   - Create new `Sale` (reference `SALE-${randomUUID()}`, same `locationId`, new `manualReceiptNumber` = corrected receipt identity, new `totalAmount`/`amountPaid` server-computed, new `SaleLine` snapshots, `accountingReview: { create: { status: VERIFIED } }` — auto-verified per ADR).
   - Validate corrected quantities: for each line delta, ensure `onHand - reserved` can absorb net increase; never allow `onHand < 0` or `onHand < reserved` after reversal + re-deduction (reuse `deductSaleLines` guard).
   - Post compensating movements: `+originalQty` reversal then `-correctedQty` deduction (or net delta), both with `type: DIRECT_SALE` or new `SALE_VOID`/`SALE_CORRECTION`, `actorId`, `reference = original receipt`, `remarks = "Void-and-replace for <ref> by <actor>"`.
   - Update original: `Sale.status = VOIDED`, `voidedAt/ById`, and set `newSale.correctionOfId = original.id`.
   - All steps in one `prisma.$transaction({ isolationLevel: Serializable })`.

**Invariants preserved (ADR §8):** No negative stock, server-calculated totals, idempotent retry via idempotency key or `FOR UPDATE` + version check, actor/time recorded, movements immutable.

## Notification Needs

### Current notification infra

`prisma/schema.prisma:93-102` [VERIFIED: prisma/schema.prisma:93-102]:
```prisma
enum NotificationType { INFO WARNING SUCCESS }
enum NotificationRelatedType { STOCK_TRANSFER INVENTORY_BALANCE }
```
`lib/server/services/notifications.ts:59-74` [VERIFIED: lib/server/services/notifications.ts:59-74] exposes `createNotifications(tx, notifications)` which is called **inside** the same `Serializable` transaction as the business state change (proven in `lib/server/services/stock-transfers.ts:117-135` `notifyUsersForTransfer` and `docs/API.md:89-91`).

`docs/product/PRODUCT-REQUIREMENTS.md:221-231` [VERIFIED: docs/product/PRODUCT-REQUIREMENTS.md:221-231]: Notifications are durable per-user rows, live + reconnect catch-up + browser push, not broadcast to everyone.

### ADR notification requirements

`docs/adr/0014-accounting-verification.md:38-42` [VERIFIED: docs/adr/0014-accounting-verification.md:38-42]:
> On `MISMATCH_REPORTED`, create durable per-user notifications for: all `ADMIN` users + the `BRANCH_STAFF` who encoded the sale (attributable via `Sale.encodedById`). On correction/confirm, notify the same set.

(Current `Sale` uses `postedById` not `encodedById` — same concept; keep `postedById` and document alias.)

### Gaps

- `NotificationRelatedType` lacks `SALE` / `SALE_ACCOUNTING_REVIEW`; `STOCK_TRANSFER`/`INVENTORY_BALANCE` cannot link to a sale — needed for inbox deeplink `relatedReference = Sale.reference`.
- No recipient-expansion helper for accounting events (existing `activeUsersForRole` + `notifyUsersForTransfer` pattern must be mirrored as `notifyUsersForSale`).
- No notification for “sale posted → UNVERIFIED queue updated” (not required by ADR, but useful for Accounting queue; defer).

### Prescribed change

- Extend enum: `enum NotificationRelatedType { STOCK_TRANSFER INVENTORY_BALANCE SALE SALE_ACCOUNTING_REVIEW }` (choose `SALE` as single type covering both events; `relatedId = saleId`, `relatedReference = sale.reference`).
- In `reviewSale`-successor service, after setting `MISMATCH_REPORTED`, call `createNotifications(tx, [...adminIds, sale.postedById].unique.map(id => ({ userId: id, title: "Sale mismatch reported", description: "${sale.reference} (${location.code}) flagged as ${mismatchCategory} — ${notes}", type: "WARNING", relatedType: "SALE", relatedId: sale.id, relatedReference: sale.reference })))`.
- Mirror on correction/confirm: `type: SUCCESS` for correction, `INFO` for confirm-correct, same recipient set.
- Reuse existing polling (`GET /api/notifications` every 30s + window-focus refetch per `docs/API.md:91`) — no new delivery infra needed in Phase 2; SSE/push is Phase 3.

## Architecture Patterns

### Reference implementation: transfer correction as sale correction template

`lib/server/services/stock-transfers.ts:299-320` `resolveTransfer` [VERIFIED: lib/server/services/stock-transfers.ts:299-320] already demonstrates the exact pattern Phase 2 must reuse: `lockTransfer` (`SELECT FOR UPDATE`), `assertVersion`, `UNDER_REVIEW → RESOLVED` guard, `StockTransferResolution` + `increaseBalance` + `InventoryMovement` per line (destination/SR/loss) clearing `inTransitQuantity`, all in one `Serializable` transaction, then `notifyUsersForTransfer`.

### Project structure (follow existing boundaries)

```
prisma/
  schema.prisma
  migrations/20260826XXXXXX_sale_verification_correction/migration.sql
lib/server/services/
  customer-sales.ts          # extend: correctionOf, void-and-replace, review state machine
  notifications.ts           # extend: SALE related type
  prisma.ts                  # singleton — keep server-only
lib/server/policy/access.ts  # add capability if needed
app/api/sales/
  route.ts                   # GET list, POST direct sale
  [saleId]/review/route.ts   # POST verify/flag (keep) + new routes below
  [saleId]/correct/route.ts  # POST void-and-replace (new)
  [saleId]/confirm/route.ts  # POST confirm-correct (new) — or unify under /review with action
app/(authenticated)/
  sales/page.tsx             # new or enhance — branch post + verified-queue
  accounting/verify/page.tsx # new — unverified list, compare, verify/flag
  accounting/mismatches/page.tsx # new — Admin/Accounting correction inbox
```

### Access-control model

- **Post sale:** `BRANCH_STAFF` (branch-scoped) + `ADMIN` (as today via `assertBranchOrAdmin` [VERIFIED: lib/server/services/customer-sales.ts:62-64]). No change.
- **Verify / flag mismatch:** `ACCOUNTING_STAFF` only. Current `assertAccounting` allows `ADMIN` too [VERIFIED: lib/server/services/customer-sales.ts:67-69]; tighten to Accounting-only for verification, keep `ADMIN` for mismatch resolution per ADR. Verify via row-level `requireCapability` + service-level check.
- **Correct / confirm:** `ADMIN` **or** `ACCOUNTING_STAFF` (busy-owner concern) [VERIFIED: docs/adr/0014-accounting-verification.md:48-49]; same service, audit distinguishes actor.
- **Scope:** Branch Staff always scoped to `actor.locationId`; Accounting/Admin are business-wide (no location) [VERIFIED: lib/server/policy/access.ts:99-116]. `listSales` branching `where = BRANCH_STAFF ? { locationId } : {}` [VERIFIED: lib/server/services/customer-sales.ts:258-259] already matches.

### Idempotency & concurrency

- Add `Sale.version Int @default(1)` (like `StockTransfer.version` [VERIFIED: prisma/schema.prisma:224] and `InventoryBalance.version` [VERIFIED: prisma/schema.prisma:166]) and require caller to send `version` on correction/confirm. On conflict, return `409 STALE_VERSION` mirroring `stock-transfers.ts:40`.
- Duplicate receipt handling: catch `P2002` on composite unique and return `409 DUPLICATE_RECEIPT` as today [VERIFIED: lib/server/services/customer-sales.ts:250-252].

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why |
|---|---|---|---|
| Receipt uniqueness | App-layer “check then insert” | Prisma composite `@@unique([locationId, receiptBooklet, manualReceiptNumber])` + `P2002` catch | Race-safe; app check is TOCTOU without DB constraint; proven by `registerReceipt` pattern |
| Money | Float/JS number | `Decimal(12,2)` (`totalAmount`, `amountPaid`, `unitPrice` already Decimal [VERIFIED: prisma/schema.prisma:469-470,495]) + `decimal()` helper [VERIFIED: lib/server/services/customer-sales.ts:77] | Avoids binary float drift; PRD Sales Rule says server calculates authoritative totals |
| Stock deduction | Direct `update` | `deductSaleLines`/`increaseBalance` guarded by `onHand - reserved >= qty` + `version` optimistic lock [VERIFIED: lib/server/services/customer-sales.ts:108-114, lib/server/services/stock-transfers.ts:53-78] | Prevents negative stock and lost updates under concurrent branch posts |
| Verification state | Free-text status | Closed Prisma enum `MismatchCategory` + `AccountingReviewStatus` | Needed for dashboard/reports grouping and to reject invalid categories |
| Photo upload | Base64 in DB | `receiptPhotoUrl String?` storing object-storage URL (Phase 3 storage) | Keeps row small; actual upload deferred |
| Notifications | In-memory event bus | Durable `Notification` rows + `createNotifications(tx, ...)` in same tx [VERIFIED: lib/server/services/notifications.ts:59-74] | Required for reconnect catch-up and audit |

## Common Pitfalls

- **Global receipt uniqueness blocks valid branch reuse.** Mitigate by migrating to composite unique before launch; include a backfill and an integration test posting the same number to two branches.
- **Editing `Sale`/`SaleLine` in place loses history.** Hard-block: `reviewSale` must never `update SaleLine.totalAmount`; correction must create a new row. Add a regression test asserting voided original remains queryable.
- **Negative stock on correction.** Net quantity can exceed available branch stock when corrected qty > original qty. Validate `onHand - reserved` against net delta inside the same `Serializable` tx before posting compensating movements.
- **Terminal state violation.** `VERIFIED`/`VOIDED` must be terminal; unconditional `upsert` in `reviewSale` [VERIFIED: lib/server/services/customer-sales.ts:267] violates this. Add guards that reject transitions from terminal states.
- **Capability over-permission on `/api/sales/[saleId]/review`.** Today the route gates on `customer-orders:view` then `assertAccounting` [VERIFIED: app/api/sales/[saleId]/review/route.ts:16, lib/server/services/customer-sales.ts:67-69]; Branch Staff cannot reach it but Stock Staff is also denied correctly. Tighten verification to `ACCOUNTING_STAFF` only; allow correction to both `ADMIN` + `ACCOUNTING_STAFF`.
- **`onHand` non-negative not DB-enforced.** `InventoryBalance` migration enforces non-negative `reserved`/`reorderLevel`/`unitCost`/`version` but not `onHand` [VERIFIED: docs/DATABASE.md:41-42]. Service-level guards (`deductSaleLines`, `decreaseAvailableBalance`) are the current defense — keep them and add a tx-level check on correction.
- **Sale correction orphaning `CustomerOrder` link.** `Sale.orderId @unique` [VERIFIED: prisma/schema.prisma:466] means a replacement for a released order cannot naively reuse the same `orderId`. Plan must decide: replacement links to same order (requires dropping unique) or replacement is `orderId = null` with `remarks` linking to order reference. Defer to owner decision; default to null + remarks and block void-and-replace for order-linked sales until decided.
- **Notification fan-out bug.** Forgetting to notify the encoding `postedById` defeats the “branch learns of mismatch” requirement. Use `sale.postedById` as recipient alongside `ADMIN` ids (mirrors `notifyUsersForTransfer` recipients [VERIFIED: lib/server/services/stock-transfers.ts:93-106,117-135]).

## Risks (for planner — must address)

1. **Data divergence risk — global receipt uniqueness blocks Phase 2 UAT.** First branch pair that reuses a booklet number will hit 409 spuriously. **Mitigation:** Plan the composite unique migration as the first task; add cross-branch uniqueness test.
2. **Audit gap — free-text mismatchCategory.** Without a closed enum, reports cannot group by category and mismatches become unsearchable. **Mitigation:** Introduce `MismatchCategory` enum and Zod `z.enum(...)` validation before building dashboards.
3. **Correction stock race.** Two concurrent corrections for the same sale could double-reverse. **Mitigation:** `SELECT FOR UPDATE` on sale + `version` check + unique `correctionOfId` constraint to guarantee once-only replacement.
4. **Order-linked sale correction ambiguity.** Voiding a sale created by `releaseCustomerOrder` touches `CustomerOrder` state (`COMPLETED`). **Mitigation:** Explicitly exclude order-linked sales from void-and-replace in MVP or define re-release flow with owner; document deferred idea.
5. **Notification enum mismatch in prod DB.** Adding a new `NotificationRelatedType` value requires `ALTER TYPE ... ADD VALUE` without holding a transaction that conflicts with concurrent inserts. **Mitigation:** Add the enum value in a standalone migration before service code that writes it.
6. **Price snapshot staleness.** `SaleLine.unitPrice` snapshots current `Product.price` at posting [VERIFIED: lib/server/services/customer-sales.ts:245-247]; `CustomerOrderLine` stores `baseUnitPrice` + `finalUnitPrice`. A product price edit after posting must not retroactively change sale totals — already satisfied by snapshot, but plan should assert this in tests.
7. **Capability creep if correction reuses `customer-orders:view`.** Every authenticated role holds `customer-orders:view` [VERIFIED: lib/server/policy/access.ts:76-88], so it cannot gate correction. **Mitigation:** Gate correction handlers with explicit `ADMIN`/`ACCOUNTING_STAFF` role checks (or a new `accounting:verify` capability).

## Code Examples (prescribed — copy into PLAN tasks)

### Receipt identity — target model (additive migration sketch)
```prisma
model Sale {
  receiptBooklet      String              @default("")
  manualReceiptNumber String
  // was: manualReceiptNumber String @unique
  @@unique([locationId, receiptBooklet, manualReceiptNumber])
}
```

### Mismatch category — Zod validation
```ts
// Source: docs/adr/0014-accounting-verification.md:30-32
const mismatchCategoryEnum = z.enum([
  "PRICE_MISMATCH",
  "QUANTITY_MISMATCH",
  "ITEM_MISMATCH",
  "TOTAL_MISMATCH",
  "RECEIPT_NOT_FOUND",
  "OTHER",
]);
const accountingReviewSchemaV2 = z.discriminatedUnion("status", [
  z.object({ status: z.literal("VERIFIED") }),
  z.object({ status: z.literal("MISMATCH_REPORTED"), mismatchCategory: mismatchCategoryEnum, notes: z.string().trim().min(1).max(1_000), receiptPhotoUrl: z.string().url().max(1_000).optional() }),
]);
```

### Void-and-replace — compensating movements (same tx)
```ts
// Pattern: lib/server/services/stock-transfers.ts:311 createInventoryMovement per line
// Inside Serializable tx after locking balances:
for (const line of original.lines) {
  await tx.inventoryMovement.create({ data: { productId: line.productId, locationId, quantity: +line.quantity, type: "DIRECT_SALE", actorId, reference: original.manualReceiptNumber, remarks: `Sale void reversal ${original.reference}` } });
}
for (const line of correctedLines) {
  await tx.inventoryMovement.create({ data: { productId: line.productId, locationId, quantity: -line.quantity, type: "DIRECT_SALE", actorId, reference: corrected.manualReceiptNumber, remarks: `Sale correction ${corrected.reference} for ${original.reference}` } });
}
```

## State of the Art

| Old | Current (this codebase) | Impact |
|---|---|---|
| Mock sales screens | Durable `Sale`/`SaleLine`/`ManualReceipt`/`SaleAccountingReview` with `Serializable` tx | Phase 2 builds verification on top, not greenfield |
| `FLAGGED` review state | ADR accepted `MISMATCH_REPORTED`; plan renames value | Aligns domain language with owner-facing workflows |
| Global receipt uniqueness | Per-branch composite unique (to be migrated) | Unblocks real branch booklet reuse |
| In-place sale edit risk | Void-and-replace with linked replacement + compensating movements | Preserves audit, matches stock-transfer resolution shape |

## Assumptions Log

| # | Claim | Risk if Wrong |
|---|---|---|
| A1 | `receiptBooklet` may default to `""` for existing rows without a migration data fix | Existing sales all get `""`; composite still enforces per-branch uniqueness but historical booklet value is lost — acceptable for MVP; confirm with owner |
| A2 | Order-linked sales are excluded from void-and-replace in MVP | If owner expects released-order corrections, PLAN needs an added `CustomerOrder` re-release edge case |
| A3 | `receiptPhotoUrl` is a URL string, not binary column | If owner expects actual file upload, storage choice (Vercel Blob / S3 / deferred) must be decided |

## Open Questions (for discuss-phase / owner)

1. **Order-linked correction:** Should a `Sale` created by `releaseCustomerOrder` (`orderId @unique`) be voidable-and-replaceable, and if so should the replacement re-link to the same `CustomerOrder` or be a standalone `DIRECT_SALE`-like row? Current unique prevents re-link.
2. **Receipt identity shape:** Confirm whether the handwritten receipt series is a physical `receiptBooklet` string or numeric prefix that can be concatenated vs. two separate fields.

## Validation Architecture (no test infra yet — reuse Phase 1 harness)

Per `vitest.config.ts` / `tests/helpers/database.ts` (Phase 1), integration tests run against the disposable PostgreSQL 17 lifecycle (`chezcar_test_postgres`). PLAN should add sales/verification tests reusing that harness; no new framework needed.

## Security Domain (applies — capability-gated, no cryptography)

- Input validation: Zod on every handler (`directSaleSchema` [VERIFIED: lib/server/services/customer-sales.ts:42-50], `accountingReviewSchema`, receipt identity).
- Authorization: `requireCapability` + `validatePersistedAssignment` + role-specific asserts (`assertBranchOrAdmin`, `assertAccounting`) already; tighten verification/correction role split.
- Never hand-roll crypto; `ManualReceipt` uniqueness is an integrity constraint, not a secret.

## Sources

### Primary (HIGH — read this session)
- `prisma/schema.prisma:73-76,87-102,396-406,460-516` — installed enums/models/constraints
- `prisma/migrations/20260826050000_customer_orders_sales_accounting/migration.sql:1-160` — unique indexes, FKs, amount checks
- `prisma/migrations/20260826060000_sales_inventory_movement_constraint/migration.sql:1-7` — movement source check
- `lib/server/services/customer-sales.ts:42-56,62-77,108-114,116-123,233-268` — schemas, posting, movements, review stub
- `app/api/sales/route.ts:1-28` and `app/api/sales/[saleId]/review/route.ts:1-22` — current API surface
- `app/customer-orders/page.tsx:1,138-209` — current order UI is client-filtered, no verification UI exists
- `lib/server/services/stock-transfers.ts:53-135,299-320` — proven `Serializable` + `FOR UPDATE` + `createNotifications` pattern to reuse
- `lib/server/services/notifications.ts:59-74` — durable per-user notification helper
- `lib/server/policy/access.ts:76-89,99-116` — fixed role/capability matrix and location assignment rules

### Secondary (MEDIUM — accepted decisions, cited)
- `docs/adr/0014-accounting-verification.md:1-79` — locked decisions on uniqueness, states, enum, verification actor, notifications, void-and-replace
- `docs/product/PRODUCT-REQUIREMENTS.md:117-153` — Workflows 1 & 2, sales rules, verification steps
- `docs/product/PROVISIONAL-DATA-MODEL.md:175-220` — provisional Sale/SaleLine/SaleVerification/ReconciliationIssue shape (not authoritative for foundation models)
- `docs/API.md:55-92,256` and `docs/ARCHITECTURE.md:46-55` — current authenticated surface and boundary inventory
- `docs/DATABASE.md:6-82` — implemented models and deliberate gaps

## Metadata

**Confidence breakdown:**
- Current sales/customer-orders implementation: HIGH — verified via direct file reads line-by-line this session
- Schema gaps / receipt uniqueness / mismatch enum / void-and-replace / notifications: HIGH — ADR accepted + PRD confirmed, quoted verbatim above
- Risks: MEDIUM — some owner decisions (order-linked correction, receipt booklet shape) pending confirmation

**Valid until:** 2026-09-26 (stable domain; re-verify if `prisma/schema.prisma` adds a new sales migration)
