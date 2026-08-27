<!-- generated-by: gsd-doc-writer -->
# API

## Current status

The application exposes Better Auth handlers, authenticated read endpoints, an owner-Admin-only User Management surface, durable Stock Transfer and Stock Room supplier-receiving workflows, customer CRUD/history, customer-order creation, Accounting receipt verification, durable notifications with authenticated SSE wake-ups, and a first-login credential-setup surface. `/api/products`, `/api/inventory`, `/api/customers`, `/api/customer-orders`, `/api/stock-transfers`, `/api/stock-receipts`, `/api/notifications`, and `/api/accounting/receipts` use PostgreSQL through Prisma.

All endpoints use same-origin cookie sessions. Public email/password sign-up is disabled.

## Authentication

Better Auth is mounted at `/api/auth/[...all]` using the public `auth` instance from `lib/server/auth.ts`. That instance has **no Admin plugin**: it provides sign-in, sign-out, and session endpoints only, and public sign-up is refused (`emailAndPassword.disableSignUp`) before any database mutation. A separate server-only Better Auth instance exists in `lib/server/internal-user-auth.ts`; it is deliberately **unmounted** — it exposes only the guarded `createUser`/`setUserPassword` Admin-plugin primitives to trusted server services and can never be reached over HTTP. Regression tests prove that public sign-up and every generic Better Auth admin operation remain unroutable through the public catch-all (`tests/integration/auth-admin-surface.test.ts`).

Protected application endpoints resolve the Better Auth session, reload the persisted User, require `ACTIVE` status, validate the fixed role/location assignment, and authorize against one named capability before parsing query input or executing protected work. They return:

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

Authorization is expressed as named capabilities in `lib/server/policy/access.ts`, evaluated against the reloaded persisted User and Location on every request:

| Capability | ADMIN | STOCK_STAFF | BRANCH_STAFF | ACCOUNTING_STAFF |
| --- | --- | --- | --- | --- |
| `dashboard:view` | ✔ | ✔ | ✔ | ✔ |
| `customers:view` | ✔ | ✔ | ✔ | ✔ |
| `customer-orders:view` | ✔ | ✔ | ✔ | ✔ |
| `sales:post` | ✔ | ✘ | ✔ | ✘ |
| `sales:verify:view` | ✔ | ✘ | ✘ | ✔ |
| `sales:verify` | ✘ | ✘ | ✘ | ✔ |
| `sales:resolve` | ✔ | ✘ | ✘ | ✔ |
| `products:view` | ✔ | ✔ | ✘ | ✘ |
| `inventory:view` | ✔ | ✔ | ✔ | ✘ |
| `inventory-receiving:create` | ✔ | ✔ (active `SR` only) | ✘ | ✘ |
| `users:manage` | ✔ (owner only) | ✘ | ✘ | ✘ |

A persisted assignment that contradicts the fixed matrix (for example Stock Staff not assigned to the active `SR` warehouse, Branch Staff outside the active canonical branches, or a location held by Admin/Accounting) fails closed regardless of role. Exactly one owner Admin may exist; the database partial unique index `User_single_admin_key` backs this invariant.

## Endpoints

