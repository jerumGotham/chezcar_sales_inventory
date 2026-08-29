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
| Branch Staff | Customer CRUD, customer-order create/reserve/payment/release/unpaid cancel, direct sales, mismatch response/evidence, assigned-branch transfer receipt/discrepancy |
| Accounting Staff | Business-wide sales/receipt views, review, confirm-correct resolution, evidence, and report export; no stock-changing void-and-replace |

The complete list and Role Maintenance labels are generated from `CAPABILITY_CATALOG`. All action permissions, including administration, are independently assignable. `locations:all` grants location reach only. The owner role remains immutable and nonassignable. Restricted users with no active operational assignment fail closed.

## Endpoints

| Method | Path | Data source | Authorization |
| --- | --- | --- | --- |
| `GET`, `POST` | `/api/auth/[...all]` | Better Auth + PostgreSQL | Endpoint-specific; public sign-up disabled; generic admin operations unroutable |
| `GET` | `/api/health` | PostgreSQL readiness query | Public, data-free `200`/`503`; used by the container and manual readiness checks |
| `GET` | `/api/dashboard` | Prisma sales/orders/inventory/accounting plus persisted notifications | `dashboard:view` |
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
| `GET` | `/api/accounting/receipts?page=1&pageSize=10&reviewStatus=all&saleStatus=POSTED` | Prisma Sale/SaleLine/SaleAccountingReview/Location | `sales:verify:view`; server-side filters and pagination |
| `POST` | `/api/accounting/receipts/:saleId/review` | Prisma SaleAccountingReview/Notification | `sales:verify`; Accounting Staff only |
| `POST` | `/api/accounting/receipts/:saleId/resolve` | Prisma Sale/SaleLine/SaleAccountingReview/InventoryMovement/Notification | `sales:resolve` for confirm-correct; `sales:void-replace` for stock-changing replacement |
| `POST`, `GET` | `/api/accounting/receipts/:saleId/photo` | Coolify persistent receipt-evidence storage | `sales:evidence:upload` / `sales:evidence:view`; Branch scope is enforced by sale location |
| `GET` | `/api/reports` | Prisma sales/orders/accounting/inventory summaries | `reports:view`; every dataset is restricted to effective locations; PDF additionally requires `reports:export` |
| `GET`, `POST` | `/api/products` | Prisma Product/InventoryBalance | `products:view` / `products:create` |
| `PATCH`, `DELETE` | `/api/products/:productId` | Prisma Product | `products:update` / `products:delete` |
| `GET`, `POST`, `DELETE` | `/api/products/:productId/image` | Prisma Product + private persistent image storage | `products:view` / `products:image:update` |
| `GET` | `/api/inventory` | Prisma Product/InventoryBalance/Location | `inventory:view` |
| `GET` | `/api/inventory/availability` | Prisma Product/InventoryBalance/Location | `inventory-availability:view`; active scoped locations only |
| `PATCH` | `/api/inventory/:balanceId` | Prisma Product/InventoryBalance | `inventory:cost:update`; non-owner actors remain location-scoped |
| `POST` | `/api/inventory/:balanceId/adjustment` | Prisma InventoryBalance/InventoryMovement/Notification | `inventory:adjust`; non-owner actors remain location-scoped |
| `GET` | `/api/inventory/movements` | Prisma InventoryMovement | `inventory-movements:view` |
| `GET`, `POST` | `/api/stock-transfers?page=1&pageSize=10` | Prisma transfer ledger | `stock-transfers:view` / `stock-transfers:create`; server-paginated list |
| `POST` | `/api/stock-transfers/:id/:action` | Prisma transfer/inventory transaction | Matching `stock-transfers:update/delete/finalize/dispatch/receive/report-discrepancy/investigate/resolve` plus scope/state policy |
| `POST` | `/api/accounting/receipts/:saleId/branch-response` | Prisma Accounting review | Assigned Branch Staff for an unresolved own-branch mismatch |
| `GET`, `POST` | `/api/stock-receipts` | Prisma supplier-receipt/inventory transaction | `stock-receipts:view` / `inventory-receiving:create`; OWNER/STOCK_ROOM scope, destination fixed to `SR` |
| `GET`, `POST` | `/api/users` | Prisma User + UserLocation | `users:view` / `users:create`; effective locations apply |
| `GET`, `POST` | `/api/roles` | Prisma RoleDefinition | `roles:view` / `roles:create` |
| `GET`, `PATCH` | `/api/roles/:roleId` | Prisma RoleDefinition | `roles:view` / `roles:update`; owner immutable |
| `GET`, `POST` | `/api/branches` | Prisma Location (`BRANCH`) | `branches:view` / `branches:create`; creation also requires all-location reach |
| `PATCH` | `/api/branches/:branchId` | Prisma Location (`BRANCH`) | `branches:update`; effective locations apply; code immutable |
| `PATCH` | `/api/users/:userId` | Prisma User + UserLocation | `users:update`; effective locations apply |
| `POST` | `/api/users/:userId/status` | Prisma User | `users:set-status`; effective locations apply |
| `POST` | `/api/users/:userId/password` | Better Auth internal + Prisma User | `users:reset-password`; effective locations apply |
| `GET`, `POST` | `/api/credential-setup` | Better Auth + Prisma User | Any authenticated active role |

