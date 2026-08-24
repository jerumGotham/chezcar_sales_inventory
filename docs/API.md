<!-- generated-by: gsd-doc-writer -->
# API

## Current status

The application exposes Better Auth handlers plus five authenticated read endpoints. `/api/products` and `/api/inventory` read PostgreSQL through Prisma. Dashboard, customers, and customer orders remain protected mock-fixture responses. No business mutation endpoint is implemented.

All endpoints use same-origin cookie sessions. Public email/password sign-up is disabled.

## Authentication

Better Auth is mounted at `/api/auth/[...all]`. The sign-in UI calls `POST /api/auth/sign-in/email`; sign-out and session endpoints are provided by Better Auth under the same prefix.

Protected application endpoints resolve the Better Auth session, reload the persisted User, require `ACTIVE` status, and authorize against the fixed role and location assignment. They return:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required"
  }
}
```

- `401` for a missing session or inactive/missing user.
- `403` for an authenticated user without an allowed role or required branch assignment.
- `400` for invalid product/inventory query parameters.
- `500` with a generic message for unexpected catalog failures.

## Endpoints

| Method | Path | Data source | Authorization |
| --- | --- | --- | --- |
| `GET`, `POST` | `/api/auth/[...all]` | Better Auth + PostgreSQL | Endpoint-specific; public sign-up disabled |
| `GET` | `/api/dashboard` | Protected mock fixtures | Any active role |
| `GET` | `/api/customers` | Protected mock fixtures | Any active role |
| `GET` | `/api/customer-orders` | Protected mock fixtures | Any active role |
| `GET` | `/api/products` | Prisma Product/InventoryBalance | `ADMIN`, `STOCK_STAFF` |
| `GET` | `/api/inventory` | Prisma Product/InventoryBalance/Location | `ADMIN`, `STOCK_STAFF`, `BRANCH_STAFF` |

The application exports no business `POST`, `PUT`, `PATCH`, or `DELETE` handlers.

## Product list

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
| `location` | string, `all` | Exact Location name for Admin/Stock Staff |
| `status` | `all`, `In Stock`, `Low Stock`, `Out of Stock` | Derived from on-hand and reorder level |

Branch Staff requests are always scoped to the persisted `User.locationId`; a client-supplied location cannot expand this scope. Product pagination occurs before balances are loaded, so a product's matching locations are not split across pages.

Status is derived as:

- `Out of Stock`: `onHand <= 0`
- `Low Stock`: `0 < onHand <= reorderLevel`
- `In Stock`: `onHand > reorderLevel`

`available = max(onHand - reserved, 0)` remains a client display calculation. Balance timestamps are ISO 8601 strings.

## Caching and errors

The handlers do not declare a public cache contract or return cache headers. Callers should treat reads as authenticated, user-scoped responses. TanStack Query currently applies a 30-second client `staleTime`.

No OpenAPI document, rate limit, automated contract test, mutation idempotency, or standardized cross-domain error library exists yet.
