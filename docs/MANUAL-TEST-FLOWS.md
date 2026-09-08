# Manual Test Flows for New Features

**Last updated:** 2026-09-08

## Environment Status

- Application URL: `http://localhost:3000`
- Health endpoint: `http://localhost:3000/api/health`
- Previously recorded health result: `{"status":"ok"}`; not rechecked for this documentation update.
- The previously recorded production build passed; the newly implemented source is not verified by that result.
- Earlier checked-in migrations were applied, including `20260908120000_warranty_order_audit_indexes`. The later `20260908180000_optional_warranty_intake_photo` and additive `20260908200000_backjob_items_and_delete` migrations are authored but NOT applied, and Prisma Client has NOT been regenerated for them. No-photo Warranty creation and Backjob items/deletion, including multi-item Returns report reads, remain pending those prerequisites and verification.
- Prisma subsequently prompted to create another migration. That process was stopped on request, so complete schema parity has not been confirmed.
- Receipt OCR and automatic extraction are intentionally absent.

## Recommended Test Order

Run the workflows in this order because later workflows need records created by earlier workflows:

1. Personnel
2. Salesperson attribution
3. Direct Sale and receipt verification
4. Customer Order attribution and reassignment
5. Backjob
6. Split supplier receiving
7. Customer Warranty
8. Supplier Claim
9. Reports and PDF export
10. Authorization checks

## Suggested Test Accounts

Use accounts with these capabilities when available:

| Test actor | Main capabilities needed |
| --- | --- |
| Owner Admin | All current capabilities and all-location access |
| Branch Staff | Sales, Customer Orders, Backjobs, basic Warranty creation, assigned branch access |
| Stock Staff | Receiving, inventory, quarantine, Supplier Claim stock actions, Stock Room access |
| Accounting Staff | Receipt verification, evidence view, Supplier Claim refund/credit, Reports |
| Restricted test user | Selected view capability without the corresponding mutation capability |

## 1. Personnel

Open `/personnel`.

### Happy Path

1. Create a `SALESPERSON` assigned to a branch.
2. Create an `INSTALLER` assigned to the same branch.
3. Create a `BOTH` Personnel record.
4. Edit a Personnel name or branch.
5. Click Deactivate and confirm the dialog names the selected Personnel. Cancel first and verify the record stays active; retry and confirm deactivation.
6. Confirm inactive Personnel remain in maintenance/history.
7. Confirm inactive Personnel disappear from new transaction selections.

### Expected Results

- Personnel records do not receive login accounts, roles, sessions, or application permissions.
- Cross-branch edits require access to both the old and new branches.
- Historical Sale, Order, and Backjob snapshots retain their recorded Personnel identity after later edits or deactivation.

## 2. Direct Sale Salesperson Attribution

Open `/pos`.

### Happy Path

1. Select a branch.
2. Add an active product with available stock.
3. Enter or select customer information.
4. Select an active `SALESPERSON` or `BOTH` Personnel within your authorized locations. An all-location actor can select from every active branch, independently of the transaction branch.
5. Post the Sale.
6. Open the persisted Sale or Accounting receipt record.
7. Confirm the selected Salesperson is separate from the authenticated encoder/poster.

### Negative Checks

1. Try to post without a Salesperson.
2. Confirm the server rejects the request.
3. Confirm an all-location actor can select a Salesperson from another active branch. For a scoped actor, confirm Personnel outside their authorized locations are unavailable or rejected.
4. Deactivate the selected Salesperson and attempt a new Sale.
5. Confirm the inactive Salesperson cannot be selected.
6. Confirm an already posted Sale still displays the original Salesperson and branch snapshot.

### Direct Sales List and Summary

1. Open `/customer-orders` with both `sales:view` and `customer-orders:view`. Confirm Direct Sales is the first tab and selected by default; `/customer-orders?view=orders` explicitly selects Customer Orders.
2. Confirm an orders-only actor falls back to Customer Orders and cannot see the Direct Sales tab; a sales-only actor can open Direct Sales without seeing the Customer Orders tab.
3. Confirm the four cards are Total Direct Sales, Sales Total, Total Discounts, and Amount Paid.
4. Reconcile the cards to all-time posted direct sales within authorized locations, excluding Customer Order releases and voided sales. These are not verified-only Sales Report totals.
5. Search and paginate the latest-200 Direct Sales list. Confirm list search does not change the all-time summary cards and totals are not limited to those 200 rows.
6. Confirm cards show Loading while loading, Unavailable on a request error, and zero values for a successful empty dataset. Reload and check both tabs, mobile card wrapping, and light/dark readability.

## 3. Receipt Evidence and Accounting Verification

Open `/accounting/receipt-verification` after posting a Sale.

### Evidence Upload

1. Upload the handwritten receipt photo for the Sale.
2. Confirm the image is private and visible only to an actor with `sales:evidence:view` and location access.
3. Confirm the system does not display OCR text, confidence, extracted totals, or automatic verification.

### Remove Selected Photo

1. In Customer Sales/POS and Receipt Verification, select an unsaved receipt image and click `Remove selected photo`. Confirm the File, preview, and native file input clear, the same file can be selected again, and removal sends no server request.
2. Confirm POS exposes only unsaved selection removal. In Receipt Verification, removing a selected replacement must leave the persisted receipt photo unchanged, including after reload.
3. If a Branch Finding replacement was already uploaded but its response submission needs retry, confirm it is not presented as an unsaved removable file.