| Method | Path | Data source | Authorization |
| --- | --- | --- | --- |
| `GET`, `POST` | `/api/auth/[...all]` | Better Auth + PostgreSQL | Endpoint-specific; public sign-up disabled; generic admin operations unroutable |
| `GET` | `/api/dashboard` | Prisma sales/orders/inventory/accounting plus persisted notifications | `dashboard:view` |
| `GET`, `PATCH` | `/api/notifications` | Prisma Notification inbox | `dashboard:view`; optional `?after=<cursor>` returns catch-up rows |
| `GET` | `/api/notifications/stream` | Prisma Notification catch-up + PostgreSQL `LISTEN/NOTIFY` wake-ups | `dashboard:view`; authenticated server-sent events |
| `GET` | `/api/notifications/push-public-key` | Environment VAPID public key | `dashboard:view` |
| `POST`, `DELETE` | `/api/notifications/push-subscription` | Prisma PushSubscription | `dashboard:view`; current user only |
| `POST` | `/api/notifications/:notificationId/read` | Prisma Notification read timestamp | `dashboard:view` |
| `POST` | `/api/offline/activations` | Prisma OfflineDeviceActivation | `users:manage`; Admin activates one current branch device |
| `GET` | `/api/offline/snapshot?deviceId=<id>` | Prisma InventoryBalance/Product | `sales:post`; Branch Staff assigned branch only |
| `POST` | `/api/offline/sync` | Prisma OfflineSyncOperation/OfflineSaleSubmission/Sale | `sales:post`; Branch Staff assigned branch only |
| `GET`, `POST` | `/api/customers` | Prisma Customer | `customers:view`; Accounting/Stock mutation denied by service policy |
| `GET`, `PATCH`, `DELETE` | `/api/customers/:id` | Prisma Customer, sales, and customer orders | `customers:view`; delete deactivates the customer |
| `GET` | `/api/customer-orders/options?locationId=<branchId>` | Active customers and products with available branch stock | `customer-orders:view`; Admin supplies a branch, Branch Staff scope is persisted |
| `GET`, `POST` | `/api/customer-orders` | Prisma CustomerOrder/Customer/InventoryBalance | `customer-orders:view` plus Branch/Admin mutation policy |
| `GET` | `/api/customer-orders/:orderId` | Single persisted customer order with lines and release/payment summary | `customer-orders:view`; Branch Staff restricted to assigned branch |
| `POST` | `/api/customer-orders/:orderId/:action` | Prisma CustomerOrder/Sale/InventoryMovement | `customer-orders:view`; actions `release`, `cancel` |
| `GET`, `POST` | `/api/sales` | Prisma Sale/SaleLine/InventoryMovement | `customer-orders:view`; Branch/Admin direct sale policy |
| `GET` | `/api/accounting/receipts?page=1&pageSize=10&reviewStatus=all&saleStatus=POSTED` | Prisma Sale/SaleLine/SaleAccountingReview/Location | `sales:verify:view`; server-side filters and pagination |
| `POST` | `/api/accounting/receipts/:saleId/review` | Prisma SaleAccountingReview/Notification | `sales:verify`; Accounting Staff only |
| `POST` | `/api/accounting/receipts/:saleId/resolve` | Prisma Sale/SaleLine/SaleAccountingReview/InventoryMovement/Notification | `sales:resolve`; Admin or Accounting Staff |
| `POST`, `GET` | `/api/accounting/receipts/:saleId/photo` | Coolify persistent receipt-evidence storage | `sales:verify:view`; Admin/Accounting reviewers and assigned Branch mismatch reviewers may read evidence |
| `GET` | `/api/reports` | Prisma sales/orders/accounting/inventory summaries | `reports:view` |
| `GET`, `POST` | `/api/products` | Prisma Product/InventoryBalance | `GET`: `products:view`; `POST`: Admin role |
| `PATCH`, `DELETE` | `/api/products/:productId` | Prisma Product | Admin role |
| `GET` | `/api/inventory` | Prisma Product/InventoryBalance/Location | `inventory:view` |
| `PATCH` | `/api/inventory/:balanceId` | Prisma Product/InventoryBalance | Admin role; reorder-level updates write the shared Product setting, while unit-cost updates remain balance-scoped |
| `POST` | `/api/inventory/:balanceId/adjustment` | Prisma InventoryBalance/InventoryMovement/Notification | Admin role; quantity-only correction |
| `GET` | `/api/inventory/movements` | Prisma InventoryMovement | `inventory:view` |
| `GET`, `POST` | `/api/stock-transfers` | Prisma transfer ledger | `stock-transfers:view` plus role action policy |
| `POST` | `/api/stock-transfers/:id/:action` | Prisma transfer/inventory transaction | `stock-transfers:view` plus role/location/state policy |
| `POST` | `/api/accounting/receipts/:saleId/branch-response` | Prisma Accounting review | Assigned Branch Staff for an unresolved own-branch mismatch |
| `GET`, `POST` | `/api/stock-receipts` | Prisma supplier-receipt/inventory transaction | `GET`: inventory monitor policy; `POST`: `inventory-receiving:create`; Admin/Stock Staff only, destination fixed to `SR` |
| `GET`, `POST` | `/api/users` | Prisma User (+Location) | `users:manage` |
| `PATCH` | `/api/users/:userId` | Prisma User | `users:manage` |
| `POST` | `/api/users/:userId/status` | Prisma User | `users:manage` |
| `POST` | `/api/users/:userId/password` | Better Auth internal + Prisma User | `users:manage` |
| `GET`, `POST` | `/api/credential-setup` | Better Auth + Prisma User | Any authenticated active role |

## Customer orders, sales, and Accounting

`POST /api/customer-orders` creates or reuses a customer, snapshots product item code/name/current price, validates active products, and creates one order in a serializable transaction. Branch Staff may create only for their persisted branch; Admin must select an active branch. The create-screen options endpoint returns only products with positive available stock (`onHand - reserved`) at that branch. Reservation orders validate available branch stock and increment `reserved` without decrementing `onHand`. Waiting-stock orders do not reserve stock. DP reservations require `downpaymentAmount > 0` and globally unique `downpaymentReceiptNumber`.

