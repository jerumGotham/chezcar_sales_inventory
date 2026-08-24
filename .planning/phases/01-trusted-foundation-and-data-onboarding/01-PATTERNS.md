# Phase 1: Trusted Foundation and Data Onboarding - Pattern Map

**Mapped:** 2026-08-25
**Files classified:** 50 new/modified files or planner-selected equivalents
**Analogs found:** 35 / 50

> Paths not named verbatim by `01-CONTEXT.md`, `01-RESEARCH.md`, or `01-VALIDATION.md` are recommended seams, not locked filenames. The planner may consolidate narrow route files, but must preserve the browser-safe contract → authenticated route → server-only service → Prisma dependency direction.

## Scope-Derived File Set

The upstream artifacts explicitly name the test files, `vitest.config.ts`, existing schema/seed/auth/menu/proxy/users files, and the recommended top-level directories. They imply narrow user lifecycle routes, a server service, browser-safe DTOs, a denied page, a first-login client island, a reviewed seed artifact, and documentation updates.

Workbook fixture generation is gated: do not produce an approved canonical fixture until the owner resolves the `SR` source, `BL BEFORE`, duplicate item codes, invalid quantities, and missing/conflicting prices.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `package.json` | config | batch | `package.json` scripts/dependency blocks | exact-modification |
| `package-lock.json` | config | batch | existing npm lockfile | generated |
| `vitest.config.ts` | config | batch | none | no analog |
| `scripts/data-onboarding/workbook-profile.ts` | utility | file-I/O/transform | `prisma/seed.mjs` | partial |
| `scripts/data-onboarding/canonicalize.ts` | utility | transform | `lib/server/catalog.ts` Zod boundary | partial |
| `scripts/data-onboarding/generate-seed.ts` | utility | file-I/O/transform | `prisma/seed.mjs` | partial |
| `scripts/data-onboarding/resolutions.json` | config | file-I/O | none | no analog |
| `scripts/data-onboarding/source-mapping.json` | config | transform | none | no analog |
| `prisma/fixtures/opening-catalog.json` | config/fixture | batch | `prisma/seed.mjs:6-39` | role-match |
| `prisma/schema.prisma` | model | CRUD | current `prisma/schema.prisma` | exact-modification |
| `prisma/migrations/<timestamp>_trusted_foundation/migration.sql` | migration | batch | initial foundation migration | exact |
| `prisma/seed.mjs` | utility | batch/CRUD | current `prisma/seed.mjs` | exact-modification |
| `lib/server/services/catalog-reset.ts` | service | batch/CRUD | `prisma/seed.mjs` + `lib/server/catalog.ts` | role-match |
| `lib/contracts/users.ts` | model/contract | transform | `lib/catalog.ts` | exact-role |
| `lib/server/policy/access.ts` | utility/policy | request-response | `lib/server/authorization.ts` | role-match |
| `lib/server/authorization.ts` | middleware | request-response | current authorization module | exact-modification |
| `lib/server/auth.ts` | config/provider | request-response | current Better Auth config | exact-modification |
| `lib/server/services/users.ts` | service | CRUD | `lib/server/catalog.ts` | role-match |
| `app/api/users/route.ts` | route/controller | request-response/CRUD | `app/api/inventory/route.ts` | exact-role |
| `app/api/users/[userId]/route.ts` | route/controller | request-response/CRUD | `app/api/inventory/route.ts` | role-match |
| `app/api/users/[userId]/status/route.ts` | route/controller | request-response/CRUD | `app/api/inventory/route.ts` | role-match |
| `app/api/users/[userId]/password/route.ts` | route/controller | request-response/CRUD | `app/api/inventory/route.ts` | role-match |
| `app/api/credential-setup/route.ts` | route/controller | request-response/CRUD | auth handler + inventory route | partial |
| `proxy.ts` | middleware | request-response | current `proxy.ts` | exact-modification |
| `proxy.test.ts` | test | request-response | none | no analog |
| `lib/menu.ts` | config | transform | current `lib/menu.ts` | exact-modification |
| `components/app-sidebar.tsx` | component | transform/event-driven | current sidebar | exact-modification |
| `app/access-denied/page.tsx` | component/page | request-response | `app/sign-in/page.tsx` + `PageShell` | role-match |
| `app/users/page.tsx` | component/page | request-response | current users page shell | exact-modification |
| `app/users/users-client.tsx` | component | request-response/event-driven | `app/products/page.tsx` | exact-role |
| `app/sign-in/sign-in-form.tsx` | component | request-response/event-driven | current sign-in form | exact-modification |
| `components/credential-setup-dialog.tsx` | component | request-response/event-driven | sign-in form + existing Dialog usage | role-match |
| `scripts/data-onboarding/workbook-profile.test.ts` | test | file-I/O/transform | none | no analog |
| `scripts/data-onboarding/canonicalize.test.ts` | test | transform | none | no analog |
| `scripts/data-onboarding/generate-seed.test.ts` | test | file-I/O/transform | none | no analog |
| `lib/server/services/catalog-reset.test.ts` | test | batch/CRUD | none | no analog |
| `lib/server/authorization.test.ts` | test | request-response | none | no analog |
| `tests/helpers/database.ts` | test utility | batch/CRUD | `lib/server/prisma.ts` | partial |
| `tests/helpers/factories.ts` | test utility | CRUD | `prisma/seed.mjs` | partial |
| `tests/helpers/requests.ts` | test utility | request-response | route `Request` construction | partial |
| `tests/fixtures/workbook-edge-cases.xlsx` | test fixture | file-I/O | none | no analog |
| `tests/integration/seed.test.ts` | test | batch/CRUD | none | no analog |
| `tests/integration/inventory-scope.test.ts` | test | request-response/CRUD | none | no analog |
| `tests/integration/user-management.test.ts` | test | request-response/CRUD | none | no analog |
| `tests/integration/session-revocation.test.ts` | test | request-response/CRUD | none | no analog |
| `tests/integration/credential-setup.test.ts` | test | request-response/CRUD | none | no analog |
| `docs/API.md` | config/documentation | transform | current API document | exact-modification |
| `docs/DATABASE.md` | config/documentation | transform | current database document | exact-modification |
| `docs/TESTING.md` | config/documentation | transform | current testing document | exact-modification |
| `docs/ARCHITECTURE.md` / `docs/CONFIGURATION.md` | config/documentation | transform | current documents | exact-modification |