## Customer orders, sales, and Accounting

`POST /api/customer-orders` creates or reuses a customer, snapshots product item code/name/current price, validates active products, and creates one order in a serializable transaction. Branch Staff may create only for their persisted branch; Admin must select an active branch. The options endpoint returns accessible branches, active customers, and only products with positive available stock (`onHand - reserved`) by default. POS uses this single `sales:post`-authorized response and does not require `customers:view` or issue a separate `/api/customers` request. `includeUnavailable=true` also returns active products without available branch stock so the waiting-stock create flow can select them; POS does not request this mode. Reservation orders validate available branch stock and increment `reserved` without decrementing `onHand`. Waiting-stock orders do not reserve stock. DP reservations require `downpaymentAmount > 0` and globally unique `downpaymentReceiptNumber`.

`POST /api/customer-orders/:orderId/reserve` transitions only a `WAITING_STOCK` order to `RESERVED`. Admin may reserve any branch order and Branch Staff only their assigned branch. The serializable transaction locks the relevant inventory balances, verifies all order lines are now available, increments every reserved quantity, and rolls back the whole operation if any line is unavailable.

`POST /api/customer-orders/:orderId/release` requires a final manual receipt number and exact remaining balance payment. Release decrements `onHand`, decrements `reserved`, creates a posted `Sale`, creates `CUSTOMER_ORDER_RELEASE` inventory movements, registers the receipt globally, creates an unverified Accounting review row, and marks the order completed in one transaction.

`POST /api/customer-orders/:orderId/cancel` releases reserved stock. Branch Staff may cancel own-branch no-DP orders. DP cancellation is Admin-only and requires a note.

`POST /api/customer-orders/:orderId/payment` accepts `{ amount, reference? }` for an active order. Branch Staff are limited to their assigned branch; Admin may record any branch payment. The positive amount cannot exceed the remaining balance. A supplied reference must be unique within the branch receipt ledger. The transaction atomically adds to `downpaymentAmount`, subtracts from `remainingBalance`, and retains the first supplied payment reference as the order's downpayment receipt. A no-DP reservation becomes a DP reservation after its first payment; later payments accumulate without releasing the order.

