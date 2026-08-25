<!-- refreshed: 2026-08-25 -->
# Architecture

**Analysis Date:** 2026-08-25

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                Next.js App Router presentation              │
├──────────────────┬──────────────────┬───────────────────────┤
│ Business pages   │ Shared shell/UI  │ Route handlers        │
│ `app/**/page.tsx`│ `components/`    │ `app/api/**/route.ts`  │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         │          React context/local state     ▼
         │          `app/provider.tsx`    ┌───────────────────┐
         │                                │ Server boundary   │
         ├── local fixtures ─────────────►│ `lib/server/`     │
         │   `lib/mock-data.ts`           └─────────┬─────────┘
         │   page-local arrays                      │
         │                                          ▼
         │                                ┌───────────────────┐
         └── same-origin HTTP ───────────►│ Prisma/PostgreSQL │
             `lib/catalog.ts`             │ `prisma/`         │
                                          └───────────────────┘
```

Chezcar is a Next.js App Router modular monolith with a shared browser UI, same-process route handlers, server-only authentication/authorization/catalog modules, and one PostgreSQL database (`app/`, `app/api/`, `lib/server/`, `prisma/schema.prisma`). It is architecturally hybrid: Products and the primary Inventory list use authenticated HTTP-to-Prisma reads, while most screens and all business mutations use page-local state or fixtures (`app/products/page.tsx`, `app/inventory/page.tsx`, `app/customers/page.tsx`, `lib/mock-data.ts`).

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root composition | Loads global styles/font metadata and composes the query provider with the route-aware application shell | `app/layout.tsx` |
| Route gate | Validates page sessions/account status and applies coarse product/inventory page role redirects; excludes API routes | `proxy.ts` |
| Application shell | Selects the normal sidebar layout, full-width POS layout, or shell-free sign-in layout | `components/app-layout-shell.tsx` |
| Page frame | Gives standard business pages a shared header, subtitle, action area, and content frame | `components/page-shell.tsx` |
| Navigation | Renders responsive navigation from centralized route metadata and persists sidebar preference | `components/app-sidebar.tsx`, `lib/menu.ts` |
| Query provider | Owns the browser `QueryClient` and global stale/focus defaults | `app/provider.tsx` |
| Browser API contract | Defines product/inventory DTOs and performs credentialed same-origin JSON reads | `lib/catalog.ts` |
| Auth client | Exposes Better Auth browser session, sign-in, and sign-out operations | `lib/auth-client.ts` |
| API transport | Authenticates requests, validates inputs where implemented, invokes server modules, and serializes JSON | `app/api/**/route.ts` |
| Authorization boundary | Reloads the persisted user, checks active status/fixed roles, and derives location scope | `lib/server/authorization.ts` |
| Catalog service/repository | Validates list-query shapes and translates Prisma records into product/inventory DTOs | `lib/server/catalog.ts` |
| Authentication service | Configures Better Auth email/password sessions over the Prisma adapter | `lib/server/auth.ts` |
| Persistence client | Provides the server-only development-safe Prisma singleton | `lib/server/prisma.ts` |
| Persistence model | Defines implemented location, product, balance, user, and Better Auth records | `prisma/schema.prisma` |
| Prototype data | Supplies dashboard and protected mock-route records that are not durable | `lib/mock-data.ts`, `lib/dashboard-data.ts`, `app/inventory/_data.ts` |

## Pattern Overview

**Overall:** Hybrid modular monolith with App Router feature folders, shared presentation primitives, protected HTTP read paths, and fixture-backed prototype paths (`app/`, `components/`, `lib/`, `prisma/`).

**Key Characteristics:**
- Route ownership follows URL/business-area folders under `app/`; nested `create`, `[id]`, `edit`, `release`, `receive`, `transfer`, and `roles` segments model subflows (`app/customer-orders/`, `app/job-orders/`, `app/inventory/`, `app/users/`).
- The root remains a server component, but all 23 business `page.tsx` files are client components; interactive pages commonly own data types, filters, workflow state, and rendering in one file (`app/layout.tsx`, `app/products/page.tsx`, `app/pos/page.tsx`).
- Browser-to-server dependency direction is explicit for implemented reads: client page → `lib/catalog.ts` → route handler → authorization/catalog server modules → Prisma → PostgreSQL (`app/products/page.tsx`, `app/api/products/route.ts`, `lib/server/catalog.ts`, `lib/server/prisma.ts`).
- Server-only modules declare `import "server-only"`; client code does not import Prisma, Better Auth server configuration, or database credentials (`lib/server/auth.ts`, `lib/server/authorization.ts`, `lib/server/catalog.ts`, `lib/server/prisma.ts`).
- Route visibility is presentation metadata rather than access control; authorization is enforced in `proxy.ts` for page navigation and independently in each handler through `requireUser()` (`lib/menu.ts`, `proxy.ts`, `app/api/products/route.ts`).

## Layers

**Routing and Page Composition:**
- Purpose: Map URLs to layouts, pages, and HTTP handlers.
- Location: `app/`
- Contains: `layout.tsx`, route `page.tsx` files, colocated feature files, and `api/**/route.ts` handlers.
- Depends on: Shared components and browser-safe `lib/` modules; route handlers additionally depend on `lib/server/`.
- Used by: Next.js routing and browser navigation configured through `lib/menu.ts` and route links.

**Presentation and Interaction:**
- Purpose: Render the responsive shell, headers, tables, dialogs, forms, and reusable controls.
- Location: `components/`, `components/ui/`, and interactive `app/**/page.tsx` files.
- Contains: Shell components, `PageShell`, shadcn-style primitives, feature-local view state, and Tailwind class composition.
- Depends on: React, Next navigation/image/link APIs, `lib/menu.ts`, `lib/utils.ts`, and browser-safe clients.
- Used by: Every business route under `app/`; `/sign-in` and `/pos` intentionally receive alternate shell treatment in `components/app-layout-shell.tsx`.

**Browser State and Data Access:**
- Purpose: Hold local interaction state, cache asynchronous reads, and expose typed same-origin API calls.
- Location: `app/provider.tsx`, `lib/catalog.ts`, `lib/auth-client.ts`, and individual client pages.
- Contains: TanStack Query configuration, query keys, fetch/response handling, Better Auth browser client, React state, and memoized projections.
- Depends on: Route handlers under `app/api/` for implemented product/inventory reads; local arrays and mock functions for prototype routes.
- Used by: `app/products/page.tsx`, `app/inventory/page.tsx`, `app/sign-in/sign-in-form.tsx`, `components/app-header.tsx`, and fixture-backed list pages such as `app/customers/page.tsx`.

**HTTP Boundary:**
- Purpose: Turn requests into authenticated, validated operations and stable JSON/error responses.
- Location: `app/api/**/route.ts`
- Contains: Better Auth catch-all handlers, protected Prisma-backed collection reads, and protected fixture-backed reads.
- Depends on: `lib/server/auth.ts`, `lib/server/authorization.ts`, `lib/server/catalog.ts`, and `lib/mock-data.ts`.
- Used by: Better Auth browser calls and the product/inventory fetch functions in `lib/catalog.ts`; mock endpoints exist independently of page-local mock list functions.

**Server Application and Policy:**
- Purpose: Centralize persisted identity checks, role/location policy, query validation, database querying, and DTO mapping.
- Location: `lib/server/`
- Contains: Better Auth configuration, custom auth errors, Zod schemas, catalog query functions, and Prisma lifecycle management.
- Depends on: Prisma Client, Better Auth, Zod, shared DTO types from `lib/catalog.ts`, and `prisma/schema.prisma` generated types.
- Used by: `proxy.ts` and route handlers in `app/api/`.

**Persistence and Provisioning:**
- Purpose: Define and initialize the implemented PostgreSQL foundation.
- Location: `prisma/`
- Contains: Schema, initial migration, and environment-driven development seed.
- Depends on: PostgreSQL and runtime environment configuration; database connection values are not stored in source files.
- Used by: Prisma Client through `lib/server/prisma.ts` and provisioning commands defined in `package.json`.

**Prototype Fixtures:**
- Purpose: Demonstrate screens and interactions without durable business workflows.
- Location: `lib/mock-data.ts`, `lib/dashboard-data.ts`, `app/inventory/_data.ts`, and arrays/functions inside route pages.
- Contains: Records, option lists, delayed in-memory query functions, formatting helpers, and simulated statuses.
- Depends on: Page-local React state and TanStack Query for simulated asynchronous lists.
- Used by: Dashboard, customers, orders, jobs, branches, users, reports, notifications, POS, and auxiliary inventory interactions under `app/`.

## Data Flow

### Primary Request Path

1. A signed-in browser renders a client list page and TanStack Query builds a complete key from pagination and applied filters (`app/products/page.tsx:130`, `app/inventory/page.tsx:136`).
2. The browser-safe client serializes the query and calls a same-origin endpoint with session credentials (`lib/catalog.ts:61`, `lib/catalog.ts:82`).
3. The route reloads and authorizes the active user, then parses query parameters with Zod (`app/api/products/route.ts:9`, `app/api/inventory/route.ts:9`, `lib/server/authorization.ts:24`).
4. The catalog module constructs role-aware Prisma filters, paginates products, derives inventory status, and maps Decimal/Date values to JSON DTOs (`lib/server/catalog.ts:48`, `lib/server/catalog.ts:141`).
5. Prisma reads PostgreSQL through the singleton client and the route serializes the result to JSON (`lib/server/prisma.ts:9`, `app/api/products/route.ts:16`, `app/api/inventory/route.ts:20`).
6. TanStack Query caches the response and the page renders loading, error, summary, grouped-row, filter, and pagination state (`app/products/page.tsx:154`, `app/inventory/page.tsx:162`).

### Authentication and Page Navigation

1. `proxy.ts` intercepts non-API page navigation, asks Better Auth for the session, and reloads the user's persisted role/status (`proxy.ts:6`).
2. Missing/inactive sessions redirect to `/sign-in`; active sessions visiting `/sign-in` redirect to `/dashboard`; product and stock-operation pages receive coarse role redirects (`proxy.ts:16`, `proxy.ts:25`, `proxy.ts:29`).
3. The sign-in form calls the Better Auth client, then replaces the URL and refreshes the route (`app/sign-in/sign-in-form.tsx:21`, `lib/auth-client.ts`).
4. Better Auth's catch-all handler persists credentials/session records through its Prisma adapter (`app/api/auth/[...all]/route.ts`, `lib/server/auth.ts`, `prisma/schema.prisma`).

### Fixture-Backed Prototype Flow

1. A client page imports shared fixtures or declares page-local arrays/types (`app/dashboard/page.tsx:8`, `app/customers/page.tsx:32`).
2. Lists may wrap in-memory filtering/pagination in an artificial `setTimeout` and TanStack Query (`app/customers/page.tsx:291`, `app/job-orders/page.tsx:232`, `app/users/page.tsx:441`).
3. User actions update component state, navigate, close overlays, or log payloads instead of performing durable mutations (`app/pos/page.tsx:575`, `app/job-orders/create/page.tsx:205`, `app/reports/page.tsx:73`).

**State Management:**
- Use React component state for editable filters, applied filters, dialogs, forms, expanded rows, and local workflow simulations in feature pages (`app/inventory/page.tsx`, `app/products/page.tsx`).
- Use TanStack Query for asynchronous list reads, with the single global client configured in `app/provider.tsx`; only products/inventory currently cross the HTTP boundary through `lib/catalog.ts`.
- Use browser local storage only for UI preferences such as theme and sidebar pinning (`components/app-header.tsx`, `components/app-sidebar.tsx`).
- Persist implemented identity/catalog state in PostgreSQL through Prisma models in `prisma/schema.prisma`; no global business-state store exists.

## Key Abstractions

**PageShell:**
- Purpose: Standardizes business-page title, subtitle, header controls, and action spacing.
- Examples: `components/page-shell.tsx`, `app/products/page.tsx`, `app/dashboard/page.tsx`.
- Pattern: Composition component; use it for normal shell-backed business pages and reserve the full-width exception for `/pos` through `components/app-layout-shell.tsx`.

**UI Primitives:**
- Purpose: Provide reusable styling and behavior for buttons, cards, tables, overlays, fields, tabs, and sheets.
- Examples: `components/ui/button.tsx`, `components/ui/dialog.tsx`, `components/ui/table.tsx`, `components/ui/sheet.tsx`.
- Pattern: shadcn-style direct-module imports backed by Base UI/Radix; extend these modules rather than creating parallel primitive families.

**Canonical Read DTOs:**
- Purpose: Keep product/inventory transport shapes independent from Prisma record objects and explicitly serialize Decimal/Date values.
- Examples: `lib/catalog.ts`, `lib/server/catalog.ts`.
- Pattern: Browser-safe shared TypeScript contracts plus server mapping functions; add canonical contracts before connecting another page fixture shape to persistence.

**Authorization Context:**
- Purpose: Represent the persisted user identity, fixed role, and optional location scope required by a server operation.
- Examples: `lib/server/authorization.ts`, `app/api/inventory/route.ts`.
- Pattern: Guard function returning `AuthContext` or throwing typed authentication/authorization errors; every sensitive handler must invoke it independently of `proxy.ts`.

**Prisma Singleton:**
- Purpose: Prevent excess Prisma clients during development hot reload while keeping database access server-only.
- Examples: `lib/server/prisma.ts`, `lib/server/auth.ts`, `lib/server/catalog.ts`.
- Pattern: Module singleton cached on `globalThis` outside production and protected by `server-only`.

**Navigation Metadata:**
- Purpose: Define labels, typed hrefs, and Lucide icons for visible sidebar routes.
- Examples: `lib/menu.ts`, `components/app-sidebar.tsx`.
- Pattern: Immutable metadata rendered by the shell; never use this list as an authorization policy.

## Entry Points

**Root Layout:**
- Location: `app/layout.tsx`
- Triggers: Every App Router page render.
- Responsibilities: Apply global CSS/font metadata, create the React Query provider boundary, and delegate route-dependent framing to `components/app-layout-shell.tsx`.

**Root Route:**
- Location: `app/page.tsx`
- Triggers: Navigation to `/`.
- Responsibilities: Redirect to `/dashboard`.

**Business Routes:**
- Location: `app/**/page.tsx`
- Triggers: Browser navigation to dashboard, catalog, inventory, order, job, branch, user, report, notification, settings, or POS URLs.
- Responsibilities: Render feature UI and currently own most feature-local state/data; route inventory is reflected by folders under `app/` and visible navigation in `lib/menu.ts`.

**Page Proxy:**
- Location: `proxy.ts`
- Triggers: Non-API routes matched by `config.matcher`.
- Responsibilities: Validate sessions/account status and perform coarse page-level role redirects; it is not the API authorization boundary.

**Better Auth Endpoint:**
- Location: `app/api/auth/[...all]/route.ts`
- Triggers: Better Auth GET/POST requests from `lib/auth-client.ts`.
- Responsibilities: Delegate authentication protocol handling to the configured service in `lib/server/auth.ts`.

**Protected Read Endpoints:**
- Location: `app/api/products/route.ts`, `app/api/inventory/route.ts`, `app/api/dashboard/route.ts`, `app/api/customers/route.ts`, `app/api/customer-orders/route.ts`
- Triggers: Same-origin HTTP GET requests carrying a Better Auth session.
- Responsibilities: Require an active persisted user, apply endpoint roles, and return Prisma-backed or explicitly fixture-backed JSON.

**Database Lifecycle:**
- Location: `prisma/schema.prisma`, `prisma/migrations/20260824000000_initial_foundation/migration.sql`, `prisma/seed.mjs`
- Triggers: Prisma generation, migration, and seed scripts in `package.json`.
- Responsibilities: Define, migrate, and provision the implemented database foundation.

## Architectural Constraints

- **Threading:** Next.js handles request concurrency; client interaction runs in the browser event loop, and parallel database counts use `Promise.all` in `lib/server/catalog.ts`. No explicit workers or queues exist.
- **Global state:** The only process-level singleton is Prisma in `lib/server/prisma.ts`; the browser has one React Query client per provider instance in `app/provider.tsx`, while theme/sidebar preferences use `localStorage` in `components/app-header.tsx` and `components/app-sidebar.tsx`.
- **Circular imports:** No circular dependency chain is detected among `app/`, `components/`, `lib/`, and `lib/server/`; preserve the direction client page → browser-safe `lib/` → HTTP → `app/api/` → `lib/server/` → Prisma.
- **Client/server boundary:** Modules in `lib/server/` are server-only and must never be imported by client pages or shared client components (`lib/server/auth.ts`, `lib/server/catalog.ts`, `lib/server/prisma.ts`).
- **Authorization:** `proxy.ts` does not match `app/api/`; every sensitive route handler must call `requireUser()` from `lib/server/authorization.ts` and derive branch scope from persisted `User.locationId`.
- **Persistence scope:** Only models in `prisma/schema.prisma` are implemented; visible order, payment, job, transfer, report, and notification flows remain fixture/local behavior in `app/` and `lib/mock-data.ts`.
- **App Router exports:** Route pages/layouts use default exports, while route handlers expose HTTP method exports and shared modules generally expose named exports (`app/layout.tsx`, `app/api/products/route.ts`, `components/page-shell.tsx`).
- **Typed routes:** Next typed routes are enabled in `next.config.ts`; preserve `Route` typing or statically valid hrefs for navigation code such as `app/sign-in/sign-in-form.tsx`.

## Anti-Patterns

### Monolithic Client Feature Pages

**What happens:** Route pages combine domain-like types, large fixture collections, filtering, workflow state, formatting, and presentation; `app/inventory/page.tsx`, `app/customers/page.tsx`, and `app/pos/page.tsx` are representative.
**Why it's wrong:** The files obscure data boundaries, duplicate contracts, force whole routes into client bundles, and make server migration or isolated verification difficult.
**Do this instead:** Keep a new `app/<feature>/page.tsx` server-rendered by default, move focused interactivity into colocated client components, place canonical browser-safe contracts in `lib/`, and put durable operations behind `app/api/<resource>/route.ts` plus `lib/server/` services.

### UI Simulation Presented as Mutation Architecture

**What happens:** Submissions log payloads, close dialogs, navigate, or update component arrays without validation, authorization, transactions, or persistence (`app/pos/page.tsx`, `app/job-orders/create/page.tsx`, `app/reports/page.tsx`).
**Why it's wrong:** A successful visual transition does not establish durable inventory, payment, order, or job invariants and cannot survive reloads.
**Do this instead:** Add a validated and authorized server operation under `app/api/` and `lib/server/`, execute multi-record stock/payment changes transactionally through `lib/server/prisma.ts`, then invalidate/update TanStack Query state in the client.

### Fixture and Canonical Model Drift

**What happens:** Product, inventory, customer, order, branch, and user shapes are separately declared in pages, `lib/mock-data.ts`, `app/inventory/_data.ts`, `lib/catalog.ts`, and `prisma/schema.prisma`.
**Why it's wrong:** Similar names hide incompatible identifiers, statuses, money formats, and persistence semantics; connecting a page directly risks silent lossy mapping.
**Do this instead:** Establish one browser-safe DTO/validation contract like `lib/catalog.ts` plus explicit server mapping like `lib/server/catalog.ts` before replacing each fixture-backed feature.

### Navigation as Implied Security

**What happens:** `lib/menu.ts` exposes the same sidebar entries independent of role, while some pages contain hard-coded client role checks such as `USER_ROLE` in `app/inventory/_data.ts` and `app/inventory/page.tsx`.
**Why it's wrong:** Hidden or disabled controls can be bypassed and cannot authorize data or mutations.
**Do this instead:** Enforce each policy with persisted identity in `lib/server/authorization.ts`; use role-aware navigation only as a usability layer after server enforcement exists.

## Error Handling

**Strategy:** Translate expected authentication, authorization, and query-validation failures into structured HTTP errors at route boundaries; throw browser fetch failures into TanStack Query; keep unexpected server details in server logs (`lib/server/authorization.ts`, `app/api/products/route.ts`, `lib/catalog.ts`).

**Patterns:**
- `requireUser()` throws `AuthenticationError` or `AuthorizationError`, and `authorizationErrorResponse()` maps them to 401/403 JSON (`lib/server/authorization.ts`).
- Prisma-backed list routes catch `ZodError` as a 400 response and catch/log unexpected failures as generic 500 responses (`app/api/products/route.ts`, `app/api/inventory/route.ts`).
- `fetchJson()` reads a safe server error message when available and throws on non-2xx responses; pages render query error state (`lib/catalog.ts`, `app/products/page.tsx`, `app/inventory/page.tsx`).
- The sign-in form maps Better Auth failures to a generic credential message without exposing underlying details (`app/sign-in/sign-in-form.tsx`).
- Fixture-backed API handlers map auth errors but do not establish resource-specific validation/error contracts (`app/api/dashboard/route.ts`, `app/api/customers/route.ts`, `app/api/customer-orders/route.ts`).

## Cross-Cutting Concerns

**Logging:** Use server-side `console.error` only for unexpected route failures in `app/api/products/route.ts` and `app/api/inventory/route.ts`; payload `console.log` calls in `app/pos/page.tsx` and other prototype pages are simulation behavior, not an observability layer.

**Validation:** Use Zod schemas at the HTTP boundary for product/inventory query parameters in `lib/server/catalog.ts`; most fixture-backed forms and APIs under `app/` lack canonical runtime validation.

**Authentication:** Better Auth email/password sessions are configured in `lib/server/auth.ts`, exposed through `app/api/auth/[...all]/route.ts`, consumed in `lib/auth-client.ts`, checked for pages by `proxy.ts`, and independently checked for APIs by `lib/server/authorization.ts`.

**Authorization:** Fixed Prisma `UserRole` values and persisted account/location state drive server policy in `lib/server/authorization.ts`; inventory branch scoping is applied in `lib/server/catalog.ts`, while `lib/menu.ts` remains non-authoritative UI metadata.

**Styling and Theme:** Tailwind utilities and semantic CSS variables flow from `app/globals.css` and `tailwind.config.ts`; class composition uses `cn()` from `lib/utils.ts`, and browser theme preference is applied by `components/app-header.tsx`.

---

*Architecture analysis: 2026-08-25*