## Pattern Assignments

### Data-onboarding tooling and reviewed artifacts

**Apply to:**

- `scripts/data-onboarding/workbook-profile.ts`
- `scripts/data-onboarding/canonicalize.ts`
- `scripts/data-onboarding/generate-seed.ts`
- `scripts/data-onboarding/resolutions.json`
- `scripts/data-onboarding/source-mapping.json`
- `prisma/fixtures/opening-catalog.json`

**Closest analog:** `prisma/seed.mjs` for deterministic inputs and explicit failure; `lib/server/catalog.ts` for Zod validation. There is no existing workbook/file-processing analog.

**Imports and validation pattern** (`lib/server/catalog.ts:1-12`):

```typescript
import "server-only";

import { Prisma, type UserRole } from "@prisma/client";
import { z } from "zod";

import type {
  InventoryApiResponse,
  InventoryRow,
  InventoryStatus,
  ProductsApiResponse,
} from "@/lib/catalog";
import { prisma } from "@/lib/server/prisma";
```

For scripts, omit `server-only` and Prisma from the profile/generate stages. Use Zod at each raw → finding → approved canonical boundary. The profiler must be read-only and must not import `lib/server/prisma.ts`.

**Fail-closed environment/input pattern** (`prisma/seed.mjs:41-58`):

```javascript
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME?.trim();

if (!email || !password || !name) {
  throw new Error(
    "SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and SEED_ADMIN_NAME are required",
  );
}

if (email.endsWith(".invalid") || password.startsWith("replace-with")) {
  throw new Error("Replace the example Admin credentials before seeding");
}
```

Copy the explicit refusal shape, not these credential fields. Generation must throw while any blocking review record is unresolved; reload must throw unless the environment and database target are positively recognized as development/test.

**Deterministic keyed-load pattern** (`prisma/seed.mjs:90-128`):