### Delete Persisted Receipt Photo

These source-based checks are pending. Use separate eligible unreviewed receipts; deletion is not a way to reset reviewed evidence for another test.

1. As an actor with `sales:evidence:delete` and effective Sale-location access, open a posted, exactly `UNVERIFIED` receipt with a saved photo, no review/Branch Finding history, and no pending Sale correction. Open `Delete receipt photo`, cancel first, and confirm the saved image remains.
2. Retry and confirm. Verify `DELETE /api/accounting/receipts/<sale-id>/photo` sends `{ version: receiptPhotoVersion }` captured with the Sale ID when confirmation opened, not a newer token from a background refetch. Success returns `{ data: { deleted: true } }`; reload confirms the attachment is gone.
3. Confirm deletion changes no Sale amounts/status, inventory, or review outcome and preserves prior notifications/review history. Confirm a persisted warning reaches the actor and eligible branch/Accounting/owner recipients without duplicate notifications for a user in multiple groups. Missing evidence again blocks both verification and mismatch reporting and becomes eligible for evidence reminders.
4. Use an upload-only actor without `sales:evidence:delete`, then an actor outside the Sale's location scope. Confirm deletion is hidden or rejected with `403`; uploader identity is not the authorization rule.
5. Omit or malform the version and confirm `400 INVALID_INPUT`. Replace/delete the photo in another session after opening confirmation; confirm the stale request returns `409 STALE_EVIDENCE` and cannot delete replacement evidence. Repeating a successful deletion with the old token also conflicts.
6. Attempt deletion on verified, mismatched, resolved, voided, or Branch-Finding-reopened evidence, and while a Sale correction is pending. Confirm `409` and no data loss. An `UNVERIFIED` label alone is insufficient: `reviewedAt`, `verifiedAt`, `resolvedAt`, `branchResponse`, and `branchRespondedAt` must all be null.
7. Race deletion against review, upload/replacement, and correction creation. Confirm stale or prohibited writes conflict rather than removing reviewed/replacement evidence. A failed transaction must not detach the current photo.
8. Confirm the displayed photo URL carries its `receiptPhotoVersion`. An authorized GET with an old version returns `409 STALE_EVIDENCE` if replaced, or `404` when missing, rather than silently displaying another image; image responses remain private/no-store.

### Verification

1. Sign in as an actor with both `sales:verify` and `sales:evidence:view`.
2. Compare the encoded Sale and uploaded image side by side.
3. Verify a matching receipt.
4. Confirm the review receives a verification timestamp.
5. Confirm the Sale becomes eligible for the Sales Report and Customer Warranty selection.

### Mismatch and Evidence Replacement

1. Report a receipt mismatch.
2. Attempt a generic receipt-photo replacement.
3. Confirm the generic replacement is rejected while the mismatch is open.
4. Use the dedicated Branch Finding replacement flow.
5. Confirm that flow requires `sales:mismatch:respond`, `sales:evidence:upload`, and location access.
6. Try to race a generic upload while Accounting reports a mismatch.
7. Confirm the conditional write rejects the upload unless its review state is still exactly `UNVERIFIED`.

### Permission Check

1. Use an account with `sales:verify` but without `sales:evidence:view`.
2. Confirm verification actions are hidden or rejected.

## 4. Customer Order Salesperson Attribution

Open `/customer-orders/create`.

### Create and Reassign

1. Create an Order with an active Salesperson within your authorized personnel locations, including another branch when authorized.
2. Open the Order before release.
3. Change the Salesperson.
4. Confirm the Order displays the new attribution.
5. Select the same Salesperson again.
6. Confirm a no-op selection does not create another reassignment event.

### Release

1. Release the Order with the required final receipt and payment.
2. Confirm eligibility is revalidated during release.
3. Confirm the resulting Sale copies the current Order Salesperson snapshot.
4. Confirm the authenticated releasing user remains a separate actor.

### Expected Audit

- An actual reassignment creates an immutable event containing previous and new Personnel identity/branch snapshots, actor, and occurrence time.
- Completed and cancelled Orders cannot change Salesperson.

## 5. Backjob

Open `/inventory/returns-warranty/new`.

### Create and Schedule

1. Search Posted sale by receipt number or customer name. Options and the selected value should show only receipt number and customer name, not the internal Sale reference. Select one or more affected purchased Sale lines from that receipt, enter a concern, and click Create draft. Confirm one successful `POST /api/backjobs` (201) with `saleLineIds` and navigation to one new draft containing all selected items.
2. Open the Backjob detail.
3. Assign an active `INSTALLER` or `BOTH` Personnel within your authorized personnel locations. All-location actors can select from every active branch.
4. Enter a future schedule.
5. Schedule the case.
6. Confirm status changes from `DRAFT` to `SCHEDULED`.

### Draft Form Regression Checks

