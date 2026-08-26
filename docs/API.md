<!-- generated-by: gsd-doc-writer -->
# API

## Current status

The application exposes Better Auth handlers, authenticated read endpoints, an owner-Admin-only User Management surface, durable Stock Transfer and Stock Room supplier-receiving workflows, and a first-login credential-setup surface. `/api/products`, `/api/inventory`, `/api/stock-transfers`, and `/api/stock-receipts` use PostgreSQL through Prisma. Dashboard, customers, and customer orders remain protected mock-fixture responses.

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
| `products:view` | ✔ | ✔ | ✘ | ✘ |
| `inventory:view` | ✔ | ✔ | ✔ | ✘ |
| `inventory-receiving:create` | ✘ | ✔ (active `SR` only) | ✘ | ✘ |
| `users:manage` | ✔ (owner only) | ✘ | ✘ | ✘ |

A persisted assignment that contradicts the fixed matrix (for example Stock Staff not assigned to the active `SR` warehouse, Branch Staff outside the active canonical branches, or a location held by Admin/Accounting) fails closed regardless of role. Exactly one owner Admin may exist; the database partial unique index `User_single_admin_key` backs this invariant.

## Endpoints

| Method | Path | Data source | Authorization |
| --- | --- | --- | --- |
| `GET`, `POST` | `/api/auth/[...all]` | Better Auth + PostgreSQL | Endpoint-specific; public sign-up disabled; generic admin operations unroutable |
| `GET` | `/api/dashboard` | Prisma sales/orders/inventory/accounting plus persisted notifications | `dashboard:view` |
| `GET`, `PATCH` | `/api/notifications` | Prisma Notification inbox | `dashboard:view` |
| `POST` | `/api/notifications/:notificationId/read` | Prisma Notification read timestamp | `dashboard:view` |
| `GET`, `POST` | `/api/customers` | Prisma Customer | `customers:view`; Accounting/Stock mutation denied by service policy |
| `GET`, `POST` | `/api/customer-orders` | Prisma CustomerOrder/Customer/InventoryBalance | `customer-orders:view` plus Branch/Admin mutation policy |
| `POST` | `/api/customer-orders/:orderId/:action` | Prisma CustomerOrder/Sale/InventoryMovement | `customer-orders:view`; actions `release`, `cancel` |
| `GET`, `POST` | `/api/sales` | Prisma Sale/SaleLine/InventoryMovement | `customer-orders:view`; Branch/Admin direct sale policy |
| `POST` | `/api/sales/:saleId/review` | Prisma SaleAccountingReview | `customer-orders:view`; Accounting/Admin review policy |
| `GET` | `/api/reports` | Prisma sales/orders/accounting/inventory summaries | `reports:view` |
| `GET`, `POST` | `/api/products` | Prisma Product/InventoryBalance | `GET`: `products:view`; `POST`: Admin role |
| `PATCH`, `DELETE` | `/api/products/:productId` | Prisma Product | Admin role |
| `GET` | `/api/inventory` | Prisma Product/InventoryBalance/Location | `inventory:view` |
| `PATCH` | `/api/inventory/:balanceId` | Prisma InventoryBalance | Admin role |
| `POST` | `/api/inventory/:balanceId/adjustment` | Prisma InventoryBalance/InventoryMovement/Notification | Admin role |
| `GET` | `/api/inventory/movements` | Prisma InventoryMovement | `inventory:view` |
| `GET`, `POST` | `/api/stock-transfers` | Prisma transfer ledger | `stock-transfers:view` plus role action policy |
| `POST` | `/api/stock-transfers/:id/:action` | Prisma transfer/inventory transaction | `stock-transfers:view` plus role/location/state policy |
| `GET`, `POST` | `/api/stock-receipts` | Prisma supplier-receipt/inventory transaction | `GET`: inventory monitor policy; `POST`: `inventory-receiving:create` and Stock Staff `SR` enforcement |
| `GET`, `POST` | `/api/users` | Prisma User (+Location) | `users:manage` |
| `PATCH` | `/api/users/:userId` | Prisma User | `users:manage` |
| `POST` | `/api/users/:userId/status` | Prisma User | `users:manage` |
| `POST` | `/api/users/:userId/password` | Better Auth internal + Prisma User | `users:manage` |
| `GET`, `POST` | `/api/credential-setup` | Better Auth + Prisma User | Any authenticated active role |

## Customer orders, sales, and Accounting

`POST /api/customer-orders` creates or reuses a customer, snapshots product item code/name/current price, validates active products, and creates one order in a serializable transaction. Branch Staff may create only for their persisted branch; Admin is reserved for broad monitoring and future corrections. Reservation orders validate available branch stock (`onHand - reserved`) and increment `reserved` without decrementing `onHand`. Waiting-stock orders do not reserve stock. DP reservations require `downpaymentAmount > 0` and globally unique `downpaymentReceiptNumber`.