```javascript
const locationByCode = new Map();
const productByCode = new Map();

for (const location of locations) {
  const record = await prisma.location.upsert({
    where: { code: location.code },
    update: location,
    create: location,
  });
  locationByCode.set(location.code, record.id);
}

for (const [itemCode, locationCode, onHand, reserved, reorderLevel, unitCost] of balances) {
  const productId = productByCode.get(itemCode);
  const locationId = locationByCode.get(locationCode);

  await prisma.inventoryBalance.upsert({
    where: { locationId_productId: { locationId, productId } },
    update: { onHand, reserved, reorderLevel, unitCost },
    create: { productId, locationId, onHand, reserved, reorderLevel, unitCost },
  });
}
```

Preserve stable business keys and rerun equivalence. Replace inline arrays with the reviewed canonical artifact only after the owner checkpoint. Do not parse or repair the XLSX inside the database write transaction.

**Exit/error pattern** (`prisma/seed.mjs:133-139`):

```javascript
main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Never log workbook-sensitive raw rows or credentials. Reports may contain source coordinates and reviewed values, but password fields must never enter these artifacts.

---

### Prisma schema, additive migration, seed, and scoped reset

**Apply to:**

- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_trusted_foundation/migration.sql`
- `prisma/seed.mjs`
- `lib/server/services/catalog-reset.ts`

**Schema conventions** (`prisma/schema.prisma:32-47`, `63-79`):

```prisma
model Location {
  id                String             @id @default(cuid())
  code              String             @unique
  name              String
  type              LocationType
  isActive          Boolean            @default(true)
  inventoryBalances InventoryBalance[]
  users             User[]
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
}

model InventoryBalance {
  id         String   @id @default(cuid())
  locationId String
  productId  String
  onHand     Int      @default(0)
  location   Location @relation(fields: [locationId], references: [id])
  product    Product  @relation(fields: [productId], references: [id])

  @@unique([locationId, productId])
  @@index([productId])
}
```

Keep canonical location codes in `Location.code`; do not create one column per spreadsheet location or monthly sheet.

**Hand-authored constraint pattern** (`prisma/migrations/20260824000000_initial_foundation/migration.sql:44-46`, `61-65`):

```sql
CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
CONSTRAINT "Product_price_nonnegative" CHECK ("price" >= 0)

CONSTRAINT "InventoryBalance_reserved_nonnegative" CHECK ("reserved" >= 0),
CONSTRAINT "InventoryBalance_reorderLevel_nonnegative" CHECK ("reorderLevel" >= 0),
CONSTRAINT "InventoryBalance_unitCost_nonnegative" CHECK ("unitCost" >= 0),
CONSTRAINT "InventoryBalance_version_positive" CHECK ("version" > 0)
```

Use an additive SQL `CHECK` for the row-local User role/nullability rule. Validate `STOCK_STAFF → SR` and `BRANCH_STAFF → BRANCH` in the service transaction because a row-local check cannot inspect `Location`.

**Server-only Prisma boundary** (`lib/server/prisma.ts:1-13`):

```typescript
import "server-only";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
```

The reset service imports this singleton; browser code and data-onboarding profile/generate scripts do not. Reset only catalog/opening balances, preserve auth/users, execute in one short transaction, and refuse production/unknown targets before the first write.

---

### Browser-safe user contracts

**Apply to:** `lib/contracts/users.ts`

**Analog:** `lib/catalog.ts:1-23`, `52-57`.

```typescript
export type ProductStatus = "Active" | "Inactive";

export type ProductRow = {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  price: number;
  status: ProductStatus;
};

export type ProductsApiResponse = {
  data: ProductRow[];
  meta: PaginationMeta;
  summary: {
    totalProducts: number;
    activeProducts: number;
    inactiveProducts: number;
  };
};
```

Define fixed browser labels and wire values separately. User DTOs must not expose password hashes, session tokens, Better Auth internals, or mutable permission arrays. Include pagination, staff-only counts, role, status, location scope, last sign-in, and an immutable owner-Admin marker/capability needed to suppress mutation controls.

**Same-origin client error pattern** (`lib/catalog.ts:61-80`):