1. A sale with one line selects that item automatically. A sale with multiple lines requires explicit checkbox selection of one or more affected items.
2. Change or clear the selected sale. Confirm an item from the previous sale cannot remain selected or be submitted for the new sale.
3. Search by a partial receipt number and by customer name; confirm unmatched text shows the empty-result message. Clear the search to restore options. The lookup currently contains at most the latest 250 authorized posted sales with a customer; search is within that loaded list.
4. Try submitting without a sale, affected item, or concern. Confirm no draft is created.
5. Simulate an options API failure. Confirm an error and Retry options appear and creation is disabled until options load successfully.
6. Simulate a failed POST or network failure. Confirm a visible error and that Create draft becomes available again rather than remaining on Creating. If a response was lost after server commit, check the list before retrying to avoid creating a second case.
7. As owner, test the legacy form with branch, customer, legacy reference, product description, reason, and concern. Confirm Create draft submits this form too.
8. Check the selector with keyboard navigation, mobile width, and both light and dark themes. Reload a created draft to confirm persistence.
9. Submit two or more selected items from one Sale and confirm one case/reference, not a separate case per item. Branch/customer come from that Sale; all items share concern, schedule, coverage, work, and planned repair parts.
10. Through an authorized API request, try an empty array, duplicate IDs, more than 100 IDs, IDs from different Sales (even for the same customer), or IDs outside the selected posted Sale. Confirm rejection without partial creation. The normal request uses `saleLineIds` with 1-100 unique IDs; the old singular `saleLineId` input is not a supported alternative.

The authored multi-item revision persists one Backjob with all selected original Sale lines from the same receipt/customer. List, detail, and print display every selected item after reload; searching a later item's code/name must find the case. Original purchased items remain separate from planned repair parts, and there is still no affected-unit quantity selector. Existing one-line/legacy cases are retained by additive backfill. Migration `20260908200000_backjob_items_and_delete` and Prisma generation have NOT been executed, and these checks remain pending.

### Draft Deletion and Delegation