`POST /api/customer-orders/:orderId/release` requires a final manual receipt number and exact remaining balance payment. Release decrements `onHand`, decrements `reserved`, creates a posted `Sale`, creates `CUSTOMER_ORDER_RELEASE` inventory movements, registers the receipt globally, creates an unverified Accounting review row, and marks the order completed in one transaction.

`POST /api/customer-orders/:orderId/cancel` releases reserved stock. Branch Staff may cancel own-branch no-DP orders. DP cancellation is Admin-only and requires a note.

`POST /api/sales` posts direct branch sales with globally unique `manualReceiptNumber`, deducts available branch stock immediately, creates `DIRECT_SALE` inventory movements, and creates an unverified Accounting review row. `POST /api/sales/:saleId/review` lets Accounting Staff or Admin mark a sale `VERIFIED` or `FLAGGED`; flagged reviews require category and notes.

`GET /api/dashboard` returns live role-scoped summary metrics for sales, open orders, low/out stock, Accounting queue counts, and notification preview. `GET /api/reports` returns live read-only Sales, Accounting/Reconciliation, Orders, and Admin-only Inventory summaries; `?format=pdf` returns a PDF-download response for the same authorized data.

Stock-transfer actions are `finalize`, `dispatch`, `confirm-receipt`, `report-discrepancy`, `investigate`, and `resolve`. They require the current transfer `version`, lock the transfer row, enforce state transitions, and use serializable transactions. Stock Staff creates/finalizes/dispatches SR-to-active-branch documents, Branch Staff is destination-scoped for receipt/discrepancy, and Admin alone resolves investigated discrepancies. Accounting is denied. Admin transfer responses include `timeline` and `movements` audit arrays for the selected transfer; other roles receive the operational transfer fields without the Admin-only audit view.

Stock-transfer transitions create persisted per-user notifications in the same database transaction as the triggering workflow update. `FOR_DISPATCH` alerts Stock Staff assigned to `SR`, `IN_TRANSIT` alerts Branch Staff assigned to the destination, exact `RECEIVED` alerts Stock Staff, `DISCREPANCY_REPORTED` alerts Stock Staff, `UNDER_REVIEW` alerts Admin, `RESOLVED` alerts Admin plus destination Branch Staff, and replacement drafts created from resolved shortages alert Stock Staff.

`GET /api/notifications` returns only the authenticated user's persisted notification rows. The current client polls this endpoint every 30 seconds and refetches on window focus; SSE and browser push are still deferred. `PATCH /api/notifications` marks all of that user's unread notifications read. `POST /api/notifications/:notificationId/read` marks one owned notification read. Users cannot read or modify another user's notification rows. Mark-unread, push delivery, cross-user notification audit, and automatic escalation remain deferred.

## Supplier receipts

`POST /api/stock-receipts` accepts `{ reference, supplier, notes?, lines: [{ productId, quantity }] }`. `reference` is unique, suppliers and references are non-empty bounded strings, every quantity is a positive integer, and every product must be active. Only Stock Staff assigned to the active canonical Stock Room can post. The server fixes the destination to `SR`; client input cannot select a branch.

One serializable transaction persists the receipt, immutable item-code/name line snapshots, increments or creates each `SR` balance, and writes a positive `SUPPLIER_RECEIPT` movement with the current actor. Duplicate references return `409 DUPLICATE_REFERENCE` without changing inventory. `GET /api/stock-receipts` is available only to Stock Staff and Admin for monitoring; it does not grant posting to Admin.

## Product list

`POST /api/products` and `PATCH /api/products/:productId` are Admin-only. Active products require a positive current price; inactive products may have null price. Item code is globally unique and cannot be changed after the product has inventory balances or receipt/transfer/movement history. `DELETE /api/products/:productId` is Admin-only and allowed only for products with no inventory balance rows and no usage/history.

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

`PATCH /api/inventory/:balanceId` accepts `{ "reorderLevel": number }` and is Admin-only. `POST /api/inventory/:balanceId/adjustment` accepts `{ "type": "increase" | "decrease", "quantity": number, "reference"?, "reason", "remarks"? }`, requires a non-empty reason, writes a `MANUAL_ADJUSTMENT` movement with optional reference/remarks, increments the balance version, and rejects negative corrections that would make `onHand < reserved` with `409 BELOW_RESERVED`. If the correction moves a balance into low or out status, Admin and users assigned to that location receive persisted inventory-balance notifications.

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