```typescript
async function fetchJson<T>(path: string, query: Record<string, QueryValue>) {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  const response = await fetch(`${path}?${searchParams.toString()}`, {
    credentials: "same-origin",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? "Unable to load data");
  }

  return (await response.json()) as T;
}
```

Extend this pattern for JSON mutation bodies and typed operation errors; never return a submitted temporary password in a response.

---

### Persisted authorization context and central policy

**Apply to:**

- `lib/server/authorization.ts`
- `lib/server/policy/access.ts`
- `proxy.ts`
- every user/credential route and service

**Persisted active-user guard** (`lib/server/authorization.ts:24-56`):

```typescript
export async function requireUser(
  headers: Headers,
  allowedRoles: readonly UserRole[],
): Promise<AuthContext> {
  const session = await auth.api.getSession({ headers });

  if (!session) {
    throw new AuthenticationError("Authentication required");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true, locationId: true },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new AuthenticationError("Active user account required");
  }

  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError("Insufficient permissions");
  }

  return { userId: user.id, role: user.role, locationId: user.locationId };
}
```

Evolve this toward a capability/action policy, but keep the database reload. Menu state and proxy redirects must derive from the same fixed matrix; neither replaces route/service checks.

**Standard denial mapping** (`lib/server/authorization.ts:58-74`):

```typescript
export function authorizationErrorResponse(error: unknown) {
  if (error instanceof AuthenticationError) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: error.message } },
      { status: 401 },
    );
  }

  if (error instanceof AuthorizationError) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: error.message } },
      { status: 403 },
    );
  }

  throw error;
}
```

Use 401 for missing/revoked/inactive sessions and 403 for an authenticated but unauthorized principal. The denied page must never receive protected data in redirect parameters.

**Persisted scope wins over request scope** (`lib/server/catalog.ts:141-153`):

```typescript
const scopeLocationId =
  user.role === "BRANCH_STAFF" ? user.locationId ?? "__unassigned__" : null;

const balanceWhere = {
  locationId: scopeLocationId ?? undefined,
  location:
    scopeLocationId || query.location === "all"
      ? undefined
      : { name: query.location },
};
```

Do not copy the sentinel as the final policy design. Do copy the invariant that hostile client scope cannot broaden persisted scope.

**Proxy authentication shape** (`proxy.ts:6-27`):

```typescript
const session = await auth.api.getSession({ headers: request.headers });
const isSignIn = request.nextUrl.pathname === "/sign-in";
const user = session
  ? await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, status: true },
    })
  : null;

if ((!session || !user || user.status !== "ACTIVE") && !isSignIn) {
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(signInUrl);
}
```

Replace hard-coded route clauses at `proxy.ts:29-46` with central policy. Authenticated denial goes to `/access-denied`; unauthenticated/inactive/revoked access goes to `/sign-in`.

---

### Thin user and credential routes

**Apply to:**

- `app/api/users/route.ts`
- `app/api/users/[userId]/route.ts`
- `app/api/users/[userId]/status/route.ts`
- `app/api/users/[userId]/password/route.ts`
- `app/api/credential-setup/route.ts`

**Analog:** `app/api/inventory/route.ts:1-38`.

```typescript
import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireUser,
} from "@/lib/server/authorization";
import { inventoryListQuerySchema, listInventory } from "@/lib/server/catalog";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers, ["ADMIN"]);
    const query = inventoryListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );

    return Response.json(await listInventory(query, user));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: { code: "INVALID_QUERY", message: "Invalid filters" } },
        { status: 400 },
      );
    }

    try {
      return authorizationErrorResponse(error);
    } catch (unexpectedError) {
      console.error("Unable to complete operation", unexpectedError);
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Unable to complete operation" } },
        { status: 500 },
      );
    }
  }
}
```

Adapt schemas/messages per operation. Parse route params and bodies with Zod, require owner Admin, then delegate. Keep role/location invariants and owner-Admin immutability in the service too, so alternate callers cannot bypass them.

Do not expose Better Auth's generic Admin endpoints directly. `app/api/auth/[...all]/route.ts:1-5` shows the generic mounting pattern, but user-management routes must remain application-owned and narrow:

```typescript
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/server/auth";
export const { GET, POST } = toNextJsHandler(auth);
```

That excerpt is a boundary warning, not the analog to copy for user operations.