1. Confirm `backjobs:delete` appears in Role Permissions and can be delegated by an authorized grantor. It implies only `backjobs:view`, not update, other actions, or all-location access. The additive migration grants it to explicit owner roles, not automatically to non-owner built-ins.
2. On a fresh unused `DRAFT`, use an owner or delegated actor with effective case-location access. Open `Delete draft`, cancel first, and confirm the case remains. Retry with the current positive-integer `{ version }`; confirm `DELETE /api/backjobs/<backjob-id>` returns `200 { data: { id } }` and the case is absent after reload.
3. Confirm successful deletion removes draft items, unused planned parts, draft events, and old case-linked notifications together. Active owners receive a `Backjob deleted` warning containing reference/branch with no dead Open link. No separate surviving deletion audit event is claimed, and no Sale, inventory balance, or movement is deleted or reversed.
4. Without `backjobs:delete`, or outside the case location scope, confirm `403`. Confirm invalid bodies return `400`, missing cases `404`, and stale versions or concurrent changes `409`; a rejected deletion leaves the case intact and shows the error.
5. Confirm only `DRAFT` is eligible. `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, and `REJECTED` cases cannot be deleted. There is no `PENDING` Backjob workflow state: `PENDING` coverage is undecided coverage, not draft eligibility and not a step between creation and scheduling.
6. With appropriately prepared guarded fixtures, confirm stock evidence blocks deletion: any issued/returned quantity, any recorded usage including zero, part-linked movements, or a movement carrying the case reference even without a part link. Unused planned parts alone may be deleted with an otherwise eligible draft.
7. Confirm charge Sale links, nonzero charges, `CHARGEABLE` coverage, and historical financial coverage events block deletion. Changing coverage back to Covered does not erase the restriction.
8. Confirm attachments, schedule history/Installer snapshots, work/completion/acknowledgement/closure evidence, unknown or non-draft event history, and restrictive related records block deletion. Only draft `CREATED`, `PARTS_PLANNED`, and explicitly covered/zero/no-charge `COVERAGE_SET` history may pass the history guard; do not strip evidence to force eligibility.

These checks remain pending migration/client generation and verification. With explicit user approval, local maintenance renamed a historical `BJ-` reference to the `BackJob-` prefix, preserving status, charges, and history without deleting records. Do not use draft deletion to purge historical cases. The additive migration preserves existing cases and does not delete or rename them. See `docs/BACKJOB-ITEMS-AND-DELETE.md` for restrictions and dependencies.

### Start and Complete

1. Start work and confirm status changes to `IN_PROGRESS`.
2. Record coverage and work details.
3. Complete the Backjob.
4. Confirm status changes to `COMPLETED`.
5. Confirm the Installer snapshot remains visible in history.

### Saved Customer Charge and Print

1. On an open case, save Chargeable coverage with an eligible posted same-customer Sale and an amount. Confirm the Case card's Customer charge displays the saved amount in PHP, including after reload.
2. Edit the amount without saving. Confirm Customer charge continues to show the persisted amount, not the unsaved Coverage form value.
3. Save Covered coverage and confirm Customer charge reads `No charge (covered)`. A case whose coverage is undecided shows `Not yet decided`.
4. With `backjobs:print`, click Print and confirm `/inventory/returns-warranty/<case-id>/print` opens in a new tab without replacing the detail page. Confirm print views omit Returns & Warranty navigation and printing does not create an event or notification.
5. Without `backjobs:print`, confirm Print is hidden and direct access to the print route is rejected.

### Parts Flow

1. Add a planned part.
2. Issue a quantity physically used by the Backjob.
3. Confirm branch `onHand` and available stock decrease.
4. Confirm a `BACKJOB_PART_ISSUE` movement is created.
5. Return an unused quantity.
6. Confirm `onHand` is restored.
7. Confirm a `BACKJOB_PART_RETURN` movement is created.
8. Confirm completion is blocked while issued quantities remain unreconciled.

### Installer Negative Checks

1. Deactivate the Installer or reassign them outside the acting user's authorized locations before scheduling.
2. Confirm scheduling is rejected.
3. Deactivate the Installer or reassign them outside the acting user's authorized locations after scheduling but before starting.
4. Confirm starting is rejected.
5. Restore eligibility, start the Backjob, then remove eligibility before completion.
6. Confirm completion is rejected.

The Personnel row is locked during scheduling, start, and completion so concurrent reassignment/deactivation cannot pass after validation.

### Admin Notifications

These checks are documented for a future authorized manual run; they were not executed for the notification change.

1. With an active Owner Admin account (`accessRole.isOwner = true`), create a normal draft and a legacy draft. Confirm each committed case creates exactly one `Backjob created` notification for that owner, including when the owner creates the case.
2. Follow scheduling, rescheduling with a reason, starting, coverage save, parts plan save, part issue, usage recording, unused-part return, and completion in their valid workflow order. Confirm one additional notification for each recorded action, including repeated legitimate saves or partial issues/returns with fresh versions. Use separate eligible cases for rejection and cancellation and confirm those notify too.
3. Confirm completion uses success styling, rejection/cancellation use warning styling, and the remaining steps are informational. Copy should contain only the case reference, branch code, and step, with no customer details, concern, or notes.
4. Open an alert from `/notifications`. Confirm it navigates directly to `/inventory/returns-warranty/<case-id>` and loads the correct authorized case. Reload the inbox and confirm alerts and read state persist; check live delivery with polling fallback. Popups should still open the inbox, not bypass it.
5. Confirm non-owner Accounting/Stock/Branch accounts, a custom role merely named Admin, and a non-owner role with `locations:all` plus Backjob/notification permissions receive no Backjob Admin alerts. Inactive owner users receive none. No eligible owner must not block a valid workflow action. Users must not read another user's notification or open an out-of-scope case.
6. Retry a successful versioned action with its original version, and attempt invalid status, invalid Installer, insufficient stock, unreconciled completion, and unauthorized actions. Confirm failures create no new event or notification. Confirm concurrent submissions of the same version produce only one committed event and one owner alert.
7. Confirm reads, printing, unsaved form edits, and old historical events do not produce alerts. Creation is not request-idempotent: after a lost POST response, check the list before retrying; a second committed case correctly has its own creation alert rather than being deduplicated against the first case.
8. If browser push is configured and permission granted, confirm it remains best-effort and does not mark the inbox alert read. No browser push availability is required for the persisted inbox notification.

## 6. Split Supplier Receiving

Open `/inventory/receive`.

### Mixed Receipt

Use this example:

| Quantity | Value |
| --- | ---: |
| Expected | 10 |
| Accepted | 6 |
| Quarantined | 2 |
| Missing | 2 |

1. Select an active Supplier.
2. Add an active product.
3. Enter the expected, accepted, quarantined, and missing quantities.
4. Confirm accepted + quarantined + missing equals expected.
5. Post the receipt.

### Expected Inventory Effect

| Inventory field | Expected change |
| --- | ---: |
| `onHand` | `+8` |
| `quarantined` | `+2` |
| `available` | `+6` |
| Missing inventory | No change |

### Expected Workflow Effect

- A draft Supplier Claim is created for the quarantined and missing exception quantities.
- The receipt and claim share the Supplier, location, product, and source reference.
- Only physically received quantities create `SUPPLIER_RECEIPT` movements.

### Missing-Only Check

1. Record expected quantity greater than zero.
2. Set accepted and quarantined to zero.
3. Set all expected quantity as missing.
4. Post the receipt.
5. Confirm `onHand` does not change.
6. Confirm `quarantined` does not change.
7. Confirm `unitCost` does not change.
8. Confirm no zero-quantity `SUPPLIER_RECEIPT` movement is created.

## 7. Customer Warranty

Open `/inventory/returns-warranty/warranties/create`.

The optional-photo checks below are pending, not executed. Migration `20260908180000_optional_warranty_intake_photo` is now authored but NOT applied, and Prisma Client has NOT been regenerated. Before testing no-photo creation, apply the reviewed migration through the approved process and regenerate Prisma as described in `docs/DATABASE.md`. The migration drops only the three intake-photo `NOT NULL` constraints; existing evidence and the unique photo-key index are preserved.

### Create

1. Search Purchased item by receipt number, customer name, or product code/name and select one verified posted Sale line with a customer. Confirm the primary option and selected label show receipt/customer, not an internal Sale reference; menu product context and the separate selected affected-product summary identify the item and purchased quantity. Confirm Case / intake location is read-only and automatically follows the original Sale branch.
2. Enter a positive claim quantity.
3. Enter the customer concern.
4. Leave the optional intake photo empty.
5. Create the case.
6. Confirm case status is `ASSESSMENT`.
7. Confirm creation alone does not change inventory.
8. Confirm detail shows `No intake photo attached` and an authorized evidence request returns 404.
9. Create another eligible claim with a photo. Before submission, use `Remove attachment`, confirm the preview and input clear, and select the same file again.
10. Confirm `Create warranty claim` submits by click and native form submission, reports server/network errors, and enables retry after failure without clearing the entered details.
11. As owner, select `Sale not recorded in this system (owner only)` and confirm manual customer/product, exception reason, warranty period, and coverage explanation are required. Check that the original reference is optional and detail explains the legacy exception.

### Purchased Item and Branch Checks

1. Use a receipt with multiple purchased lines. Confirm product context distinguishes its options, but each Warranty claim still covers one Sale line, unlike the multi-item Backjob flow.
2. Search using partial receipt/customer/product text, confirm `No matching purchased items` for unmatched text, and clear the search to restore options. Search is local to at most 250 recent authorized posted, Accounting-verified customer Sale lines, not all historical Sales.
3. Change to a line from another authorized Sale branch and confirm the read-only Case / intake location updates automatically. Clear the item and confirm its product/location context clears and creation is disabled. Multipart submission must use the selected Sale's `locationId`.
4. Confirm an inactive or unavailable original Sale location produces an explanatory error and blocks normal submission, rather than falling back to another branch. Through the API, submit a different authorized location from the Sale and confirm `409 INVALID_LOCATION`; an unauthorized location remains rejected server-side. The API requires and validates `locationId`, not silently rewrites it.
5. Switch to owner-only legacy creation and confirm manual location selection remains required. Switch back and confirm the selected system Sale, not the legacy location, determines the normal claim branch. Neither path confirms physical receipt on creation.
6. Check loading, empty options, error/Retry loading, keyboard search/clear, mobile width, and light/dark readability. Reload a successfully created case and confirm the selected item and original Sale branch persist. These selector/location checks are source-based and pending execution.

### Receive Into Quarantine

1. Open the Warranty detail.
2. Select `Confirm item received` only after the customer physically hands over the items.
3. The current detail button receives the full claim quantity; use an authorized API request with explicit quantity when checking partial receipts.
4. Confirm `onHand` and `quarantined` both increase.
5. Confirm a positive `WARRANTY_RECEIPT` movement is recorded.

### Repair Flow

1. Enter assessment notes.
2. Enter a future operational target.
3. Approve repair.
4. Mark the case ready.
5. Release the repaired item.
6. Confirm `onHand` and `quarantined` decrease together.
7. Confirm a negative `WARRANTY_RELEASE` movement is recorded.
8. Complete the case.

Expected lifecycle:

```text
ASSESSMENT
  -> APPROVED_REPAIR
  -> READY
  -> RELEASED
  -> COMPLETED
