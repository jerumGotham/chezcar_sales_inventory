<!-- generated-by: gsd-doc-writer -->
# API

## Current status

The application exposes Better Auth handlers, authenticated reads, capability-delegated User, Role, and Branch Maintenance, durable inventory/sales workflows, notifications, and first-login credential setup. These APIs use PostgreSQL through Prisma.

All endpoints use same-origin cookie sessions. Public email/password sign-up is disabled.

## Authentication

Better Auth is mounted at `/api/auth/[...all]` using the public `auth` instance from `lib/server/auth.ts`. That instance has **no Admin plugin**: it provides sign-in, sign-out, and session endpoints only, and public sign-up is refused (`emailAndPassword.disableSignUp`) before any database mutation. A separate server-only Better Auth instance exists in `lib/server/internal-user-auth.ts`; it is deliberately **unmounted** — it exposes only the guarded `createUser`/`setUserPassword` Admin-plugin primitives to trusted server services and can never be reached over HTTP. Regression tests prove that public sign-up and every generic Better Auth admin operation remain unroutable through the public catch-all (`tests/integration/auth-admin-surface.test.ts`).

Protected endpoints reload the active User, `RoleDefinition.isOwner`, permissions, and active `UserLocation` assignments. Owner receives the complete catalog. `locations:all` or owner grants every active operational location; otherwise at least one assignment is required and resources are filtered to those IDs. `User.role`, `User.locationId`, and `RoleDefinition.scope` are compatibility storage only. Endpoints return:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required"
  }
}
```

- `401` for a missing session or inactive/missing user.
- `403` for an authenticated user whose persisted role/location assignment does not hold the required capability.
- `400` for invalid query parameters.
- `500` with a generic message for unexpected failures.

## Capability matrix

Authorization uses the compile-time catalog in `lib/contracts/roles.ts`, evaluated against the reloaded User, RoleDefinition, and UserLocation assignments. Permissions are action-specific. Each module has a view grant and independent create/update/delete or workflow grants. An action grant implies only the views needed to perform it; a view grant never authorizes a mutation, and one mutation grant never authorizes a sibling action. For example, `products:create` makes Products visible and permits `POST /api/products`, but it does not permit `PATCH` or `DELETE`.

| Seeded role | Main action grants |
| --- | --- |
| Owner Admin | Full current capability catalog and all-location access |
| Stock Staff | Product and SR inventory views, supplier receiving, transfer create/edit/delete/finalize/dispatch/investigate; no final transfer resolution |
| Branch Staff | Customer CRUD, customer-order create/reserve/payment/release/unpaid cancel, direct sales, own-branch correction requests, mismatch response/evidence, assigned-branch transfer receipt/discrepancy |
| Accounting Staff | Business-wide sales/receipt views, review, confirm-correct resolution, evidence, and report export; no stock-changing void-and-replace |

The complete list and Role Maintenance labels are generated from `CAPABILITY_CATALOG`. All action permissions, including administration, are independently assignable. `locations:all` grants location reach only. The owner role remains immutable and nonassignable. Restricted users with no active operational assignment fail closed.

## Endpoints

| Method | Path | Data source | Authorization |
| --- | --- | --- | --- |
| `GET`, `POST` | `/api/auth/[...all]` | Better Auth + PostgreSQL | Endpoint-specific; public sign-up disabled; generic admin operations unroutable |
| `GET` | `/api/health` | PostgreSQL readiness query | Public, data-free `200`/`503`; used by the container and manual readiness checks |
| `GET` | `/api/dashboard?salesPeriod=today&salesBranchId=<branchId>` | Prisma sales/orders/inventory/accounting plus persisted notifications | `dashboard:view`; sales filters are Owner Admin-only |
| `GET`, `PATCH` | `/api/notifications` | Prisma Notification inbox | `notifications:view` / `notifications:mark-read` |
| `GET` | `/api/notifications/stream` | Prisma Notification catch-up + PostgreSQL `LISTEN/NOTIFY` wake-ups | `notifications:view`; authenticated server-sent events |
| `GET` | `/api/notifications/push-public-key` | Environment VAPID public key | `notifications:push` |
| `POST`, `DELETE` | `/api/notifications/push-subscription` | Prisma PushSubscription | `notifications:push`; current user only |
| `POST` | `/api/notifications/:notificationId/read` | Prisma Notification read timestamp | `notifications:mark-read` |
| `POST` | `/api/offline/activations` | Prisma OfflineDeviceActivation | `offline-sales:activate-device` plus target-location access |
| `GET` | `/api/offline/snapshot?deviceId=<id>` | Prisma InventoryBalance/Product | `offline-sales:snapshot`; assigned Branch scope only |
| `POST` | `/api/offline/sync` | Prisma OfflineSyncOperation/OfflineSaleSubmission/Sale | `offline-sales:sync`; assigned Branch scope only |
| `GET`, `POST` | `/api/customers` | Prisma Customer | `customers:view` / `customers:create` |
| `GET`, `PATCH`, `DELETE` | `/api/customers/:id` | Prisma Customer, sales, and customer orders | `customers:view` / `customers:update` / `customers:deactivate` |
| `GET` | `/api/customer-orders/options?locationId=<branchId>&includeUnavailable=<boolean>` | Accessible branches, active customers, and selected-branch products | `customer-orders:create` or `sales:post`; target-location access applies when `locationId` is present |
| `GET`, `POST` | `/api/customer-orders` | Prisma CustomerOrder/Customer/InventoryBalance | `customer-orders:view` / `customer-orders:create` |
| `GET` | `/api/customer-orders/:orderId` | Single persisted customer order with lines and release/payment summary | `customer-orders:view`; Branch Staff restricted to assigned branch |
| `POST` | `/api/customer-orders/:orderId/:action` | Prisma CustomerOrder/Sale/InventoryMovement | Exact `customer-orders:reserve`, `:record-payment`, `:release`, or `:cancel`; paid cancellation also requires `:cancel-paid` |
| `GET`, `POST` | `/api/sales` | Prisma Sale/SaleLine/InventoryMovement | `sales:view` / `sales:post` plus effective location access |
| `GET` | `/api/sales?source=direct` | Prisma Sale/SaleLine with uncapped Sale aggregates | `sales:view` plus effective location access; posted direct sales only (`orderId IS NULL`), excluding voided sales and Customer Order releases |
| `POST`, `PATCH` | `/api/sales/:saleId/correction-request` | Prisma SaleCorrectionRequest/Sale/InventoryMovement/Notification | `sales:correction:request` submits an assigned-branch direct-sale request without changing stock; `sales:void-replace` keeps the sale or atomically voids it and reverses its original deduction |
| `GET` | `/api/accounting/receipts?page=1&pageSize=10&reviewStatus=all&saleStatus=all` | Prisma Sale/SaleLine/SaleAccountingReview/Location | `sales:verify:view`; server-side filters, pagination, and missing-evidence summary |
| `POST` | `/api/accounting/receipts/:saleId/review` | Prisma SaleAccountingReview/Notification | Both `sales:verify` and `sales:evidence:view`; uploaded receipt evidence is required before either verification or mismatch reporting |
| `POST` | `/api/accounting/receipts/:saleId/resolve` | Prisma Sale/SaleLine/SaleAccountingReview/InventoryMovement/Notification | `sales:resolve` for confirm-correct; `sales:void-replace` for stock-changing replacement |
| `POST`, `GET`, `DELETE` | `/api/accounting/receipts/:saleId/photo` | Private receipt-evidence storage + Prisma review/notifications | `sales:evidence:upload` / `sales:evidence:view` / `sales:evidence:delete`; effective sale-location scope; DELETE requires the displayed photo version and an unreviewed posted sale without a Branch Finding or pending correction |
| `POST` | `/api/accounting/receipts/:saleId/evidence-pending` | Prisma SaleAccountingReview/Notification | `sales:evidence:upload`; records and notifies a pending upload once without changing the sale |
| `GET` | `/api/reports` | Prisma sales/branch-availability/returns datasets | `reports:view`; every dataset is restricted to effective locations; `format=pdf` requires `reports:export` and uses the same authorized query |
| `GET` | `/api/reports/options` | Authorized report locations and dependent filter options only | `reports:view`; same report-specific query validation and effective scope, without fetching report rows or totals |
| `GET`, `POST` | `/api/products` | Prisma Product/InventoryBalance | `products:view` / `products:create` |
| `PATCH`, `DELETE` | `/api/products/:productId` | Prisma Product | `products:update` / `products:delete` |
| `GET`, `POST`, `DELETE` | `/api/products/:productId/image` | Prisma Product + private persistent image storage | `products:view` / `products:image:update` |
| `GET` | `/api/inventory` | Prisma Product/InventoryBalance/Location | `inventory:view` |
| `GET` | `/api/inventory/availability` | Prisma Product/InventoryBalance/Location | `inventory-availability:view`; active scoped locations only |
| `PATCH` | `/api/inventory/:balanceId` | Prisma Product/InventoryBalance | `inventory:cost:update`; non-owner actors remain location-scoped |
| `POST` | `/api/inventory/:balanceId/adjustment` | Prisma InventoryBalance/InventoryMovement/Notification | `inventory:adjust`; non-owner actors remain location-scoped |
| `GET` | `/api/inventory/movements` | Prisma InventoryMovement | `inventory-movements:view` |
| `GET`, `POST` | `/api/stock-transfers?page=1&pageSize=10` | Prisma transfer ledger | `stock-transfers:view` / `stock-transfers:create`; server-paginated list |
| `POST` | `/api/stock-transfers/:id/:action` | Prisma transfer/inventory transaction | Matching `stock-transfers:update/delete/finalize/dispatch/cancel/receive/report-discrepancy/investigate/resolve` plus scope/state policy |
| `POST` | `/api/accounting/receipts/:saleId/branch-response` | Prisma Accounting review | Assigned Branch Staff for an unresolved own-branch mismatch |
| `GET`, `POST` | `/api/stock-receipts` | Prisma supplier-receipt/inventory transaction | `stock-receipts:view` / `inventory-receiving:create`; OWNER/STOCK_ROOM scope, destination fixed to `SR` |
| `GET`, `POST` | `/api/users` | Prisma User + UserLocation | `users:view` / `users:create`; effective locations apply |
| `GET`, `POST` | `/api/roles` | Prisma RoleDefinition | `roles:view` / `roles:create` |
| `GET`, `PATCH` | `/api/roles/:roleId` | Prisma RoleDefinition | `roles:view` / `roles:update`; owner immutable |
| `GET`, `POST` | `/api/branches` | Prisma Location (`BRANCH`) | `branches:view` / `branches:create`; creation also requires all-location reach |
| `PATCH` | `/api/branches/:branchId` | Prisma Location (`BRANCH`) | `branches:update`; effective locations apply; code immutable |
| `GET`, `POST` | `/api/suppliers` | Prisma Supplier | `suppliers:view` / `suppliers:create`; global master data |
| `PATCH` | `/api/suppliers/:supplierId` | Prisma Supplier | `suppliers:update` |
| `POST` | `/api/suppliers/:supplierId/status` | Prisma Supplier | `suppliers:deactivate`; explicit `ACTIVE` or `INACTIVE` |
| `GET`, `POST` | `/api/personnel` | Prisma Personnel/Location | `personnel:view` / `personnel:create`; effective branch locations apply |
| `PATCH` | `/api/personnel/:personnelId` | Prisma Personnel/Location | `personnel:update`; current and destination branch scope apply |
| `POST` | `/api/personnel/:personnelId/status` | Prisma Personnel | `personnel:deactivate`; explicit `ACTIVE` or `INACTIVE` |
| `GET`, `POST` | `/api/backjobs` | Prisma Backjob aggregate | `backjobs:view` / `backjobs:create`; effective location scope |
| `GET` | `/api/backjobs/:backjobId` | Prisma Backjob detail/items/events/parts | `backjobs:view`; effective location scope |
| `DELETE` | `/api/backjobs/:backjobId` | Locked draft aggregate deletion | `backjobs:delete`; effective location scope; `{ version }`; rejects stock, financial, attachment, schedule, or work evidence |
| `POST` | `/api/backjobs/:backjobId/:action` | Prisma Backjob/action/event/inventory transaction | Exact schedule/update/parts/complete capability for the action; effective location and state/version rules |
| `GET`, `POST` | `/api/customer-warranties` | Prisma CustomerWarranty aggregate + private intake evidence | `customer-warranties:view` / `customer-warranties:create`; effective location scope |
| `GET` | `/api/customer-warranties/:warrantyId` | Prisma CustomerWarranty detail/events/actions | `customer-warranties:view`; effective location scope |
| `POST` | `/api/customer-warranties/:warrantyId/:action` | Prisma CustomerWarranty/action/event/inventory transaction | Exact receive/approve/release/complete capability for the action; effective location and state/version rules |
| `GET`, `POST` | `/api/supplier-claims` | Prisma SupplierClaim aggregate | `supplier-claims:view` / `supplier-claims:create`; effective location scope |
| `GET` | `/api/supplier-claims/:claimId` | Prisma SupplierClaim detail/evidence/actions/settlements | `supplier-claims:view`; effective location scope |
| `POST` | `/api/supplier-claims/:claimId/:action` | Prisma SupplierClaim/action/inventory transaction | Exact manage/return/repair/receive/write-off/close capability for the action; effective location and state/version rules |
| `POST` | `/api/supplier-claims/:claimId/settlements` | Prisma SupplierClaimSettlement/Action/Line | `supplier-claims:record-monetary-resolution`; explicit resolved missing quantities, no inventory or GL posting |
| `PATCH` | `/api/users/:userId` | Prisma User + UserLocation | `users:update`; effective locations apply |
| `POST` | `/api/users/:userId/status` | Prisma User | `users:set-status`; effective locations apply |
| `POST` | `/api/users/:userId/password` | Better Auth internal + Prisma User | `users:reset-password`; effective locations apply |
| `GET`, `POST` | `/api/credential-setup` | Better Auth + Prisma User | Any authenticated active role |

## Customer orders, sales, and Accounting

`GET /api/sales?source=direct` returns `{ data, summary }`: `data` contains the latest 200 posted direct sales in the actor's effective locations; `summary` contains uncapped all-time `totalSales`, `totalAmount` (after discounts), `totalDiscounts`, and `totalAmountPaid` for that same scope. Customer Order releases (`orderId` present) and voided sales are excluded from both. The list and aggregates share a repeatable-read snapshot. These are recorded sale/payment amounts, not a returns-adjusted net revenue calculation. Empty scopes return an empty list and zero metrics. Plain `GET /api/sales` retains its existing `{ data }` response and includes posted Customer Order releases.

The Customer Orders area presents Direct Sales first and defaults to it only with `sales:view`; otherwise it selects Customer Orders with `customer-orders:view`, or renders no data tab without either capability. Explicit `?view=orders` and `?view=sales` links select the permitted tab and survive reload/back navigation. Order creation and order-specific back links target `?view=orders`. Direct Sales summary cards use the uncapped server metrics; search and client pagination cover only the recent 200-row list. Loading/error summary states do not display fabricated zero totals.

New Direct Sales and Customer Orders require `salespersonId`. The selected Personnel must be active, typed `SALESPERSON` or `BOTH`, with an active home branch. The shared options endpoint and offline snapshots return eligible Salespersons across all active branches for `locations:all` actors (and owners), or across the scoped actor's authorized personnel locations. Personnel need not belong to the transaction branch. The selected transaction branch remains independently authorized; this workflow lookup does not grant Personnel Maintenance access. Posting, offline sync, order reassignment, and release revalidate the current actor's personnel scope. Response shapes are unchanged. Transactions store immutable Salesperson name and home-branch snapshots separately from transaction location and authenticated creator/poster identities.

`PATCH /api/customer-orders/:orderId` changes only the Salesperson on a non-completed/non-cancelled order for an actor with `customer-orders:create` or `customer-orders:release`. A changed assignment appends an immutable event containing complete previous/new Personnel name and branch snapshots, actor, and occurrence time; selecting the current Salesperson is a no-op. Release revalidates current eligibility and copies the order's stored snapshot into the posted Sale. Legacy orders without attribution must select a valid Salesperson before release. Void-and-replace preserves the original Sale attribution snapshot.

`POST /api/customer-orders` creates or reuses a customer, snapshots product price and required Salesperson attribution, validates active products, and creates one order in a serializable transaction. Branch Staff may create only for their persisted branch; Admin must select an active branch. The options endpoint returns accessible branches, eligible Salespersons, active customers, and only products with positive available stock (`onHand - reserved - quarantined`) by default. POS uses this same workflow-authorized response without requiring maintenance capabilities. `includeUnavailable=true` also returns active products without available branch stock for waiting-stock creation. Reservation orders increment `reserved` without decrementing `onHand`; waiting-stock orders do not reserve stock.

`POST /api/customer-orders/:orderId/reserve` transitions only a `WAITING_STOCK` order to `RESERVED`. Admin may reserve any branch order and Branch Staff only their assigned branch. The serializable transaction verifies `onHand - reserved - quarantined`, increments every reserved quantity, and rolls back the whole operation if any line is unavailable.

`POST /api/customer-orders/:orderId/release` requires a final manual receipt number and exact remaining balance payment. Release decrements `onHand`, decrements `reserved`, creates a posted `Sale`, creates `CUSTOMER_ORDER_RELEASE` inventory movements, registers the receipt globally, creates an unverified Accounting review row, and marks the order completed in one transaction.

`POST /api/customer-orders/:orderId/cancel` releases reserved stock. Branch Staff may cancel own-branch no-DP orders. DP cancellation is Admin-only and requires a note.

`POST /api/customer-orders/:orderId/payment` accepts `{ amount, reference? }` for an active order. Branch Staff are limited to their assigned branch; Admin may record any branch payment. The positive amount cannot exceed the remaining balance. A supplied reference must be unique within the branch receipt ledger. The transaction atomically adds to `downpaymentAmount`, subtracts from `remainingBalance`, and retains the first supplied payment reference as the order's downpayment receipt. A no-DP reservation becomes a DP reservation after its first payment; later payments accumulate without releasing the order.

`POST /api/sales` posts direct branch sales with branch-scoped receipt identity, an optional `discountAmount` not exceeding the subtotal, deducts available branch stock immediately, creates `DIRECT_SALE` inventory movements, and creates an unverified Accounting review row. Branch Staff use their persisted branch; Admin must supply an active `locationId`. The POS shows the branch, customer, receipt, payment, lines, totals, evidence filename, and irreversible-posting warning in a confirmation dialog before sending the request. `GET /api/accounting/receipts` returns the full all-status queue within the actor's effective locations; Accounting/Admin see all locations and Branch Staff remain restricted to assigned branches. It accepts `page`, `pageSize` (5-50), `search` (receipt/booklet/reference/customer/branch), `reviewStatus`, `saleStatus`, `locationId`, `dateFrom`, `dateTo`, and deep-link `saleId` filters. The default Accounting UI lists all sale and review statuses, while its actionable summary cards count only posted sales. Voided rows remain queryable for audit but display `VOIDED`, have no actionable evidence state, and are excluded from active sales APIs, dashboard review counts, and reports. A mismatch row includes the validated persisted `reportedComparison`, allowing reviewers to see exact reported quantities, prices, and calculated total without relying on notes. Admin and Accounting Staff can verify or report an unverified receipt mismatch. A mismatch notifies active Branch Staff assigned to the sale branch. Branch must respond with either `ORIGINAL_ENCODING_CORRECT` or `RECEIPT_CORRECTION_NEEDED`; correction responses require a replacement receipt number. Final resolution is blocked until that response exists. Admin or Accounting may Confirm Correct after the first response, while only Admin may Void and Replace after the second response using the branch-confirmed receipt number. A replacement sale starts `UNVERIFIED` and requires its own receipt evidence before verification.

The current Branch Finding UI adds `WRONG_RECEIPT_PHOTO` and `SALE_ENCODED_INCORRECT` while retaining `ORIGINAL_ENCODING_CORRECT` and `RECEIPT_CORRECTION_NEEDED` for existing records and the legacy correction path. A wrong-photo response requires a newly uploaded image whose evidence key and upload time match the current review; the upload clears any stale Branch response, and submitting the finding reopens the review as `UNVERIFIED` without changing the Sale or inventory. An incorrectly encoded sale remains posted and deducted until a `sales:void-replace` actor submits resolution action `VOIDED`; that serializable transaction marks the original Sale `VOIDED`, restores every original line through `SALE_CORRECTION_REVERSAL` movements, records the resolver, and creates no replacement Sale.

`POST /api/sales/:saleId/correction-request` is separate from Accounting receipt mismatch reporting. Authorized Branch Staff may report an accidental, duplicate, incorrect, nonexistent, or other direct-sale submission in an assigned branch without uploading receipt evidence. The request records reason, note, actor, and time, notifies Admin, leaves the sale `POSTED`, and creates no inventory movement. Only one request may be pending per sale, and Accounting review is blocked while it remains pending. `PATCH` requires the stock-changing `sales:void-replace` grant, the exact pending `correctionRequestId`, and a resolution note. `KEEP_SALE` resolves the request without changing sale or stock. `VOID_SALE` is accepted only for accidental, duplicate, or nonexistent sales; it atomically marks the sale `VOIDED`, restores every original line through `SALE_CORRECTION_REVERSAL` movements, records the resolver and time, and notifies the requester/poster. Wrong-information and other reports for real sales must remain posted and continue through receipt verification and void-and-replace. This workflow applies only to direct sales; completed Customer Order releases continue to use their dedicated workflow.

Uploading receipt evidence stores the private handwritten receipt image for manual Accounting review. The verification screen shows the system sale beside the uploaded photo; receipt OCR has been removed and no automatic text extraction or verification is performed. Upload now locks the Sale in a serializable transaction, rechecks location access and `POSTED` status, and conditionally matches the previous photo key, review time, and Branch response time. The final conditional write requires exact `UNVERIFIED` state for an ordinary upload and exact unresolved `MISMATCH_REPORTED` state plus `sales:mismatch:respond` for a Branch Finding replacement. This prevents a stale upload from overwriting concurrently replaced, reviewed, or deleted evidence. Failed upload transactions clean up the new file only after confirming that no review references it; replaced files are removed only after commit. Upload notification failures are logged without reporting the committed upload as failed; notification delivery rechecks the exact key and unverified posted state under the Sale lock.

Receipt photo removal has two distinct UI actions. Customer Sales/POS and Receipt Verification offer **Remove selected photo** for an unsaved file; it clears the File/preview and native file input, permits selecting the same file again, and makes no server request. POS only shows an unsaved selection. Receipt Verification also shows the persisted photo and offers a destructive **Delete receipt photo** confirmation to `sales:evidence:delete` holders. That existing independent action grant is reused; upload permission alone does not authorize deletion. A Branch Finding replacement already uploaded while submission is awaiting retry is not treated as an unsaved removable file.

Sale/receipt DTOs include `receiptPhotoVersion` (null without evidence), an opaque SHA-256 token derived from the unique private photo key. `receiptPhotoUrl` includes this token as `version`; authenticated `GET /api/accounting/receipts/:saleId/photo?version=<token>` returns `409 STALE_EVIDENCE` rather than serving another image if it changed, or `404` when the evidence/file is missing. Unversioned authenticated GET remains available. Image responses remain `Cache-Control: private, no-store`.

`DELETE /api/accounting/receipts/:saleId/photo` requires JSON `{ "version": "<receiptPhotoVersion>" }`. The confirmation captures the sale ID and displayed version, not whatever a background refetch later returns. The server reloads active session/role/location grants, requires `sales:evidence:delete`, and enforces effective sale-location access (not uploader identity). In a serializable transaction it locks Sale then SaleAccountingReview, requires `Sale.status = POSTED`, review `status = UNVERIFIED`, null `reviewedAt`, `verifiedAt`, `resolvedAt`, `branchResponse`, and `branchRespondedAt`, no pending SaleCorrectionRequest, and an exact current photo-version match. The conditional update repeats status/key/review/Branch Finding/correction guards. Verified, mismatched, resolved, voided, and Branch-Finding-reopened evidence cannot be deleted through this endpoint. Missing/malformed version is `400 INVALID_INPUT`; stale/missing photo is `409 STALE_EVIDENCE`; forbidden scope/grant is `403`; prohibited state/pending correction/concurrent transaction is `409`. Success is `{ "data": { "deleted": true } }`; repeating a completed delete with its old token returns a conflict.

Deletion clears only image metadata, legacy OCR metadata, and evidence upload/pending/reminder timestamps; it changes no sale, inventory, or review outcome. The same transaction creates a persisted warning for the actor, existing branch recipients (poster plus active assigned mismatch responders), and scoped Accounting/owner recipients, deduplicated by user ID. Notification text records the deleting actor ID and receipt reference, and uses the existing SALE deep link, cursor/SSE and push pipeline. These notifications are an operational record, not a new immutable evidence audit ledger; prior notifications/review history are not erased. Only after commit is the detached private file removed, best-effort; cleanup errors are logged and may leave a private orphan file, never an API-visible attachment. Review still requires both `sales:verify` and `sales:evidence:view` and a currently attached photo before either verification or mismatch reporting. Deleting evidence therefore restores the missing-evidence requirement and reminder eligibility. No schema/role changes or migration are required. This photo-removal revision is source-only: no tests, build, lint, typecheck, browser checks, generation, migration execution, or server restart were run.

`GET /api/dashboard` returns live location-scoped summary metrics for sales, open orders, low/out stock, Accounting queue counts, and notification preview. Owner Admin may filter only the dashboard's sales totals, transaction count, trend, and branch-performance data with `salesPeriod=today|last7Days|monthToDate` and an optional active `salesBranchId`; other dashboard metrics remain unfiltered, and non-owner filtered requests are rejected. Sales periods use Asia/Manila boundaries. The Admin sales trend is hourly for `today` and daily for the longer ranges. Reports are a separate three-report surface described below; Accounting queues and open orders are not report types.

`GET /api/stock-transfers` accepts `page` and `pageSize` (1-100) and returns `{ data, meta }`; `transferId` narrows an authorized notification deep link to one transfer. Transfer records use explicit source-or-destination location authorization: an actor assigned to active `SR` may view and manage outbound transfer records for every active destination when the matching action capability is granted, while destination-side actors see only transfers sent to their assigned destinations. Source-side transfer reach does not grant inventory, sales, orders, reports, or other branch data. Stock-transfer actions are `finalize`, `dispatch`, `cancel`, `confirm-receipt`, `report-discrepancy`, `investigate`, and `resolve`. They require the current transfer `version`, lock the transfer row, enforce state transitions, and use serializable transactions. Cancellation is allowed only from `IN_TRANSIT`; it preserves the original dispatch, records actor/reason/time, creates compensating `TRANSFER_CANCELLATION` movements, restores all transit quantities to SR, and ends in `CANCELLED`. Stock Staff normally creates/finalizes/dispatches/cancels SR-to-active-branch documents and investigates discrepancies; Admin may perform those same source-side actions as operational cover. Branch Staff remains destination-scoped for receipt/discrepancy, and Admin performs final discrepancy resolution. Accounting is denied. Transfer responses include `timeline` and `movements` audit arrays only for the Owner Admin. Other roles receive the operational transfer fields without audit history. Only one draft may exist per destination; duplicate draft creation returns `409 DUPLICATE_DRAFT`.

`GET /api/stock-transfers/options` requires create or update capability plus effective access to active canonical `SR`. It returns only active products with positive server-derived availability (`onHand - reserved - quarantined`) and never exposes the complete catalog to destination-only users. Draft create, update, and dispatch revalidate the same quarantine-aware quantity rule. `/stock-transfers/:transferId/print` renders a read-only checklist at every transfer status; printing has no inventory or workflow effect.

Stock-transfer transitions create persisted per-user notifications in the same database transaction as the triggering workflow update. Draft creation does not notify anyone. `FOR_DISPATCH` alerts Stock Staff assigned to `SR`, `IN_TRANSIT` alerts Branch Staff assigned to the destination, exact `RECEIVED` alerts Stock Staff, `DISCREPANCY_REPORTED` alerts Stock Staff, `UNDER_REVIEW` alerts Admin, and `RESOLVED` alerts Admin plus destination Branch Staff. Deleting an undispatched transfer removes any linked notifications created after finalization. Cancelling an in-transit transfer replaces stale linked alerts with a cancellation outcome for Stock Room and destination users.

`GET /api/notifications` returns only the authenticated user's persisted notification rows. `?after=<cursor>` returns rows for that user after the durable monotonic notification cursor, oldest-first, for reconnect and polling catch-up. `GET /api/notifications/stream` opens an authenticated same-origin SSE stream, emits missed rows after `Last-Event-ID` or `?cursor=`, then uses PostgreSQL `LISTEN/NOTIFY` as a wake-up signal while the Notification table remains authoritative. The header consumes the stream and keeps 30-second polling plus focus refetch as correctness fallback. The notification table maps related Stock Transfer, Sale, and Inventory Balance rows to their workflow page and marks an unread row read before navigation; linked Sale rows open the exact receipt record. `PATCH /api/notifications` marks all of that user's unread notifications read. `POST /api/notifications/:notificationId/read` marks one owned notification read. Users cannot read or modify another user's notification rows. `POST /api/notifications/push-subscription` stores the current browser push subscription for the authenticated user when VAPID keys are configured; notification creation schedules best-effort push delivery attempts and records each attempt without marking rows read. Mark-unread, cross-user notification audit, and automatic escalation remain deferred.

Direct sales, stock reservations, and Admin actual-quantity adjustments create durable warning notifications when a branch balance crosses from In Stock to Low Stock, or from Low Stock to Out of Stock. Recipients are active Admin users and active users assigned to that exact branch. The normal notification cursor/SSE/polling pipeline delivers the alert in realtime and avoids repeating alerts while the balance remains in the same threshold state.

Header notification popups track their last displayed cursor per signed-in email so the first unread notification is not treated as an already-seen baseline after login or page remount. Activating an in-app or browser notification popup opens `/notifications`; transaction deep links remain on each row's `Open` action inside that list. A mark-read failure does not block popup navigation.

## Offline branch sales

The offline endpoints remain implemented, but the customer-facing POS queue/banner and Admin navigation are temporarily disabled. Current POS operation is online-only while the offline operating workflow is deferred.

`POST /api/offline/activations` is Admin-only and activates one current offline device ID for one active branch. Activating a new device for the branch revokes the previous active activation. The activation window is 24 hours and is refreshed by an online branch snapshot request.

`GET /api/offline/snapshot?deviceId=<id>` is Branch Staff-only through `sales:post`, requires the caller's persisted assigned branch and a current active device activation, and returns only minimal branch product stock/price fields. It does not return customer profiles, credentials, Admin data, or cross-branch data.

`POST /api/offline/sync` accepts one queued direct-sale command with `{ deviceId, idempotencyKey, occurredAt, operationType: "DIRECT_SALE", payload }`. The branch snapshot includes eligible Salespersons and the queued payload requires `salespersonId`. The server reserves `(deviceId, idempotencyKey)`, rechecks active Branch Staff/device authorization, and snapshots current server Personnel data at acceptance time. A legacy queued payload without Salesperson or a now-inactive/reassigned/ineligible Salesperson becomes `NEEDS_REVIEW`; the system never guesses attribution. Duplicate same-key/same-payload requests return the stored outcome; same-key/different-payload returns `CONFLICT`. Duplicate receipt, insufficient stock, and other 409 sale conflicts are also retained as `NEEDS_REVIEW` instead of creating negative stock. Offline transfer receipt/discrepancy evidence is still deferred.

## Supplier receipts

`POST /api/stock-receipts` accepts `{ reference, supplierId, notes?, lines: [{ productId, expectedQuantity, acceptedQuantity, quarantinedQuantity, missingQuantity, unitCost, claimReason?, claimNotes? }] }`. Expected quantity is positive and must equal accepted plus quarantined plus missing; split quantities are nonnegative, product IDs cannot repeat, unit cost is positive, and an affected line requires a claim reason. Every product and the Supplier must be active. Any malformed line rejects the complete request. Admin or Stock Staff assigned to the active canonical Stock Room can post without Supplier Maintenance access. The server fixes the destination to `SR`; client input cannot select a branch.

One serializable transaction resolves the active Supplier, persists its ID and current name snapshot, stores immutable product and split-quantity line snapshots, and creates a draft Supplier Claim for every quarantined or missing exception. Accepted quantity increases `onHand`; quarantined quantity increases both `onHand` and `quarantined`; both update latest unit cost and are represented by one positive `SUPPLIER_RECEIPT` movement per physically received line. A missing-only line changes no balance, unit cost, or movement. Duplicate references return `409 DUPLICATE_REFERENCE`; invalid Supplier/product requests change neither receipt nor inventory. `GET /api/stock-receipts` returns current Supplier identity plus the historical snapshot within the actor's authorized locations.

## Supplier maintenance

Supplier Maintenance is global master data and uses independent `suppliers:view`, `suppliers:create`, `suppliers:update`, and `suppliers:deactivate` capabilities. Supplier names and optional codes are unique after trim/case normalization. Create/update accepts `code?`, `name`, `contactPerson?`, `contactNumber?`, `email?`, `address?`, and `notes?`. The status endpoint deactivates or reactivates without deleting history. Inactive suppliers remain visible in maintenance and historical receipts but are excluded from the narrow active-supplier options loaded by Receive Stocks.

## Returns and warranty

Backjob multi-item/deletion revision (2026-09-08) is source-only and unverified; it requires the authored `20260908200000_backjob_items_and_delete` migration and regenerated Prisma Client, neither executed here. Normal `POST /api/backjobs` now accepts `{ isLegacy: false, saleId, saleLineIds: string[], concern, notes? }`, with 1-100 unique SaleLine IDs from the same posted Sale and its recorded customer; the Sale is share-locked during creation. The old singular request field `saleLineId` is replaced, not accepted as a second input format. Owner-only legacy input is unchanged. List, detail, and mutation records expose ordered `items: BackjobItemDto[]` containing `{ id, originalSaleLineId: string | null, productId: string | null, productItemCode: string | null, productName: string, position: number }`. Existing singular header fields remain first-item compatibility snapshots, not a summary of every item. New UI list/detail/print consumers use `items`; list search matches every selected item's code/name. There is no affected-unit quantity field.

`DELETE /api/backjobs/:backjobId` accepts `{ version: positiveInteger }` and returns `200 { data: { id } }`. It requires `backjobs:delete`, implies only `backjobs:view`, and enforces current location scope, a `FOR UPDATE` case lock, and version/evidence checks inside a serializable transaction. Only `DRAFT` is eligible; `PENDING` remains coverage, not workflow status. Issued/returned parts, any recorded usage (even zero), part-linked/reference-linked movements, charges or historical financial links, attachments, scheduling/work/closure evidence, and unknown event history block deletion with 409. Missing records return 404; stale versions/serialization conflicts and restrictive related records return 409. Invalid bodies return 400 and missing capability/location access returns 403. Successful deletion removes draft children and old case-linked notifications, then sends the same active owner recipients a `Backjob deleted` warning with reference/branch only and no `relatedId`, so no Open link points at a deleted record. No deletion event survives the deleted aggregate. See `docs/BACKJOB-ITEMS-AND-DELETE.md` for backfill, cleanup dependencies, and Reports handoff.

`/api/backjobs` and `/api/backjobs/:id/:action` provide location-scoped Backjob creation, scheduling, coverage, parts planning/issue/usage/return, completion, cancellation, and rejection. Parts deduct when issued and return through separate immutable movements. Installer options follow the same actor-based personnel location scope as Salesperson options, independently of the case branch. Scheduling, start, and completion share-lock the assigned Personnel row before validating active `INSTALLER` or `BOTH` eligibility at an active branch within the current actor's personnel scope and retain that lock through workflow commit. Case location authorization is unchanged.

Every recorded Backjob event creates one persisted notification per active Owner Admin (`User.status = ACTIVE`, `accessRole.isOwner = true`), including when Admin performs the action. This follows the existing explicit owner/Admin identity, whose effective capabilities include Backjob and notification reads across locations; role names, compatibility `User.role`, delegated administration permissions, and `locations:all` alone do not qualify a recipient. Events are `CREATED` (normal and legacy drafts), `SCHEDULED`, `RESCHEDULED`, `STARTED`, `COVERAGE_SET`, `PARTS_PLANNED`, `PART_ISSUED`, `PART_USAGE_RECORDED`, `PART_RETURNED`, `COMPLETED`, `REJECTED`, and `CANCELLED`. Completion is success, rejection/cancellation are warnings, and other events are informational. Copy contains the case reference, branch code, and step, not customer details or free-text notes. The notification row's Open action links to `/inventory/returns-warranty/:backjobId`, with existing page/API authorization unchanged; notification popups still open the inbox.

Backjob state, event, inventory effects (when applicable), and notification rows commit or roll back together through the shared event writer and notification service. Existing row locks and version checks prevent repeat notifications from a retry of the same versioned action; a new successfully recorded action, including another coverage/plan/usage save, gets its own alert. Draft creation has no request-idempotency key: retrying after a lost successful response can still create a second case and its own creation alert. Reads, printing, unsaved form edits, and failed actions do not notify, and historical events are not backfilled. SSE/cursor replay, polling, per-user read state, and best-effort browser push reuse the existing notification pipeline. No active owner means no recipient; the workflow still succeeds.

`/api/customer-warranties` creates a case linked normally to a verified posted SaleLine. Multipart `photo` is optional: omission or the browser's unnamed zero-byte file placeholder means no photo; a supplied file still requires valid JPEG/PNG/WebP content, 1 byte to 6 MB. Without a photo, `intakePhotoKey`, `intakePhotoType`, and `intakePhotoName` are null. Creation returns `201` regardless of photo presence; an identical retry returns `200`. Creation uses the client UUID plus a stable request fingerprint containing normalized fields, actor, and evidence content hash (or null for no evidence): an identical retry returns the existing case and conflicting reuse, including adding/removing photo content, returns `409 IDEMPOTENCY_CONFLICT`. `GET /api/customer-warranties/:id/evidence` remains authorized and location-scoped and returns `404 NOT_FOUND` when no intake photo exists. The UI Remove action clears only the unsaved selected file and preview; it does not delete stored evidence.

`GET /api/customer-warranties/options` requires `customer-warranties:create` and returns accessible active locations and up to 250 recent posted, Accounting-verified customer sale lines within location scope. Each line already includes `sale.locationId`, receipt/customer labels, and product snapshots. The searchable create selector uses receipt/customer as its primary label with separate affected-product context; search filters these loaded options, not all historical sales. For nonlegacy creation the UI derives multipart `locationId` from the selected line's sale. The API still requires `locationId`, authorizes it, rejects a different sale location with `409 INVALID_LOCATION`, and requires an active location; it does not silently accept or rewrite a mismatched request. The selector/location revision is source-only and unverified.

An owner-only legacy claim means a claim without a linked system Sale/SaleLine, not a separate claim module or an age-based status. It requires manual customer name, product, a reason for the exception, and a claim-specific warranty period with a documented basis; the original sale/receipt reference is optional. The create/detail UI describes this as "Sale not recorded in this system". If a linked sold line has no warranty snapshot, only Owner Admin may likewise establish a claim-specific duration with a documented basis. Cumulative quantity above sold quantity and an equivalent-product replacement require Owner Admin and a reason. Repair/replacement approval requires a future target date. During assessment, `return-to-customer` requires `customer-warranties:release`, positive quantity, and a reason; it returns only unassigned warranty quarantine, decrements on-hand and quarantine through `WARRANTY_RELEASE`, increments `returnedQuantity`, and leaves status unchanged. Reject/cancel checks current unresolved custody rather than historical received quantity. Creation and approval have no inventory effect; `receive-quarantine` ("Confirm item received" in the UI) remains a separate physical inventory action.

Optional-photo deployment prerequisite: apply the authored `20260908180000_optional_warranty_intake_photo` migration and regenerate Prisma Client before using the no-photo path. Neither application nor generation was run in this source-only update. The migration preserves existing photo keys and evidence. See `docs/DATABASE.md`.

`/api/supplier-claims` tracks receipt- or warranty-linked Supplier Claims. Line `unitCost` is positive with at most two decimal places so request replay matches persisted `Decimal(12,2)` values exactly. Identical create/action retries return the stored result; reuse of an idempotency key with a different normalized payload returns `409 IDEMPOTENCY_CONFLICT`. Submission requires a future follow-up target and photo evidence when any line is damage/defect. Action endpoints post supplier return, repair, replacement receipt, repaired release/receipt, and write-off movements. Refund/credit settlement payloads include explicit product quantities and reduce only outstanding missing quantities; they create claim settlement/action audit records but no inventory movement, balance/cost change, or general-ledger entry. Settlement retries are payload-checked. Reject closes unresolved missing quantities but is blocked until quarantined quantities have a physical disposition.

Stock receiving lines now use `{ productId, expectedQuantity, acceptedQuantity, quarantinedQuantity, missingQuantity, unitCost, claimReason?, claimNotes? }`. The three quantities must sum to expected. Accepted stock increases on-hand, quarantined stock increases both on-hand and quarantine, and missing stock creates no inventory. Any exception atomically creates a draft Supplier Claim.

`GET /api/reports` accepts exactly `type=sales|inventory-summary|returns-warranty`. Retired `inventory-movements` and `low-stock` types, cross-report filters, unknown parameters, and duplicated parameters return `400 INVALID_FILTERS`, including PDF requests. Operational `/api/inventory/movements`, movement records, stock alerts, and dashboard low-stock views are unchanged. Old Reports page links for retired types open clean default Sales filters instead of forwarding obsolete filters.

Supported filters are: Sales `dateFrom`, `dateTo`, `locationId`, `salespersonId`, `source`, `paymentMethod`; Inventory Summary `locationId`, `search`, `category`, `brand`, `productStatus`; Returns & Warranty `dateFrom`, `dateTo`, `locationId`, `caseType`, `status`, `resolution`, `entitySearch`. The former Inventory `stockStatus` filter is rejected; positive availability is now mandatory. All options, rows, breakdowns, and totals remain inside effective active-location access. Sales uses `verifiedAt`; Returns & Warranty uses creation time as `caseDate`. `dateFrom` defaults to the first day of the current Manila month; omitted `dateTo` defaults to the last day of the supplied/default `dateFrom` month, inclusive through the next Manila midnight (exclusive). Explicit custom end dates are preserved; reversed or impossible dates are rejected.

Inventory Summary is an undated snapshot over authorized active `BRANCH` locations only, excluding Stock Room/warehouses and in-transit stock. Requesting a warehouse, inactive, or unauthorized location returns `403`, even for an all-location actor requesting a warehouse. Omitted `locationId` selects the first eligible branch ordered by name then ID, not All; no preference/home field exists in the active access context and compatibility `User.locationId` is not used. Explicit `locationId=all` selects all eligible branches, and an actual branch ID selects that branch. Empty/duplicated parameters are invalid. No eligible branch returns empty scope/rows. This same default resolution applies to JSON, options, and PDF; Sales/Returns omitted-location behavior is unchanged.

Inventory includes all product statuses unless explicitly filtered, but only products with positive available stock at a selected branch. Each row is `{ id, productId, itemCode, product, category, brand, productStatus, available, availableByLocation }`, grouped once per product (`id = productId`). `availableByLocation` contains every effective branch ID with `max(onHand - reserved - quarantined, 0)` or zero for a missing balance; `available` sums those contributions and must be positive. Row-level `locationId`, `branch`, and `stockStatus` are removed. `effectiveScope` provides ordered branch labels/IDs and `branchTotals: [{ locationId, available }]` follows that order. Totals remain `productCount` (grouped rows), `locationCount` (branches in scope, even with no matching products), and `available` (full filtered sum). JSON contains the full filtered dataset, with no API pagination parameters. UI paginates 25 products and shows product metadata plus Available for one branch, or per-branch columns plus Total Available for multiple branches; all summary/footer totals and PDF rows cover the full set.

`GET /api/reports/options` returns `{ data: { locations, defaultLocationId, salespersons, categories, brands } }` using the same strict report query contract (no `format`). `defaultLocationId` is the deterministic first eligible Inventory branch or `null`; other report types return `null`. The UI sends only draft `type`, `locationId`, and Inventory Summary `productStatus`; it never runs the full report to refresh selectors. Locations remain all eligible authorized locations for that report, while Salesperson options follow the selected location and category/brand options follow inventory product status. Unused option lists are empty. Changing location clears the draft Salesperson; changing product status clears draft category/brand. These changes, other edits, and Reset Filters do not change result rows, totals, URL filters, or PDF parameters until Apply Filters. Switching report tabs opens that report's defaults immediately. Inventory distinguishes the unset default from explicit `locationId=all`; export from an unset-branch result supplies its resolved branch ID.

Returns & Warranty rows additionally expose `backjobChargeAmount: number | null`, read from persisted `Backjob.chargeableAmount` only when coverage is `CHARGEABLE` (zero is a recorded amount; `null` means not applicable). `totals.backjobChargeAmount` sums those values once per filtered case, independently of `supplierRefundAmount` and `supplierCreditAmount`. UI/PDF labels distinguish recorded Backjob charges from collected payments, verified Sales revenue, and supplier claim tracking; no Sales totals or '% of grand total' calculation changes. Recorded amounts follow the case/status filters, including cancelled/rejected cases if not excluded, rather than implying collectible debt.

Backjob report selection now reads `items` ordered by `position` ascending. The `product` summary includes every stored item code/name, separated by semicolons; case-insensitive `entitySearch` therefore matches later original items as well as the first. Only when `items` is empty does the report use the scalar `affectedProductItemCode`/`affectedProductName` snapshot, with `legacyProductDescription` then "Not recorded" as name fallbacks. It never appends that scalar first item to an existing item list. Each Backjob remains one case row, with case counts/breakdowns and the recorded charge counted once. The row `quantity` contract is `number | null`: always `null`/"Not recorded" for Backjobs because BackjobItem has no affected-unit quantity, and unchanged recorded numbers for Customer Warranties and Supplier Claims. No quantity is inferred from original-line count, sold units, or replacement parts. No Backjob service/contracts or Prisma edits are part of this report update; runtime requires the separately authored BackjobItem table and matching generated Prisma Client.

Absent `format` and exact `format=json` return JSON; exact `format=pdf` requires `reports:export`. Other or duplicated format values return `400 INVALID_FORMAT`. PDFs run the same live authorized query, with private no-store headers, so records may change between viewing and exporting. A4 landscape PDFs use 9-point wrapped detail text, grouped columns, repeated section/table headers, page numbers, and continued oversized rows without truncation. Inventory comparison uses product totals followed by separate fixed-width branch sections (all filtered products, including zero cells), so additional branches add sections rather than overflowing or shrinking columns. Sales includes a separate branch-subtotal table and emphasized overall total. Company text replaces the literal logo placeholder; no image logo is embedded. Accounting Queue and Open Orders are not Reports. This follow-up is source-only: report assertions were updated for positive grouped inventory and multi-item Backjob projection/search/counting, but no tests or verification commands were run. No build/lint/typecheck/browser/PDF rendering/migrations/generation/restart occurred. Full-dataset performance and runtime multi-item Backjob behavior remain unverified.

## Personnel maintenance

Personnel Maintenance stores non-login Salesperson and Installer identities with `{ fullName, locationId, type }`, where type is `SALESPERSON`, `INSTALLER`, or `BOTH`. Each record has exactly one active branch as its current home location. Lists include active and inactive records only from effective locations. Creation and reassignment validate an active branch and actor location scope; reassignment requires access to both the current and destination branch. Deactivation/reactivation preserves identity and audit actors. Direct Sales and Customer Orders use a narrow active Salesperson lookup without granting Personnel Maintenance, and changed Customer Order assignments append immutable previous/new snapshot events. Backjob scheduling, start, and completion hold a `FOR SHARE` Personnel lock while revalidating active `INSTALLER` or `BOTH` eligibility within the acting user's personnel location scope.

## Product list

`POST /api/products` and `PATCH /api/products/:productId` are Admin-only. Active products require a positive current price; inactive products may have null price. `reorderLevel` is stored once on Product and applies to every location. Item code is globally unique; product names are not unique. Item code cannot be changed after the product has inventory balances or receipt/transfer/movement history. Product mutations accept `vehicleCompatibilities`, an array of `{ make, model, startYear, endYear }`; years may be null for an open-ended or unspecified range, and a supplied start year cannot exceed the end year. `DELETE /api/products/:productId` is Admin-only and allowed only for products with no inventory balance rows and no usage/history.

`POST /api/products/:productId/image` accepts multipart field `image` and replaces the current product image after validating JPEG, PNG, or WebP content and a 6 MB maximum. `DELETE` clears the image metadata and best-effort removes the stored file. `GET` serves the image only to authenticated `products:view` holders with private caching. Product list rows expose a cache-busted authenticated `imageUrl`, not the private storage key.

`GET /api/products` accepts:

| Parameter | Type/default | Behavior |
| --- | --- | --- |
| `page` | positive integer, `1` | Requested page, clamped to the final page |
| `pageSize` | integer `1..100`, `10` | Products per page |
| `itemCode` | string, empty | Case-insensitive substring |
| `name` | string, empty | Case-insensitive substring |
| `category` | string, `all` | Exact category or all |
| `brand` | string, `all` | Exact brand or all |
| `vehicleMake` | string, `all` | Exact compatible vehicle make or all |
| `vehicleModel` | string, `all` | Exact compatible vehicle model or all |
| `vehicleYear` | integer `1886..2200`, `all` | Matches compatibility ranges containing the year; null range bounds are open |
| `status` | `all`, `Active`, `Inactive` | Product status |
| `stockStatus` | `all`, `has-stock`, `no-stock`, `inactive-with-stock` | Product balance/status filter |

Response:

```ts
type ProductsResponse = {
  data: Array<{
    id: string;
    imageUrl: string | null;
    itemCode: string;
    name: string;
    category: string;
    brand: string;
    price: number | null;
    reorderLevel: number;
    status: "Active" | "Inactive";
    description?: string;
    vehicleCompatibilities: Array<{
      id: string;
      make: string;
      model: string;
      startYear: number | null;
      endYear: number | null;
    }>;
  }>;
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  filterOptions: {
    categories: string[];
    brands: string[];
    vehicleMakes: string[];
    vehicleModels: string[];
  };
  summary: {
    totalProducts: number;
    activeProducts: number;
    inactiveProducts: number;
    withReorderLevel: number;
  };
};
```

Prices are serialized as JSON numbers for compatibility with the current UI. Transactional APIs should adopt one documented money representation before implementation.

## Inventory list

`GET /api/inventory` accepts the common product parameters plus:

| Parameter | Type/default | Behavior |
| --- | --- | --- |
| `location` | string, `all` | Admin only: `all`, active `SR`, or one active branch Location ID, code, or exact name |
| `status` | `all`, `In Stock`, `Low Stock`, `Out of Stock` | Derived from available stock and reorder level |

Inventory independently requires the named `inventory:view` capability. Accounting Staff is denied with `403`. Branch Staff requests are always scoped to the persisted active branch and Stock Staff requests are always scoped to persisted `SR`; client-supplied locations, including duplicate or reordered values, cannot expand either scope. Admin may request all locations, active `SR`, or one active branch; conflicting duplicate Admin scope values return `400`. Product pagination occurs before balances are loaded, so a product's matching locations are not split across pages.

Status is derived from `available = onHand - reserved - quarantined` as:

- `Out of Stock`: `available <= 0`
- `Low Stock`: `0 < available <= reorderLevel`
- `In Stock`: `available > reorderLevel`

Balance timestamps are ISO 8601 strings.

Inventory balance responses expose `onHand`, `reserved`, `quarantined`, and derived `available = onHand - reserved - quarantined`. Sales, reservations, transfers, offline snapshots, reports, and low-stock status use this same formula. `POST /api/inventory/:balanceId/adjustment` rejects a correction that would make `onHand < reserved + quarantined` with `409 BELOW_ALLOCATED_STOCK`. There is no direct quarantine-edit API.

`GET /api/inventory/movements` accepts `page`, `pageSize`, `product` item code or `all`, `location`, `type`, and `reference`. It applies the same persisted location scope as `/api/inventory`; Admin may see all or one active operational location, Stock Staff remains scoped to `SR`, Branch Staff remains scoped to their persisted branch, and Accounting is denied.

`GET /api/inventory/availability` is the read-only source for the Inventory Availability sheet. It accepts `search`, `product`, `category`, `location`, and derived `status` filters and returns product, location, `onHand`, `reserved`, `available`, and status fields plus scoped product/category/location filter options. Admin sees active branches plus active `SR` and may select one by ID, code, or exact name. Branch Staff is fixed to its persisted active branch, Stock Staff is fixed to active `SR`, and Accounting Staff is denied; caller-supplied locations cannot widen a fixed staff scope. Inactive or non-operational locations and their balances are excluded.

The response `summary` contains user-facing totals for the active authorized location scope: `totalProducts`, `totalUnits`, `needsRestock`, and role-scoped `incomingItems`. This is the total quantity still in transit, not a document count and not sellable stock. For Branch Staff it includes only transfers destined for the persisted branch; Admin sees the selected location scope and Stock Staff sees items in transit to branches.

## User management

User routes require their exact `users:view`, `users:create`, `users:update`, `users:set-status`, or `users:reset-password` capability. List filters are ANDed with effective location access, summary counts use the same actor scope, and inaccessible or `none` filters fail closed for restricted managers. User-form location and role options expose only grants the actor can assign. Delegated managers cannot change their own role/locations/status/password or assign a role whose capabilities or all-location reach exceed theirs. Every failure uses the stable envelope `{ "error": { "code", "message" } }`.

### `GET /api/users`

Query parameters validated with Zod (`lib/contracts/users.ts`):

| Parameter | Type/default | Behavior |
| --- | --- | --- |
| `page` | positive integer, `1` | Requested page; page size is fixed at 10 |
| `search` | string ≤200, optional | Case-insensitive match on name or email |
| `roleId` | RoleDefinition id, optional | Persisted role filter |
| `status` | `ACTIVE`, `INACTIVE`, optional | Account status filter |
| `location` | location code, `none`, optional | Active `SR` or active branch code from Location, or the unassigned filter; unknown/inactive codes return `400 INVALID_LOCATION_FILTER` |

Response:

```ts
type UserListResponseDto = {
  data: Array<{
    id: string;
    name: string;
    email: string;
    roleDefinitionId: string;
    roleName: string;
    status: "ACTIVE" | "INACTIVE";
    isOwner: boolean;
    locations: Array<{ id: string; code: string; name: string; type: "WAREHOUSE" | "BRANCH" }>;
    credentialSetupRequired: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    totalStaff: number;
    activeStaff: number;
    inactiveStaff: number;
  };
};
```

The immutable owner Admin row appears in data with `isOwner: true`; summary counts cover non-Admin staff only. Credential hashes, sessions, and Better Auth ban compatibility fields are never serialized.

### `POST /api/users`

Body contains `roleId`, `name`, `email`, `temporaryPassword`, and `locationIds`. Non-owner roles without `locations:all` require at least one active operational location. Roles with `locations:all` accept an empty array.

Duplicate emails return `409 EMAIL_IN_USE` with exactly one user/account left behind. The guarded internal Better Auth primitive first creates an inactive staging credential; the lifecycle service then re-resolves and locks the current role/location assignment, activates the user, arms `credentialSetupRequired`, and returns the safe DTO. Failed finalization removes the staging row when possible, and any cleanup-failure residue remains inactive. The response never contains the temporary password.

### `PATCH /api/users/:userId`

Accepts optional `name`, `email`, `roleId`, and `locationIds`. Supplying `locationIds` replaces assignments atomically after a `FOR UPDATE` row lock; access changes delete all target sessions in the same transaction. Every delegated edit, status change, and password reset locks and re-reads the target user, share-locks the target's current role, and requires both the target's complete active operational location set and current effective capabilities to be subsets of the actor's authority. Owner bypasses these ceilings. Any target whose role grants `locations:all` requires an owner or another all-location manager. User DTOs therefore never expose assignments outside the caller's authority.

## Role maintenance

Role DTOs and create/edit bodies contain no operational scope. `POST` accepts name, description, and permissions. Owner may grant any catalog capability. A delegated role manager may update a role only when both its current permissions and requested permissions are subsets of the manager's effective capabilities, and cannot edit their own assigned role. `PATCH` additionally requires `version`; stale writes return `409 ROLE_VERSION_CONFLICT`. Permission changes revoke assigned sessions. Removing `locations:all` returns `409 LOCATION_ASSIGNMENT_REQUIRED` if an assigned user has no valid explicit location. The `isOwner` role is immutable and nonassignable. No role delete/deactivate endpoint exists.

### `POST /api/users/:userId/status`

Body `{ "status": "ACTIVE" | "INACTIVE" }`. Deactivation sets `User.status = INACTIVE` and deletes all target sessions atomically; reactivation restores sign-in ability. Repeated requests with the same status are idempotent no-ops.

### `POST /api/users/:userId/password`

Body `{ "newPassword": string }`. Runs the guarded internal `setUserPassword` primitive first, then re-arms `credentialSetupRequired` and deletes all target sessions in one transaction. Repeated resets are idempotent. Old cookies stop working immediately; the new temporary password must be shared through an offline channel and is never echoed in any response.

## First-login credential setup

### `GET /api/credential-setup`

Authenticated current-user query gated by active persisted identity only, with no resource capability required. Returns whether `credentialSetupRequired` is armed for the caller, including when a custom role does not grant Dashboard access.

### `POST /api/credential-setup`

Body is a discriminated union:

- `{ "action": "change", "currentPassword", "newPassword", "confirmPassword" }` verifies the current credential through Better Auth's `changePassword` primitive (without its built-in `revokeOtherSessions`, which would replace the initiating cookie), consumes the prompt, keeps the initiating session, and revokes every other session server-side.
- `{ "action": "skip" }` consumes the prompt without claiming the password changed.

The prompt is consumed exactly once per arming; a later Admin password reset re-arms it. Failures use the fixed server-owned copy (`CREDENTIAL_CHANGE_FAILED`) mirrored client-side; submitted values and policy internals are never echoed. Missing, expired, or revoked sessions return `401` with no state change.

## Session revocation semantics

Deactivating an account or changing an active user's role/location deletes all of that user's Better Auth sessions in the same transaction as the access change. Injected-failure integration tests prove both writes roll back together. An old session cookie therefore fails closed immediately after the change.

## Caching and errors

The handlers do not declare a public cache contract or return cache headers. Callers should treat reads as authenticated, user-scoped responses. TanStack Query currently applies a 30-second client `staleTime`.

No OpenAPI document, rate limit, automated contract-test layer beyond the Vitest suites, mutation idempotency standard beyond the documented lifecycle rules, or standardized cross-domain error library exists yet.