---

### User lifecycle service and Better Auth integration

**Apply to:** `lib/server/services/users.ts`, `lib/server/auth.ts`

**Server module pattern** (`lib/server/catalog.ts:1-12`): use `import "server-only"`, Prisma types, Zod, browser-safe contract imports, and the shared Prisma singleton.

**Current Better Auth field configuration** (`lib/server/auth.ts:8-37`):

```typescript
export const auth = betterAuth({
  appName: "Chezcar Sales & Inventory",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  disableSignUp: true,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: {
        type: ["ADMIN", "STOCK_STAFF", "BRANCH_STAFF", "ACCOUNTING_STAFF"],
        required: true,
        defaultValue: "BRANCH_STAFF",
        input: false,
      },
      status: {
        type: ["ACTIVE", "INACTIVE"],
        required: true,
        defaultValue: "ACTIVE",
        input: false,
      },
    },
  },
});
```

Keep `disableSignUp`, fixed uppercase roles, and `input: false`. Hand-review any Admin-plugin schema additions; do not introduce lowercase plugin roles or a second status authority.

**Atomic access-change/revocation pattern:** no exact local analog exists. Use one short Prisma transaction for application user fields and database session deletion when atomicity is required:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: userId }, data: userChanges });
  await tx.session.deleteMany({ where: { userId } });
});
```

For credential creation/reset, use Better Auth's supported APIs rather than direct password hashing. Deactivation and role/location change succeed only when old sessions are unusable. Reject target `ADMIN`, attempted second-Admin creation, invalid role/location combinations, and unsupported location codes before mutation. Never log or return temporary passwords.

---

### Role-aware menu and shell

**Apply to:** `lib/menu.ts`, `components/app-sidebar.tsx`, and the server-derived shell integration selected by the planner.

**Current menu metadata** (`lib/menu.ts:17-33`):

```typescript
export const menus = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Products", href: "/products", icon: Package },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Users & Roles", href: "/users", icon: UserCog },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;
```

Rename to `User Management`, remove custom-role navigation, attach policy/capability metadata, and derive the allowed list from server-loaded context. Do not put independent role arrays on each menu item if the central policy can answer the capability.

**Sidebar rendering pattern** (`components/app-sidebar.tsx:74-113`):

```tsx
const renderMenu = (showLabels: boolean) => (
  <nav className="space-y-2">
    {menus.map((menu) => {
      const Icon = menu.icon;
      const active =
        pathname === menu.href || pathname.startsWith(`${menu.href}/`);

      return (
        <Link
          key={menu.href}
          href={menu.href}
          aria-label={menu.label}
          title={menu.label}
          className={cn(buttonVariants({ variant: "ghost" }), "...")}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {showLabels ? <span className="truncate">{menu.label}</span> : null}
        </Link>
      );
    })}
  </nav>
);
```

Change the sidebar to receive an already-filtered menu/capability model. Preserve active-link, desktop/mobile, accessible label, and `cn()` patterns. Do not fetch capabilities in an effect or briefly render all entries.

---

### Access-denied page

**Apply to:** `app/access-denied/page.tsx`

**Page export pattern** (`app/sign-in/page.tsx:1-13`):

```tsx
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl: requestedCallbackUrl } = await searchParams;
  const callbackUrl =
    requestedCallbackUrl?.startsWith("/") &&
    !requestedCallbackUrl.startsWith("//")
      ? requestedCallbackUrl
      : "/dashboard";
```

Keep the denied page a server component. Render one restrained `Card` with `ShieldX`, the approved copy, and a `next/link` button to `/dashboard`. Do not accept/render denied resource names, query values, cached records, or a retry URL. The existing authenticated shell should remain around it.

**Shared page frame** (`components/page-shell.tsx:4-21`):

```tsx
export function PageShell({ title, subtitle, actions, children }: Props) {
  return (
    <div>
      <AppHeader title={title} subtitle={subtitle} />
      {actions ? <div className="mb-6 flex flex-wrap gap-3">{actions}</div> : null}
      {children}
    </div>
  );
}
```

The denied page is intentionally a centered card rather than a denied business `PageShell`, so protected page headers/filters never render.

---

### User Management server page and focused client component

**Apply to:** `app/users/page.tsx`, `app/users/users-client.tsx`

**Primary UI analog:** `app/products/page.tsx`; use `app/users/page.tsx` only for broad presentation placement, not its mock users, custom roles, `react-select`, permission editor, Delete button, or local mutations.

**React Query applied-filter pattern** (`app/products/page.tsx:111-152`):

```tsx
const [page, setPage] = useState(1);
const pageSize = 10;