`POST /api/sales` posts direct branch sales with branch-scoped receipt identity, an optional `discountAmount` not exceeding the subtotal, deducts available branch stock immediately, creates `DIRECT_SALE` inventory movements, and creates an unverified Accounting review row. Branch Staff use their persisted branch; Admin must supply an active `locationId`. Branch Staff select a customer from the shared customer master before clicking `Complete Sale`. `GET /api/accounting/receipts` is visible to Admin and Accounting Staff for the full queue; Branch Staff receive only unresolved mismatches from their persisted branch. It accepts `page`, `pageSize` (5-50), `search` (receipt/booklet/reference/customer/branch), `reviewStatus`, `saleStatus`, `locationId`, `dateFrom`, and `dateTo` filters. A mismatch row includes the validated persisted `reportedComparison`, allowing reviewers to see exact reported quantities, prices, and calculated total without relying on notes. Admin and Accounting Staff can verify or report an unverified receipt mismatch. A mismatch notifies active Branch Staff assigned to the sale branch. Branch must respond with either `ORIGINAL_ENCODING_CORRECT` or `RECEIPT_CORRECTION_NEEDED`; correction responses require a replacement receipt number. Final resolution is blocked until that response exists. Admin or Accounting may Confirm Correct after the first response, while only Admin may Void and Replace after the second response using the branch-confirmed receipt number.

`GET /api/dashboard` returns live location-scoped summary metrics for sales, open orders, low/out stock, Accounting queue counts, and notification preview. `GET /api/reports` returns live read-only Sales, Accounting/Reconciliation, Orders, and Inventory summaries, all filtered to assigned locations unless the actor has `locations:all`; `?format=pdf` returns the same authorized data.

`GET /api/stock-transfers` accepts `page` and `pageSize` (1-100) and returns `{ data, meta }`; `transferId` narrows an authorized notification deep link to one transfer. Transfer records use explicit source-or-destination location authorization: an actor assigned to active `SR` may view and manage outbound transfer records for every active destination when the matching action capability is granted, while destination-side actors see only transfers sent to their assigned destinations. Source-side transfer reach does not grant inventory, sales, orders, reports, or other branch data. Stock-transfer actions are `finalize`, `dispatch`, `confirm-receipt`, `report-discrepancy`, `investigate`, and `resolve`. They require the current transfer `version`, lock the transfer row, enforce state transitions, and use serializable transactions. Stock Staff normally creates/finalizes/dispatches SR-to-active-branch documents and investigates discrepancies; Admin may perform those same source-side actions as operational cover. Branch Staff remains destination-scoped for receipt/discrepancy, and Admin performs final discrepancy resolution. Accounting is denied. Transfer responses include `timeline` and `movements` audit arrays only when the caller has `stock-transfers:audit:view`; the built-in Admin and Stock Staff roles have that grant. Other roles receive the operational transfer fields without audit history. Only one draft may exist per destination; duplicate draft creation returns `409 DUPLICATE_DRAFT`.

Stock-transfer transitions create persisted per-user notifications in the same database transaction as the triggering workflow update. `FOR_DISPATCH` alerts Stock Staff assigned to `SR`, `IN_TRANSIT` alerts Branch Staff assigned to the destination, exact `RECEIVED` alerts Stock Staff, `DISCREPANCY_REPORTED` alerts Stock Staff, `UNDER_REVIEW` alerts Admin, `RESOLVED` alerts Admin plus destination Branch Staff, and replacement drafts created from resolved shortages alert Stock Staff.

`GET /api/notifications` returns only the authenticated user's persisted notification rows. `?after=<cursor>` returns rows for that user after the durable monotonic notification cursor, oldest-first, for reconnect and polling catch-up. `GET /api/notifications/stream` opens an authenticated same-origin SSE stream, emits missed rows after `Last-Event-ID` or `?cursor=`, then uses PostgreSQL `LISTEN/NOTIFY` as a wake-up signal while the Notification table remains authoritative. The header consumes the stream and keeps 30-second polling plus focus refetch as correctness fallback. The notification table maps related Stock Transfer, Sale, and Inventory Balance rows to their workflow page and marks an unread row read before navigation; linked Sale rows open the exact receipt record. `PATCH /api/notifications` marks all of that user's unread notifications read. `POST /api/notifications/:notificationId/read` marks one owned notification read. Users cannot read or modify another user's notification rows. `POST /api/notifications/push-subscription` stores the current browser push subscription for the authenticated user when VAPID keys are configured; notification creation schedules best-effort push delivery attempts and records each attempt without marking rows read. Mark-unread, cross-user notification audit, and automatic escalation remain deferred.