`POST /api/customer-orders/:orderId/release` requires a final manual receipt number and exact remaining balance payment. Release decrements `onHand`, decrements `reserved`, creates a posted `Sale`, creates `CUSTOMER_ORDER_RELEASE` inventory movements, registers the receipt globally, creates an unverified Accounting review row, and marks the order completed in one transaction.

`POST /api/customer-orders/:orderId/cancel` releases reserved stock. Branch Staff may cancel own-branch no-DP orders. DP cancellation is Admin-only and requires a note.

`POST /api/sales` posts direct branch sales with branch-scoped receipt identity, an optional `discountAmount` not exceeding the subtotal, deducts available branch stock immediately, creates `DIRECT_SALE` inventory movements, and creates an unverified Accounting review row. Branch Staff use their persisted branch; Admin must supply an active `locationId`. Branch Staff select a customer from the shared customer master before clicking `Complete Sale`. `GET /api/accounting/receipts` is visible to Admin and Accounting Staff for the full queue; Branch Staff receive only unresolved mismatches from their persisted branch. It accepts `page`, `pageSize` (5-50), `search` (receipt/booklet/reference/customer/branch), `reviewStatus`, `saleStatus`, `locationId`, `dateFrom`, and `dateTo` filters. A mismatch row includes the validated persisted `reportedComparison`, allowing reviewers to see exact reported quantities, prices, and calculated total without relying on notes. Admin and Accounting Staff can verify or report an unverified receipt mismatch. A mismatch notifies active Branch Staff assigned to the sale branch. Branch must respond with either `ORIGINAL_ENCODING_CORRECT` or `RECEIPT_CORRECTION_NEEDED`; correction responses require a replacement receipt number. Final resolution is blocked until that response exists. Admin or Accounting may Confirm Correct after the first response, while only Admin may Void and Replace after the second response using the branch-confirmed receipt number.

`GET /api/dashboard` returns live role-scoped summary metrics for sales, open orders, low/out stock, Accounting queue counts, and notification preview. `GET /api/reports` returns live read-only Sales, Accounting/Reconciliation, Orders, and Admin-only Inventory summaries; `?format=pdf` returns a PDF-download response for the same authorized data.

Stock-transfer actions are `finalize`, `dispatch`, `confirm-receipt`, `report-discrepancy`, `investigate`, and `resolve`. They require the current transfer `version`, lock the transfer row, enforce state transitions, and use serializable transactions. Stock Staff normally creates/finalizes/dispatches SR-to-active-branch documents and investigates discrepancies; Admin may perform those same source-side actions as operational cover. Branch Staff remains destination-scoped for receipt/discrepancy, and Admin performs final discrepancy resolution. Accounting is denied. Admin transfer responses include `timeline` and `movements` audit arrays for the selected transfer; other roles receive the operational transfer fields without the Admin-only audit view.

Stock-transfer transitions create persisted per-user notifications in the same database transaction as the triggering workflow update. `FOR_DISPATCH` alerts Stock Staff assigned to `SR`, `IN_TRANSIT` alerts Branch Staff assigned to the destination, exact `RECEIVED` alerts Stock Staff, `DISCREPANCY_REPORTED` alerts Stock Staff, `UNDER_REVIEW` alerts Admin, `RESOLVED` alerts Admin plus destination Branch Staff, and replacement drafts created from resolved shortages alert Stock Staff.

`GET /api/notifications` returns only the authenticated user's persisted notification rows. `?after=<cursor>` returns rows for that user after the durable monotonic notification cursor, oldest-first, for reconnect and polling catch-up. `GET /api/notifications/stream` opens an authenticated same-origin SSE stream, emits missed rows after `Last-Event-ID` or `?cursor=`, then uses PostgreSQL `LISTEN/NOTIFY` as a wake-up signal while the Notification table remains authoritative. The header consumes the stream and keeps 30-second polling plus focus refetch as correctness fallback. `PATCH /api/notifications` marks all of that user's unread notifications read. `POST /api/notifications/:notificationId/read` marks one owned notification read. Users cannot read or modify another user's notification rows. `POST /api/notifications/push-subscription` stores the current browser push subscription for the authenticated user when VAPID keys are configured; notification creation schedules best-effort push delivery attempts and records each attempt without marking rows read. Mark-unread, cross-user notification audit, and automatic escalation remain deferred.