const { data, error, isLoading, isFetching } = useQuery({
  queryKey: [
    "products-master-list",
    {
      page,
      pageSize,
      itemCode: appliedItemCode,
      name: appliedName,
      category: appliedCategory,
      status: appliedStatus,
    },
  ],
  queryFn: () => fetchProducts({
    page,
    pageSize,
    itemCode: appliedItemCode,
    name: appliedName,
    category: appliedCategory,
    status: appliedStatus,
  }),
  placeholderData: (previousData) => previousData,
});
```

Use a complete user-list key containing page, page size, applied search, role, location, and status. Preserve previous rows while `isFetching`. After mutations, invalidate/refetch the list without discarding applied filters/page unless the resulting page is invalid.

**Filter reset pattern** (`app/products/page.tsx:178-197`):

```tsx
const handleApplyFilters = () => {
  setPage(1);
  setAppliedItemCode(itemCode);
  setAppliedName(name);
  setAppliedCategory(category.value);
  setAppliedStatus(status.value);
};

const handleResetFilters = () => {
  setItemCode("");
  setName("");
  setCategory(CATEGORY_OPTIONS[0]);
  setStatus(STATUS_OPTIONS[0]);
  setAppliedItemCode("");
  setAppliedName("");
  setAppliedCategory("all");
  setAppliedStatus("all");
  setPage(1);
};
```

**Responsive table/loading/error pattern** (`app/products/page.tsx:345-418`):

```tsx
<Card className="mt-6">
  <CardContent className="p-0">
    <div className="flex items-center justify-between border-b px-5 py-4">
      <p className="text-sm text-slate-500">
        Showing {showingFrom} to {showingTo} of {meta.total} products
        {isFetching && !isLoading ? " • Updating..." : ""}
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1150px]">
        <tbody>
          {isLoading ? (
            <tr><td>Loading products...</td></tr>
          ) : error ? (
            <tr><td>{error.message}</td></tr>
          ) : rows.length === 0 ? (
            <tr><td>No products found.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  </CardContent>
</Card>
```

Use the exact UI-SPEC user copy and seven columns. Differentiate unfiltered-empty and filtered-empty states. Keep the owner Admin visible but non-mutable.

**Dialog structure to retain** (`app/users/page.tsx:1304-1420`):

```tsx
<Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
  <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader>
      <DialogTitle>{selectedUser ? "Edit User" : "Add User"}</DialogTitle>
      <DialogDescription>...</DialogDescription>
    </DialogHeader>
    <div className="grid gap-6 py-2">...</div>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button>{selectedUser ? "Save Changes" : "Create User"}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Replace all content/behavior with the approved contract: Base UI `Select`, field-level errors, temporary-password confirmation, role-dependent location, operation alerts/status, and dedicated lifecycle dialogs. Do not copy `app/users/page.tsx:82-421` or `503-720`; those are explicitly out-of-scope custom permissions and stale roles.

---

### First-login credential prompt

**Apply to:** `app/sign-in/sign-in-form.tsx`, `components/credential-setup-dialog.tsx`, and `app/api/credential-setup/route.ts`

**Async form pattern** (`app/sign-in/sign-in-form.tsx:14-36`):

```tsx
const [error, setError] = useState("");
const [isSubmitting, setIsSubmitting] = useState(false);

async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  setError("");
  setIsSubmitting(true);

  const result = await authClient.signIn.email({ email, password });

  if (result.error) {
    setError("Invalid email or password.");
    setIsSubmitting(false);
    return;
  }

  router.replace(callbackUrl as Route);
  router.refresh();
}
```

After successful sign-in, inspect server-backed credential state before business navigation. If prompting is required, open the blocking dialog and retain the safe callback destination. Change and skip both consume the prompt; reset re-arms it. Validate callback URLs with the existing same-origin check at `app/sign-in/page.tsx:8-13`.

**Accessible password field/loading pattern** (`app/sign-in/sign-in-form.tsx:52-87`):

```tsx
<form className="space-y-4" onSubmit={handleSubmit}>
  <Label htmlFor="password">Password</Label>
  <Input
    id="password"
    type="password"
    autoComplete="current-password"
    required
    value={password}
    onChange={(event) => setPassword(event.target.value)}
  />
  <Button disabled={isSubmitting} type="submit">
    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
    Sign in
  </Button>
</form>
```

Use `current-password` for the current value and `new-password` for both new fields. Add `aria-invalid`, field messages, first-invalid focus, `role="alert"`, and the approved loading/copy states. Never place passwords in URLs, banners, logs, query cache, or response payloads.

---

### Test infrastructure and tests

**Apply to:** `vitest.config.ts`, all `*.test.ts`, `tests/helpers/*`, and `tests/fixtures/workbook-edge-cases.xlsx`.

There is **no checked-in automated-test analog**. `docs/TESTING.md:4-17` is authoritative about the gap:

```text
This repository does not currently have an automated test suite. No test framework,
DOM testing library, browser test runner, test files, test configuration, coverage
tool, `test` package script, or CI workflow is checked in.
```

Use the upstream validation contract rather than inventing conventions:

- Node environment; no DOM package is required for policy, routes, services, or integration tests.
- Colocate pure/route tests as `*.test.ts`; use `tests/integration/*.test.ts` for real PostgreSQL behavior.
- Put disposable database, factories, session, and request helpers under `tests/helpers/`.
- Use a separately named disposable PostgreSQL 17 target; positively refuse the development bind mount and unknown URLs.
- Keep integration tests serial or worker-isolated.
- The synthetic XLSX covers formulas, hidden sheets, headings, duplicate/missing codes, invalid quantities, and conflicting/missing prices; the 116 MB owner workbook stays out of quick tests.
- Test observable status/body/database/session postconditions. Do not import `MOCK_USERS` or other page fixtures.

**Test seam guidance** (`docs/TESTING.md:102-130`):

```text
Keep route handlers thin. Mock domain-service boundaries in handler unit tests,
then use separate integration tests to prove that the real service and persistence
adapters work together.

Client-side button visibility is only a usability check; it must never be the sole
authorization assertion. Verify that direct HTTP requests cannot bypass the server
policy and that denied operations leave the database unchanged.
```

The exact required test matrix is fixed by `01-VALIDATION.md:45-56`; preserve every listed file and behavior. Vitest installation requires the research legitimacy human checkpoint before changing dependencies.

---

### Package and documentation updates

**Apply to:** `package.json`, `package-lock.json`, `docs/API.md`, `docs/DATABASE.md`, `docs/TESTING.md`, `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`.

**Package script style** (`package.json:6-15`):

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "prisma:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:seed": "prisma db seed"
}
```

Add explicit one-shot `test` and protected integration scripts; do not use watch mode in validation. Install SheetJS only from the approved official CDN URL and only add a human-verified Node-20-compatible Vitest version. Let npm generate `package-lock.json`; do not hand-edit it.

Documentation must replace current-state claims only after implementation and verification. Follow the current API error/status tables (`docs/API.md:10-41`), database boundary/model/gap sections (`docs/DATABASE.md:4-50,86-95`), and testing current-vs-future distinction (`docs/TESTING.md:4-29,161-173`). Record exact command outcomes and retain the existing lint baseline unless a fresh run proves otherwise.

## Shared Patterns

### Server-only boundary

**Source:** `lib/server/prisma.ts:1-13`, `lib/server/catalog.ts:1-12`

**Apply to:** authorization, policy, user lifecycle, reset, and Prisma-backed routes/services.

- Start server modules with `import "server-only"`.
- Import browser-safe DTOs into server code, never Prisma/server modules into client components.
- Routes call services; clients call same-origin routes.

### Authorization

**Source:** `lib/server/authorization.ts:24-74`

**Apply to:** every sensitive read/mutation and page proxy rule.

- Resolve Better Auth session, reload persisted User, require `ACTIVE`, then evaluate role/action/location.
- Menu hiding and denied-page routing are presentation/defense-in-depth, not authorization.
- Inactive/revoked/missing session → 401/sign-in; authenticated forbidden → 403/access denied.

### Validation and errors

**Source:** `app/api/inventory/route.ts:9-38`, `lib/server/catalog.ts:14-35`

- Parse query, params, body, environment, fixture, and role/location combinations with Zod.
- Return stable `{ error: { code, message } }` envelopes.
- Log unexpected server errors with operation context but not protected records or credentials.
- Make ambiguous workbook data and failed lifecycle transactions fail closed.

### Pagination and applied filters

**Source:** `lib/server/catalog.ts:38-45`, `app/products/page.tsx:130-152,168-197`

- Clamp pages on the server and return `{ page, pageSize, total, totalPages }`.
- Include every applied filter in the React Query key.
- Reset page to 1 on apply/reset; retain previous rows during transitions.

### Transactions and idempotent reload

**Source:** `prisma/seed.mjs:90-128`; no local transaction analog.

- Stable source keys and upserts make reruns equivalent.
- Use short transactions for catalog replacement and access-change/session revocation.
- Never use global `prisma migrate reset` for the scoped catalog reload.

### UI frame and primitives

**Source:** `components/page-shell.tsx:4-21`, `app/products/page.tsx:16-34`

- Preserve `PageShell`, Card/Dialog/Input/Label/Select/Table/Button/Badge primitives, Lucide icons, semantic tokens, dark mode, and horizontal table overflow.
- New routes remain server components by default; isolate state/query/dialog behavior in focused client components.
- Do not copy hard-coded `react-select` styles or stale mock role/permission behavior.

## No Analog Found

| File/Family | Reason / Planner Direction |
|---|---|
| `vitest.config.ts` and all test files | No runner, config, test, or helper exists. Follow `01-VALIDATION.md` and Vitest Node-project guidance. |
| `scripts/data-onboarding/*` | No workbook-processing code exists. Use SheetJS read-only parsing and the profile → review → generate → load architecture from research. |
| Review/mapping JSON artifacts | No traceability artifact exists. Preserve workbook hash, source sheet/row/column, raw/normalized values, finding, and explicit resolution. |
| Synthetic XLSX fixture | No binary test fixtures exist. Generate a small deterministic fixture; do not use the owner workbook in quick tests. |
| Atomic user/session lifecycle | No mutation service exists. Use one application boundary and prove postconditions against PostgreSQL/Better Auth sessions. |

## Explicit Anti-Patterns

- Do not copy `app/users/page.tsx` mock users, custom roles, permissions, `setTimeout`, hard-coded branches, `react-select`, Delete action, or close-only submit handlers.
- Do not expose generic Better Auth Admin operations to the browser or directly write password hashes in application user management.
- Do not parse/fix the workbook during database seeding, silently coerce invalid quantities, auto-merge duplicates, or pick a conflicting price.
- Do not treat `SR` as a branch or preserve old `WH-MAIN`/`BR-*` fixtures after the owner-approved mapping exists.
- Do not trust proxy/menu/client controls as API authorization.
- Do not import Prisma, credentials, or server policy modules into client bundles.
- Do not reset the existing bind-mounted developer database or permit production reload.

## Metadata

**Analog search scope:** `app/`, `components/`, `lib/`, `prisma/`, root config, and `docs/`

**Strong analogs used:**

1. `app/api/inventory/route.ts` — authenticated, validated, thin route and errors
2. `lib/server/authorization.ts` / `lib/server/catalog.ts` — persisted auth, scope, Zod, Prisma service
3. `prisma/seed.mjs` / initial migration — deterministic keyed seed, explicit failure, SQL checks
4. `app/products/page.tsx` / `lib/catalog.ts` — same-origin DTO/query, filters, pagination, UI states
5. `components/app-sidebar.tsx` / `components/page-shell.tsx` — shell, navigation, and page presentation

**Pattern extraction date:** 2026-08-25

**Worktree preservation:** Existing unrelated changes under `app/customer-orders/[id]/release/page.tsx`, `.planning/codebase/`, `excel/`, and `opencode-error.txt` were not modified.
