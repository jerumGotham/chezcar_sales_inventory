# Backjob Items and Draft Deletion

Status: authored 2026-09-08, source-only and unverified. No tests, build, lint, typecheck, browser checks, migration execution, Prisma generation, server restart, or data cleanup was performed. Existing unrelated changes, including nullable Warranty intake-photo fields, are preserved.

## Persisted Items

- Migration: `prisma/migrations/20260908200000_backjob_items_and_delete/migration.sql`, after the existing `20260908180000` migration.
- `Backjob.items` owns `BackjobItem[]`. Each child has `id`, `backjobId`, nullable `originalSaleLineId`, nullable `productId`, nullable `productItemCode`, required `productName`, and zero-based `position`.
- Backjob, SaleLine, and Product foreign keys use `ON DELETE RESTRICT`. `(backjobId, originalSaleLineId)` and `(backjobId, position)` are unique; line and product lookups are indexed. Position has a database nonnegative check.
- Every existing Backjob gets one child with deterministic ID `backfill-<backjobId>`, copied from its original line/product/snapshot fields. Legacy descriptions remain descriptions; missing names display `Not recorded`. The migration never deletes, renames, or replaces a Backjob, including `BJ-` records.
- Singular Backjob header columns remain unchanged. New normal cases copy the first selected item's identity/snapshot into those columns for persisted/read compatibility, while children are authoritative for the full selection. A record with no children falls back to a synthetic one-item DTO from its header, covering old writers during rollout. This fallback still requires the new database table and generated client; it cannot run against the old schema.
- New normal creation accepts `saleLineIds` (1-100 unique IDs), replacing singular `saleLineId`. All IDs must resolve under one currently posted Sale with a recorded customer. The service derives branch/customer and snapshots from that Sale, enforces location scope, and share-locks the Sale through the serializable creation transaction. The caller cannot mix receipts/customers or supply product snapshots.
- Legacy input remains owner-only and creates one description-only child. Selection tracks SaleLines, not affected unit quantities. Repair/replacement parts remain the separate `BackjobPart` aggregate.
- List/detail/mutation DTOs expose `items: BackjobItemDto[]` ordered by `position`, with the child fields above except `backjobId`. List search checks all item codes/names. Creation uses checkbox multi-selection; list, detail, and print render every selected item.

## Capability and Deletion

- `backjobs:delete` is in the actual capability catalog and implies only `backjobs:view`. The catalog-driven role editor exposes it to authorized grantors. The development seed's Admin capability set includes it; the additive migration grants it only to `RoleDefinition.isOwner = true`. Non-owner built-ins do not receive it automatically. Owner effective-capability conventions remain unchanged, and delegated grants never imply all-location access.
- `DELETE /api/backjobs/:backjobId`, body `{ version: positiveInteger }`, returns `{ data: { id } }`. The service `deleteDraftBackjob` checks the capability and current record location, takes the same `FOR UPDATE` parent lock as other actions, checks the version, and uses serializable isolation.
- Only `DRAFT` can be deleted. There is no `PENDING` Backjob workflow state; pending coverage has no effect on deletion eligibility.
- Reject nonzero issued/returned quantities, any non-null used quantity, linked movements, or any InventoryMovement carrying the case reference, even without a part FK. No stock balances or movements are deleted or reversed by this action.
- Reject charge Sale links, nonzero charge amounts, chargeable coverage, and historical coverage events that are not explicitly covered/zero/no-charge. Changing coverage back to covered does not make financial history disposable.
- Reject attachments, schedule history, schedule/Installer snapshots, work/completion/acknowledgement/closure evidence, and unrecognized or non-draft event history. Only draft `CREATED`, `PARTS_PLANNED`, and safe `COVERAGE_SET` history is disposable. Future restrictive relations fail closed instead of being cascaded away.
- The detail page exposes a capability-gated Delete draft confirmation only for `DRAFT`. The server remains authoritative for all evidence restrictions; a rejected deletion leaves the case intact and displays the error.
- Successful deletion removes old `BACKJOB` notifications with that ID, draft events, unused parts, items, and the Backjob in the same transaction. Existing notification deletion cascades only its `PushDeliveryAttempt` rows. It then creates one `Backjob deleted` warning for every active owner Admin, using the shared notification service with the reference/branch but no `relatedId`. This avoids dead detail links; no separate surviving deletion audit event is claimed. Existing event notifications remain otherwise unchanged.

## Main Cleanup Handoff

Main owns any authorized removal of old `BJ-` records. No records were removed here. The new application action is deliberately not a general historical-data purge.

1. Identify and lock the exact intended Backjob rows; inspect stock/financial/work evidence before deciding that deletion is safe. Do not apply the new application guard to bypass existing stock or financial audit requirements.
2. Existing direct child relations are `BackjobAttachment.backjobId`, `BackjobScheduleHistory.backjobId`, `BackjobEvent.backjobId`, and `BackjobPart.backjobId`. Attachments and schedules must be absent for the application Delete action, so it does not delete either. Physical attachment storage would need separately authorized cleanup in any broader maintenance operation.
3. `InventoryMovement.backjobPartId` restricts part deletion. Also inspect movements matching the Backjob reference. Preserve movements and affected cases rather than removing the ledger to force deletion.
4. Remove only approved case-linked Notification rows (`relatedType = BACKJOB`, `relatedId = case ID`); their push delivery attempts cascade. Notification related IDs are not Backjob foreign keys and therefore require explicit handling.
5. For a safe unused draft, delete BackjobEvent and BackjobPart children, then BackjobItem if the new migration exists, then Backjob. On the old schema, BackjobItem does not exist: skip that relation and do not call the new generated-client service against that schema. No original Sale, SaleLine, Customer, Product, Personnel, charge Sale, or inventory balance should be deleted as part of draft removal.
6. The broad guarded development reset script separately includes `backjobItems` before `backjobs` and `saleLines`; it must only run against its approved migrated target. This script was edited, not executed. Existing reset integration expectations do not enumerate all deletion counters, so adding the counter needs no expectation rewrite.

## Reports Handoff

Reports files are owned by the Reports agent and were not edited here. Main/Reports must include `items` ordered by `position` in the Backjob report query and display every item's code/name, with the same header fallback for older writer-created empty aggregates. Keep one report case row/count and one set of charge totals per Backjob; joining items must not multiply case or financial totals. Items are selected purchased lines, not affected-unit quantities; any report item-count value must be labeled/interpreted accordingly and must not substitute SaleLine.quantity. Legacy description-only rows have no known purchased-item identity.

The report service currently uses the singular affected-product fields; completing its consumer change is a separate required handoff, not a verified outcome of this implementation.

## Verification Limits

Only source inspection was performed. The existing new-Backjob form test's single-item markup expectations were adjusted to the new checkbox fieldset/copy; no new tests were authored or run. Migration application/backfill, Prisma-generated types, serializable race behavior, authorization/error cases, notification cleanup, reset integration, responsive/dark-mode controls, and multi-item print/PDF layouts remain unverified. Draft creation retains the existing lack of request idempotency: retry after a lost successful response can still create another case.