```

### Replacement Flow

1. Receive the returned original item into quarantine.
2. Enter a future target.
3. Approve replacement.
4. Use the original product as the default replacement.
5. Optionally move to waiting for stock.
6. Mark the case ready.
7. Release the replacement.
8. Confirm available replacement stock decreases.
9. Confirm the returned original remains quarantined until a separate disposition resolves it.
10. Complete the customer-facing Warranty.

Expected lifecycle:

```text
ASSESSMENT
  -> APPROVED_REPLACEMENT
  -> WAITING_STOCK (optional)
  -> READY
  -> RELEASED
  -> COMPLETED
```

### Equivalent Replacement

1. Sign in as a non-owner approver.
2. Try to choose another product as the replacement.
3. Confirm the request is rejected.
4. Sign in as Owner Admin.
5. Choose an equivalent product.
6. Leave the replacement reason empty and confirm rejection.
7. Add a reason and approve.
8. Confirm original and replacement identities are both preserved.

### Quantity Override

1. Create claims whose cumulative active quantity reaches the original sold quantity.
2. Try to create another claim as non-owner staff.
3. Confirm it is rejected.
4. Retry as Owner Admin without an override reason.
5. Confirm it is rejected.
6. Add an override reason.
7. Confirm the claim is created and the reason is preserved in the audit event.

### Missing Historical Warranty Basis

1. Select a Sale line without a warranty-duration snapshot.
2. Try to create a claim as non-owner staff.
3. Confirm it is rejected.
4. Retry as Owner Admin.
5. Enter a claim-specific duration and required reason.
6. Confirm later Product warranty edits do not alter this case's stored eligibility.

### Rejection or Cancellation After Intake

1. Receive two units into quarantine.
2. Try to reject or cancel immediately.
3. Confirm the action is blocked by unresolved quarantine.
4. Enter a return reason and return one unrepaired unit to the customer.
5. Confirm `onHand`, `quarantined`, and unresolved custody decrease by one.
6. Try to approve repair or replacement after the partial return.
7. Confirm approval is rejected because customer return has started.
8. Try to reject while one unit remains unresolved.
9. Confirm rejection remains blocked.
10. Return the final unit.
11. Reject or cancel the case.
12. Confirm all physical actions and status changes appear in the audit trail.

## 8. Supplier Claim

Open `/inventory/returns-warranty/supplier-claims`.

### Submit an Auto-Created Claim

1. Open the draft claim created by split receiving.
2. For damage or defect, upload at least one image.
3. Enter a future follow-up target.
4. Submit the claim.
5. Confirm status changes from `DRAFT` to `PENDING`.

### Evidence and Target Negative Checks

1. Use a new damage/defect draft with no uploaded photo. Do not delete saved evidence to prepare this check.
2. Confirm submission is rejected.
3. Enter no target or a past target.
4. Confirm submission is rejected.
5. Select an image, use `Remove attachment`, and confirm the input/preview clear without changing saved attachments. Reselect the same image and use `Upload attachment`; confirm success clears the selection and retains the new saved link.
6. Upload only a PDF to a separate damage/defect draft and confirm it still cannot be submitted without a photo.

### Return to Supplier

1. Select `Return to supplier` for open quarantined quantity.
2. Confirm `onHand` and `quarantined` decrease.
3. Confirm open quarantined quantity decreases.
4. Confirm a `SUPPLIER_CLAIM_RETURN` movement is recorded.

### Supplier Repair

1. Select `Send repair` for quarantined stock.
2. Confirm the quantity leaves `onHand` and quarantine.
3. Confirm it becomes outstanding external quantity.
4. Select `Receive repaired` when it physically returns.
5. Confirm `onHand` increases only on physical receipt.

### Supplier Replacement

1. Move the claim to waiting for replacement when applicable.
2. Select `Receive replacement` for outstanding external quantity.
3. Confirm replacement quantity enters `onHand` only when physically received.
4. Confirm outstanding external quantity decreases.

### Release Repaired Stock

1. Select `Release repaired` for repaired quarantined stock.
2. Confirm quarantine decreases without incorrectly deducting sellable on-hand stock.
3. Confirm the action is recorded in the claim audit and movement history.

### Write-Off

1. Use an account with `supplier-claims:approve-writeoff`.
2. Write off an open quarantined quantity.
3. Confirm `onHand` and `quarantined` decrease.
4. Confirm a `SUPPLIER_CLAIM_WRITEOFF` movement is recorded.

### Refund or Credit Memo

1. Use an Accounting-authorized account.
2. Select `Cash refund` or `Credit memo`.
3. Enter amount, currency, reference, and product quantities resolved.
4. Record the settlement.
5. Confirm open missing/external quantities decrease.
6. Confirm inventory does not change.
7. Confirm unit cost does not change.
8. Confirm no general-ledger or supplier-balance transaction is created.
9. Complete the claim after all quantities are resolved.

### Cancellation and Rejection

1. Try to cancel a draft claim with open quarantine.
2. Confirm cancellation is blocked.
3. Resolve all physical quarantine first.
4. Reject or complete the claim as appropriate.
5. Confirm missing-only draft cancellation clears its open missing quantity without inventory effects.

### Ownership and Source Validation

1. Attempt to create a claim for quarantine already allocated to another claim.
2. Confirm it is rejected.
3. Attempt to create a generic claim using quarantine owned by a Customer Warranty.
4. Confirm it is rejected.
5. Link a claim to an eligible replacement Warranty.
6. Confirm it can allocate only that Warranty's unassigned quarantine.
7. Attempt to claim a product absent from the source receipt.
8. Confirm it is rejected.
9. Attempt to exceed the receipt line's quarantined or missing quantity.
10. Confirm it is rejected.
11. Attempt to use accepted quantity as claim quantity.
12. Confirm it is rejected.

## 9. Focused Reports

Open `/reports`.

The Reports module must contain exactly:

1. Sales
2. Inventory Summary
3. Returns & Warranty

Inventory Movements and Low Stock are removed from Reports for now. Operational inventory history, movement records, and stock alerts remain in their own modules; retain the stock and movement checks in the Backjob, receiving, Customer Warranty, and Supplier Claim flows above. Accounting Queue and Open Customer Orders must remain in their operational modules.

These revised Reports checks are source-based and pending manual execution. See `docs/product/REPORTS-SPEC.md`; no Reports runtime or PDF rendering verification was performed for this update.

### Sales Report

1. Open Sales, the default report. Confirm From and To cover the first through last day of the current Asia/Manila month, not month-to-date (for example, `2026-09-01` through `2026-09-30` on September 8).
2. Confirm the labels are From / To, with `Based on verification date (Manila).` and `Inclusive; defaults to month-end.` helper text. No date presets should appear.
3. Edit verification dates, location/branch, Salesperson, Direct Sale versus Customer Order source, and payment method. Before Apply Filters, confirm the unapplied-changes message appears while results, totals, URL filters, and PDF parameters still use the previous applied values.
4. Click Apply Filters and confirm all pending values apply together to rows, totals, URL, and PDF parameters. Confirm only verified, non-voided Sales appear and Customer Orders appear only through their posted final Sale, not open Orders.
5. Confirm filtering uses verification timestamp, not posting timestamp. Both From and To include their full Manila calendar day; the following Manila midnight is excluded.
6. With automatic To, change From to another month and confirm To follows that month's last day, including February/leap-year and year-end cases. A link/API query omitting To defaults to the supplied/default From month's end.
7. Manually enter To, then change From or location. Confirm custom To is preserved; an explicit URL To is also custom. Clear To and Apply Filters to restore the selected From month's end.
8. Click Reset filters. Confirm only draft fields reset to the current full month and default selections until Apply Filters is clicked.
9. Confirm full-dataset totals for verified transactions, units, discounts, average sale, and grand total. Branch transaction/unit/amount subtotals must reconcile to the grand total, and branch percentages total approximately 100% when sales exist.

### Draft Filters and Options

1. Repeat pending-edit and Reset checks for Inventory Summary and Returns & Warranty: neither changes results, totals, URL, or export parameters before Apply Filters.
2. Change draft Sales location and confirm draft Salesperson clears and authorized options reload independently, without applying report rows. Change Inventory Product status and confirm draft category/brand clear and their options reload.
3. With invalid draft dates or a failed report-row request, confirm filter options remain independently usable. Check their separate loading/error states and Retry options action.
4. Switch report tabs while edits are pending. Confirm tab navigation immediately loads the selected report's clean defaults, without carrying incompatible draft filters across reports.

### Inventory Summary

1. Open Inventory Summary.
2. Confirm this is a current snapshot with no From/To fields. Branch options contain only active authorized `BRANCH` locations, never Stock Room/warehouses. With `locationId` omitted, JSON/options/PDF and the UI default to the first eligible branch ordered by name then ID, not All or a compatibility/home location. Explicit `locationId=all` selects all eligible branches; an explicit branch ID selects only that branch.
3. Confirm active and inactive products are included by default (`All statuses`). This does not make inactive products sellable.
4. Filter by branch, item code/name, category, brand, and Product status, then Apply Filters. There is no Stock status control: positive availability is mandatory, and the former `stockStatus` query parameter is rejected.
5. Confirm one grouped row per product, not per product/branch. Single-branch columns are Code, Product, Category, Brand, Available. Explicit All with multiple effective branches shows those product fields, one available column per branch, and Total available; preserve horizontal scrolling for the matrix.
6. For each branch, calculate `available = onHand - reserved - quarantined` and contribute `max(available, 0)`; missing balances contribute zero. Include a product only when its sum across selected branches is positive. A negative/missing balance must neither cancel another branch's positive stock nor borrow it. Warehouse and in-transit stock are excluded; on-hand, reserved, quarantine, reorder, shortage, suggested reorder, and cost/value are not report outputs.
7. Compare a product with positive stock at one branch and zero/negative/missing stock elsewhere. Confirm one All-branch row with zero cells elsewhere and the correct positive total. Products with no positive contribution in scope are omitted, not shown as out-of-stock rows.
8. Reconcile Products to grouped row count, Branches in scope to every effective branch even with no matching products, and Available units to the complete filtered sum. Confirm ordered `branchTotals` match the corresponding `availableByLocation` column sums and all branch totals reconcile to the overall available total.
9. Request a warehouse location explicitly through JSON, PDF, and options APIs and confirm `403`. A warehouse-only actor receives an empty branch snapshot, not access to other branches.
10. With more than 25 matching products, confirm 25 products per UI page and page reset on applied-filter changes. Summary cards and `FULL FILTERED TOTAL`, including each branch total, remain full-dataset totals on every page. JSON returns all grouped products with `id = productId` and no API pagination parameters; PDF exports all filtered products, not the visible page.
11. Confirm unset/default branch and explicit All remain distinct through Apply Filters, URL/reload, Reset, and export. Export from an unset/default result sends its resolved branch ID so it does not silently choose a different default branch. No eligible branches or no matching positive stock must show the appropriate empty snapshot and zero totals without widening scope.

### Returns & Warranty

1. Open Returns & Warranty.
2. Confirm From / To default to the full current Manila month, with case creation date helper text and inclusive month-end/date behavior as above. Filter by case creation date, location, case type, status, resolution, and entity search, then Apply Filters.
3. Confirm Backjobs, Customer Warranties, and Supplier Claims appear.
4. Confirm current unresolved quarantine is shown rather than historical intake.
5. Confirm a linked Warranty and Supplier Claim do not double-count the same physical quantity.
6. Confirm target dates and overdue indicators are correct.
7. Confirm original Sale/receipt or receiving references are shown.
8. Confirm Supplier Claim refund and credit amounts appear only as tracking amounts.
9. For a saved `CHARGEABLE` Backjob, reconcile row `backjobChargeAmount` to persisted `chargeableAmount` and the recorded Backjob-charge total to the full filtered case set. A stored zero remains a recorded amount; Covered/undecided Backjobs and other case types use null/Not applicable. Unsaved coverage edits must not affect the report.
10. Confirm recorded Backjob charges remain separate from supplier refunds/credits, collected payments, verified Sales revenue, and ledger totals. Cancelled/rejected cases contribute their recorded amounts when included by the current filters; this does not imply collectible debt. Sales totals and `% of grand total` calculations are unchanged.
11. Use a multi-item Backjob. Confirm one case row/count and one charge contribution, including in type/status/branch/resolution breakdowns, regardless of original-item count. The product summary lists every stored item code/name in position order, separated by semicolons, without duplicating the scalar first-item snapshot. Case-insensitive entity search must find a later item's code/name.
12. Confirm a Backjob with no item rows uses its historical scalar product snapshot, then legacy description/`Not recorded` as needed, rather than live catalog names. Backjob quantity is null/`Not recorded`, never item count, original sold units, or repair-part quantity. Warranty and Supplier Claim recorded quantities remain unchanged. Multi-item report reads require the pending Backjob migration and regenerated Prisma Client; legacy fallback does not make the old schema compatible.

### Strict Query Checks

1. Add an unsupported filter from another report type to the URL.
2. Confirm the API returns `400 INVALID_FILTERS`.
3. Add an unknown empty query parameter such as `bogus=`.
4. Confirm it is rejected.
5. Repeat a scalar query parameter.
6. Confirm it is rejected.
7. Use `format=csv` or another unsupported value.
8. Confirm it returns `400 INVALID_FORMAT`.
9. Request `type=inventory-movements` and `type=low-stock` through JSON, PDF, and `/api/reports/options`. Confirm `400 INVALID_FILTERS`; removed movement/low-stock-specific parameters must also be rejected rather than ignored.
10. Open old `/reports` links for those retired types with their old filters. Confirm clean default Sales filters load instead. Operational `/api/inventory/movements` remains available under its existing authorization, not the Reports API.
11. Confirm JSON/options require `reports:view`, PDF additionally requires `reports:export`, and unauthorized/inactive location requests are rejected server-side.
12. Send Inventory `stockStatus` (including an empty value), `page`, or `pageSize` through JSON/PDF/options queries and confirm `400 INVALID_FILTERS`, not silently ignored filters. Confirm empty or repeated Inventory `locationId` is invalid; omission and the explicit value `all` are distinct valid scopes.

### PDF Export

1. For each of the three retained reports, apply a distinctive set of filters, then make an unsaved draft edit and export. Confirm the PDF uses the applied filters, not the pending edit.
2. Confirm the header contains `CHEZCAR AUTO CARE` and the correct report title, with no literal logo placeholder or embedded logo.
3. Confirm generated-by display identity, generated-at Manila time, effective location scope, all applied filters, and inclusive date range/date basis are present. Inventory instead describes the current branch-only available-stock snapshot.
4. With no intervening data changes, confirm summaries and all authorized detail rows match the UI's complete filtered dataset. Export reruns a live query; PDFs are not saved/frozen report snapshots, so intervening changes may legitimately alter results.
5. For Sales, confirm a separate Branch subtotals table includes branch transactions, units, sales amount, and share, ending in an emphasized `OVERALL TOTAL` row that reconciles to the overview/UI. Empty results still show a zero overall total.
6. For Inventory, confirm the single-branch product/available table covers all filtered products. Multi-branch comparison exports product totals followed by separate fixed-width sections per branch, including every filtered product's zero cells and each full branch total. Branch names repeat on continued headers; additional branches add sections rather than overflowing or shrinking columns. Product count, branches in scope, and full available-unit totals reconcile to the UI/JSON; no warehouse stock or hidden quantity/cost columns appear.
7. For Returns & Warranty, confirm case summaries and type/status/branch/resolution breakdowns match the UI. Recorded Backjob charges remain separate from supplier refund/credit tracking, collected payments, verified Sales revenue, and ledger totals. Multi-item Backjobs retain all product snapshots but only one case row/count and one charge, with quantity `Not recorded`.
8. Confirm A4 landscape pages, readable 9-point detail text, proportional column widths, aligned numeric amounts, alternating row shading, repeated section/table headers, and page numbers.
9. Confirm Sales and Returns detail fields remain represented in grouped multiline cells rather than tiny individual columns. Long names, references, and notes wrap without ellipses or truncation.
10. Confirm ordinary rows stay together when they fit a fresh page and oversized rows continue across pages without overlapping headers or footers.
11. Confirm JSON and PDF responses use private no-store caching.

## 10. Authorization Checks

For each module, test an account with view permission but without mutation permission.

1. Confirm the page may be visible when the view capability exists.
2. Confirm unauthorized buttons are hidden.
3. Call the mutation endpoint directly or attempt the action through the UI.
4. Confirm the server returns `403`.
5. Test a user assigned to another branch.
6. Confirm list filters, detail reads, options, actions, and reports cannot access the unauthorized branch.
7. Confirm `locations:all` widens location reach only and does not grant module access.

## 11. Retry and Concurrency Checks

These checks are optional but important for high-risk workflows.

1. Submit the same Warranty creation twice using the same browser request/retry state.
2. Confirm only one Warranty remains, with one intake image when supplied and none when omitted.
3. Reuse the same idempotency key with changed fields or image content.
4. Confirm the server returns an idempotency conflict.
5. Retry the same Supplier Claim action or settlement.
6. Confirm it returns the stored outcome without applying inventory twice.
7. Open the same case in two browser windows.
8. Complete one action in the first window.
9. Submit a stale action from the second window.
10. Confirm a version conflict requires reload.
11. Try concurrently allocating the same quarantine to two claims.
12. Confirm only one allocation succeeds.

## 12. Final Regression Checks

Check Returns & Warranty navigation on each list, create, and detail screen: Backjobs, Customer Warranty, and Supplier Claims tabs appear directly below the page title/subtitle and above action buttons/content, not above the title. All permitted sibling module links remain visible, the selected module is visibly highlighted (including on create/detail routes), and print views omit navigation. Confirm tabs wrap cleanly on mobile and remain readable in light/dark themes.

1. Confirm `/api/health` returns `{"status":"ok"}`.
2. Confirm light and dark themes remain readable.
3. Confirm key pages remain usable on mobile width.
4. Confirm table containers scroll horizontally without breaking the page.
5. Confirm empty, loading, error, and unauthorized states do not expose protected data.
6. Confirm a page reload preserves persisted records and does not duplicate actions.
7. Confirm receipt verification remains manual and has no OCR output.

## Known Verification Caveat

The earlier production build and healthy application/database endpoint are historical results, not verification of this newly implemented source. No tests, build, lint, typecheck, browser/PDF checks, migrations, Prisma generation, or server restart were performed for this documentation update. Earlier migration application stopped after Prisma requested an additional migration name, so full schema parity remains unconfirmed. The later `20260908180000_optional_warranty_intake_photo` and additive `20260908200000_backjob_items_and_delete` migrations are authored but NOT applied, and Prisma Client has NOT been regenerated; no-photo Warranty creation and Backjob items/deletion, including multi-item Returns report reads, remain pending those prerequisites and verification. The revised Warranty selector/location, receipt removal/deletion, Reports, Direct Sales, navigation, and Backjob checks above are pending, not recorded passes. Separate user-approved local maintenance renamed the sole completed `BJ-` case to the `BackJob-` prefix without deleting records or changing its charges/work history; that operation is not a test result.