Direct sales, stock reservations, and Admin actual-quantity adjustments create durable warning notifications when a branch balance crosses from In Stock to Low Stock, or from Low Stock to Out of Stock. Recipients are active Admin users and active users assigned to that exact branch. The normal notification cursor/SSE/polling pipeline delivers the alert in realtime and avoids repeating alerts while the balance remains in the same threshold state.

## Offline branch sales

The offline endpoints remain implemented, but the customer-facing POS queue/banner and Admin navigation are temporarily disabled. Current POS operation is online-only while the offline operating workflow is deferred.

`POST /api/offline/activations` is Admin-only and activates one current offline device ID for one active branch. Activating a new device for the branch revokes the previous active activation. The activation window is 24 hours and is refreshed by an online branch snapshot request.

`GET /api/offline/snapshot?deviceId=<id>` is Branch Staff-only through `sales:post`, requires the caller's persisted assigned branch and a current active device activation, and returns only minimal branch product stock/price fields. It does not return customer profiles, credentials, Admin data, or cross-branch data.

`POST /api/offline/sync` accepts one queued direct-sale command with `{ deviceId, idempotencyKey, occurredAt, operationType: "DIRECT_SALE", payload }`. The server reserves `(deviceId, idempotencyKey)`, rechecks active Branch Staff assignment and device activation, revalidates the normal direct-sale payload, and then posts through the same direct-sale service. Duplicate same-key/same-payload requests return the stored outcome; same-key/different-payload returns `CONFLICT`. Duplicate receipt, insufficient stock, and other 409 sale conflicts are retained as `NEEDS_REVIEW` submissions instead of creating negative stock. Offline transfer receipt/discrepancy evidence is still deferred.

## Supplier receipts

`POST /api/stock-receipts` accepts `{ reference, supplier, notes?, lines: [{ productId, quantity, unitCost }] }`. `reference` is unique, suppliers and references are non-empty bounded strings, every quantity is a positive integer, every unit cost must be greater than zero, product IDs cannot repeat, and every product must be active. Any malformed line rejects the complete request instead of silently dropping invalid input. Admin or Stock Staff assigned to the active canonical Stock Room can post. The server fixes the destination to `SR`; client input cannot select a branch.

One serializable transaction persists the receipt, immutable item-code/name line snapshots, increments or creates each `SR` balance with the latest received unit cost, and writes a positive `SUPPLIER_RECEIPT` movement with the current actor. Duplicate references return `409 DUPLICATE_REFERENCE` without changing inventory. `GET /api/stock-receipts` is available only to Stock Staff and Admin for monitoring.

## Product list

`POST /api/products` and `PATCH /api/products/:productId` are Admin-only. Active products require a positive current price; inactive products may have null price. `reorderLevel` is stored once on Product and applies to every location. Item code is globally unique and cannot be changed after the product has inventory balances or receipt/transfer/movement history. `DELETE /api/products/:productId` is Admin-only and allowed only for products with no inventory balance rows and no usage/history.

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
  }>;
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  filterOptions: { categories: string[]; brands: string[] };
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

Status is derived from `available = onHand - reserved` as:

- `Out of Stock`: `available <= 0`
- `Low Stock`: `0 < available <= reorderLevel`
- `In Stock`: `available > reorderLevel`

Balance timestamps are ISO 8601 strings.

`PATCH /api/inventory/:balanceId` accepts either `{ "reorderLevel": number }`, which updates the shared Product threshold, or an Admin-only audited unit-cost update `{ "unitCost": number, "reference"?, "reason", "remarks"? }`. `POST /api/inventory/:balanceId/adjustment` accepts `{ "type": "increase" | "decrease", "quantity": number, "reference"?, "reason", "remarks"? }`, requires a positive quantity and non-empty reason, writes a `MANUAL_ADJUSTMENT` movement with optional reference/remarks, increments the balance version, and rejects negative corrections that would make `onHand < reserved` with `409 BELOW_RESERVED`. If the correction moves a balance into low or out status, Admin and users assigned to that location receive persisted inventory-balance notifications.

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