Direct sales, stock reservations, and Admin actual-quantity adjustments create durable warning notifications when a branch balance crosses from In Stock to Low Stock, or from Low Stock to Out of Stock. Recipients are active Admin users and active users assigned to that exact branch. The normal notification cursor/SSE/polling pipeline delivers the alert in realtime and avoids repeating alerts while the balance remains in the same threshold state.

## Offline branch sales

The offline endpoints remain implemented, but the customer-facing POS queue/banner and Admin navigation are temporarily disabled. Current POS operation is online-only while the offline operating workflow is deferred.

`POST /api/offline/activations` is Admin-only and activates one current offline device ID for one active canonical branch. Activating a new device for the branch revokes the previous active activation. The activation window is 24 hours and is refreshed by an online branch snapshot request.

`GET /api/offline/snapshot?deviceId=<id>` is Branch Staff-only through `sales:post`, requires the caller's persisted assigned branch and a current active device activation, and returns only minimal branch product stock/price fields. It does not return customer profiles, credentials, Admin data, or cross-branch data.

`POST /api/offline/sync` accepts one queued direct-sale command with `{ deviceId, idempotencyKey, occurredAt, operationType: "DIRECT_SALE", payload }`. The server reserves `(deviceId, idempotencyKey)`, rechecks active Branch Staff assignment and device activation, revalidates the normal direct-sale payload, and then posts through the same direct-sale service. Duplicate same-key/same-payload requests return the stored outcome; same-key/different-payload returns `CONFLICT`. Duplicate receipt, insufficient stock, and other 409 sale conflicts are retained as `NEEDS_REVIEW` submissions instead of creating negative stock. Offline transfer receipt/discrepancy evidence is still deferred.

## Supplier receipts

`POST /api/stock-receipts` accepts `{ reference, supplier, notes?, lines: [{ productId, quantity, unitCost }] }`. `reference` is unique, suppliers and references are non-empty bounded strings, every quantity is a positive integer, every unit cost must be greater than zero, and every product must be active. Admin or Stock Staff assigned to the active canonical Stock Room can post. The server fixes the destination to `SR`; client input cannot select a branch.

One serializable transaction persists the receipt, immutable item-code/name line snapshots, increments or creates each `SR` balance with the latest received unit cost, and writes a positive `SUPPLIER_RECEIPT` movement with the current actor. Duplicate references return `409 DUPLICATE_REFERENCE` without changing inventory. `GET /api/stock-receipts` is available only to Stock Staff and Admin for monitoring.

## Product list

`POST /api/products` and `PATCH /api/products/:productId` are Admin-only. Active products require a positive current price; inactive products may have null price. `reorderLevel` is stored once on Product and applies to every location. Item code is globally unique and cannot be changed after the product has inventory balances or receipt/transfer/movement history. `DELETE /api/products/:productId` is Admin-only and allowed only for products with no inventory balance rows and no usage/history.

`GET /api/products` accepts:

| Parameter | Type/default | Behavior |
| --- | --- | --- |
| `page` | positive integer, `1` | Requested page, clamped to the final page |
| `pageSize` | integer `1..100`, `10` | Products per page |
| `itemCode` | string, empty | Case-insensitive substring |
| `name` | string, empty | Case-insensitive substring |
| `category` | string, `all` | Exact category or all |
| `status` | `all`, `Active`, `Inactive` | Product status |

Response:

```ts
type ProductsResponse = {
  data: Array<{
    id: string;
    itemCode: string;
    name: string;
    category: string;
    price: number;
    reorderLevel: number;
    status: "Active" | "Inactive";
    description?: string;
  }>;
  meta: { page: number; pageSize: number; total: number; totalPages: number };
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
| `location` | string, `all` | Admin only: `all` or one active canonical Location ID, code, or exact name |
| `status` | `all`, `In Stock`, `Low Stock`, `Out of Stock` | Derived from available stock and reorder level |

Inventory independently requires the named `inventory:view` capability. Accounting Staff is denied with `403`. Branch Staff requests are always scoped to the persisted active branch and Stock Staff requests are always scoped to persisted `SR`; client-supplied locations, including duplicate or reordered values, cannot expand either scope. Admin may request all locations or one active canonical location; conflicting duplicate Admin scope values return `400`. Product pagination occurs before balances are loaded, so a product's matching locations are not split across pages.

Status is derived from `available = onHand - reserved` as:

- `Out of Stock`: `available <= 0`
- `Low Stock`: `0 < available <= reorderLevel`
- `In Stock`: `available > reorderLevel`

Balance timestamps are ISO 8601 strings.

`PATCH /api/inventory/:balanceId` accepts either `{ "reorderLevel": number }`, which updates the shared Product threshold, or an Admin-only audited unit-cost update `{ "unitCost": number, "reference"?, "reason", "remarks"? }`. `POST /api/inventory/:balanceId/adjustment` accepts `{ "type": "increase" | "decrease", "quantity": number, "reference"?, "reason", "remarks"? }`, requires a positive quantity and non-empty reason, writes a `MANUAL_ADJUSTMENT` movement with optional reference/remarks, increments the balance version, and rejects negative corrections that would make `onHand < reserved` with `409 BELOW_RESERVED`. If the correction moves a balance into low or out status, Admin and users assigned to that location receive persisted inventory-balance notifications.

`GET /api/inventory/movements` accepts `page`, `pageSize`, `product` item code or `all`, `location`, `type`, and `reference`. It applies the same persisted location scope as `/api/inventory`; Admin may see all or one canonical location, Stock Staff remains scoped to `SR`, Branch Staff remains scoped to their persisted branch, and Accounting is denied.

The response `summary` contains user-facing totals for the active authorized location scope: `totalProducts`, `totalUnits`, `needsRestock`, and role-scoped `incomingItems`. This is the total quantity still in transit, not a document count and not sellable stock. For Branch Staff it includes only transfers destined for the persisted branch; Admin sees the selected location scope and Stock Staff sees items in transit to branches.

## User management (owner Admin only)

All four routes require the `users:manage` capability, which only the owner Admin holds. Every failure uses the stable envelope `{ "error": { "code", "message" } }` with statuses `401`, `403`, `404`, `409`, or `400`.

### `GET /api/users`

Query parameters validated with Zod (`lib/contracts/users.ts`):

| Parameter | Type/default | Behavior |
| --- | --- | --- |
| `page` | positive integer, `1` | Requested page; page size is fixed at 10 |
| `search` | string ≤200, optional | Case-insensitive match on name or email |
| `role` | `STOCK_STAFF`, `BRANCH_STAFF`, `ACCOUNTING_STAFF`, optional | Staff-role filter |
| `status` | `ACTIVE`, `INACTIVE`, optional | Account status filter |
| `location` | `SR`, `QC`, `BL`, `LU`, `VC`, `SP`, `none`, optional | Canonical location code or unassigned filter |

Response:

```ts
type UserListResponseDto = {
  data: Array<{
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "STOCK_STAFF" | "BRANCH_STAFF" | "ACCOUNTING_STAFF";
    status: "ACTIVE" | "INACTIVE";
    isOwner: boolean;
    location: { id: string; code: string; name: string; type: "WAREHOUSE" | "BRANCH" } | null;
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

Body is a discriminated union by `role`; only the three staff roles are creatable:

- `STOCK_STAFF`: `name`, `email`, `temporaryPassword` (8–128 chars, at least one letter and digit). The location resolves server-side to the active `SR` warehouse on every write.
- `BRANCH_STAFF`: `name`, `email`, `temporaryPassword`, required `locationId` (must be an active canonical branch).
- `ACCOUNTING_STAFF`: `name`, `email`, `temporaryPassword`. Hostile location fields cannot persist because the schema strips them.

Duplicate emails return `409 EMAIL_IN_USE` with exactly one user/account left behind. Creation runs the guarded internal Better Auth `createUser` primitive, arms `credentialSetupRequired`, and returns the safe DTO. The response never contains the temporary password.

### `PATCH /api/users/:userId`

Accepts optional `name`, `email`, `role` (staff roles only), and `locationId`. The service computes the full resulting role/location assignment inside one transaction after a `FOR UPDATE` row lock, keeping the current branch only when the target already holds one as Branch Staff. Changing the role or location of an active user deletes all of their sessions in the same transaction (immediate revocation); the user must sign in again to receive the new access context.

### `POST /api/users/:userId/status`

Body `{ "status": "ACTIVE" | "INACTIVE" }`. Deactivation sets `User.status = INACTIVE` and deletes all target sessions atomically; reactivation restores sign-in ability. Repeated requests with the same status are idempotent no-ops.

### `POST /api/users/:userId/password`

Body `{ "newPassword": string }`. Runs the guarded internal `setUserPassword` primitive first, then re-arms `credentialSetupRequired` and deletes all target sessions in one transaction. Repeated resets are idempotent. Old cookies stop working immediately; the new temporary password must be shared through an offline channel and is never echoed in any response.

## First-login credential setup

### `GET /api/credential-setup`

Authenticated current-user query gated only by `dashboard:view` (an all-roles capability), making the route exactly an authenticated-active-persisted-identity check with no resource grant. Returns whether `credentialSetupRequired` is armed for the caller.

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
