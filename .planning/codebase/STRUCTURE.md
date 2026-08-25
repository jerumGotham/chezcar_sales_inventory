# Codebase Structure

**Analysis Date:** 2026-08-25

## Directory Layout

```text
chezcar-ui-starter/
├── app/                         # App Router pages, root composition, styles, and APIs
│   ├── api/                     # Better Auth and protected JSON route handlers
│   ├── customer-orders/         # List, create, dynamic detail, and release prototypes
│   ├── inventory/               # Persisted primary list plus local receive/transfer tools
│   ├── job-orders/              # List, create, and dynamic edit prototypes
│   ├── sign-in/                 # Public shell-free sign-in route and form
│   ├── users/                   # User list and nested role-management prototype
│   ├── <business-area>/         # Remaining route folders, normally with `page.tsx`
│   ├── layout.tsx               # Server root layout
│   ├── page.tsx                 # `/` to `/dashboard` redirect
│   ├── provider.tsx             # Browser React Query provider
│   └── globals.css              # Global theme tokens and Tailwind styles
├── components/                  # Cross-route shell and presentation components
│   └── ui/                      # Base UI/Radix, shadcn-style primitives
├── lib/                         # Browser-safe contracts, fixtures, helpers, and metadata
│   └── server/                  # Server-only auth, policy, catalog, and Prisma modules
├── prisma/                      # Implemented schema, migration history, and seed
│   └── migrations/              # Committed PostgreSQL migrations
├── public/                      # Static logo and avatar assets
├── docs/                        # Product, ADR, architecture, API, DB, and dev guidance
│   ├── adr/                     # Numbered architecture decision records
│   └── product/                 # Requirements, glossary, discovery, provisional model
├── .planning/codebase/          # Generated GSD codebase maps
├── data/                        # Ignored local PostgreSQL bind-mount state
├── proxy.ts                     # Non-API page session/role gate
├── next.config.ts               # Next.js typed-route configuration
├── tsconfig.json                # Strict TypeScript and `@/*` alias
├── tailwind.config.ts           # Tailwind content/theme extensions
├── components.json              # shadcn generator aliases/style configuration
├── eslint.config.mjs            # Next.js/TypeScript lint configuration
├── docker-compose.yml           # Local PostgreSQL service definition
└── package.json                 # Runtime, scripts, and dependency manifest
```

Generated/dependency directories `.next/` and `node_modules/` are present locally but are not source locations; both are ignored by `.gitignore`. The local `.env` exists but is ignored and must not be read or committed (`.gitignore`).

## Directory Purposes

**`app/`:**
- Purpose: Own URL structure, route rendering, root composition, and HTTP endpoints.
- Contains: One `layout.tsx`, one root redirect, 23 client business pages, a server sign-in page, feature-colocated components/data, global CSS, and six API resource folders.
- Key files: `app/layout.tsx`, `app/page.tsx`, `app/provider.tsx`, `app/globals.css`, `app/api/products/route.ts`, `app/api/inventory/route.ts`.

**`app/api/`:**
- Purpose: Expose the same-origin server surface; page middleware does not cover these paths, so handlers own authorization.
- Contains: Better Auth catch-all GET/POST handling, Prisma-backed product/inventory GET handlers, and authenticated fixture-backed dashboard/customer/order GET handlers.
- Key files: `app/api/auth/[...all]/route.ts`, `app/api/products/route.ts`, `app/api/inventory/route.ts`, `app/api/dashboard/route.ts`, `app/api/customers/route.ts`, `app/api/customer-orders/route.ts`.

**Feature route directories:**
- Purpose: Group UI by business URL and colocate route-specific files.
- Contains: Flat routes such as `app/products/page.tsx` and nested flows such as `app/customer-orders/[id]/release/page.tsx`, `app/job-orders/[id]/edit/page.tsx`, `app/inventory/receive/page.tsx`, and `app/users/roles/page.tsx`.
- Key files: `app/inventory/_data.ts` and `app/customers/CustomerHistoryTabs.tsx` demonstrate feature colocation; most feature logic still resides directly in `page.tsx` files.

**`components/`:**
- Purpose: Hold cross-route application framing and reusable presentation components.
- Contains: Responsive layout/sidebar/header, the standard page frame, a simple table, and a partial legacy UI barrel.
- Key files: `components/app-layout-shell.tsx`, `components/app-sidebar.tsx`, `components/app-header.tsx`, `components/page-shell.tsx`, `components/simple-table.tsx`, `components/ui.tsx`.

**`components/ui/`:**
- Purpose: Provide reusable low-level controls before feature-specific composition.
- Contains: `badge.tsx`, `button.tsx`, `card.tsx`, `checkbox.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `table.tsx`, `tabs.tsx`, and `textarea.tsx`.
- Key files: Import directly from files such as `components/ui/button.tsx` and `components/ui/dialog.tsx`; `components/ui.tsx` is not a complete canonical barrel.

**`lib/`:**
- Purpose: Hold modules shared across route boundaries that are safe for browser imports unless placed under `lib/server/`.
- Contains: Product/inventory DTOs and fetch clients, Better Auth browser client, navigation metadata, dashboard helpers, fixtures, and `cn()`.
- Key files: `lib/catalog.ts`, `lib/auth-client.ts`, `lib/menu.ts`, `lib/mock-data.ts`, `lib/dashboard-data.ts`, `lib/utils.ts`.

**`lib/server/`:**
- Purpose: Isolate database credentials, persisted identity policy, server validation/querying, and Prisma lifecycle from client bundles.
- Contains: Four modules, each marked `server-only`: auth configuration, authorization guard/errors, catalog read service, and Prisma singleton.
- Key files: `lib/server/auth.ts`, `lib/server/authorization.ts`, `lib/server/catalog.ts`, `lib/server/prisma.ts`.

**`prisma/`:**
- Purpose: Define the implemented PostgreSQL model and reproducible development provisioning.
- Contains: `schema.prisma`, `seed.mjs`, migration lock, and the initial foundation migration.
- Key files: `prisma/schema.prisma`, `prisma/seed.mjs`, `prisma/migrations/20260824000000_initial_foundation/migration.sql`.

**`public/`:**
- Purpose: Serve static assets from root-relative URLs.
- Contains: Chezcar PNG/SVG logos and a user avatar SVG.
- Key files: `public/chezcar-logo.png`, `public/chezcar-logo.svg`, `public/chezcar_logo_recreated.svg`, `public/user-avatar.svg`.

**`docs/`:**
- Purpose: Record operational guidance, implemented architecture/API/database facts, product intent, and proposed/accepted decisions.
- Contains: Top-level technical guides, seven ADRs, and four product/discovery documents.
- Key files: `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/product/PRODUCT-REQUIREMENTS.md`, `docs/product/PROVISIONAL-DATA-MODEL.md`, `docs/product/GLOSSARY.md`, `docs/adr/`.

**`.planning/codebase/`:**
- Purpose: Store generated maps consumed by GSD planning and execution.
- Contains: Architecture/structure and other focus-area Markdown maps.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: Server root for all routes; composes global CSS, fonts, providers, and shell.
- `app/page.tsx`: Root URL redirect to `/dashboard`.
- `proxy.ts`: Page request authentication/status gate and coarse role redirects.
- `app/**/page.tsx`: Browser page entry points organized by URL.
- `app/api/**/route.ts`: HTTP entry points; method exports define the API surface.
- `app/api/auth/[...all]/route.ts`: Better Auth protocol entry point.

**Configuration:**
- `package.json`: Scripts, Node requirement, dependencies, and Prisma seed command.
- `next.config.ts`: Enables Next.js typed routes.
- `tsconfig.json`: Enables strict no-emit TypeScript and maps `@/*` to repository root.
- `tailwind.config.ts`: Defines Tailwind scanning, dark mode, colors, radii, and shadows.
- `app/globals.css`: Defines CSS variables, global styles, and dark theme values.
- `postcss.config.js`: Connects PostCSS/Tailwind processing.
- `components.json`: Configures shadcn-style component generation and aliases.
- `eslint.config.mjs`: Configures Next.js Core Web Vitals and TypeScript linting.
- `docker-compose.yml`: Defines the isolated local PostgreSQL service; do not copy its development settings into production code.

**Core Logic:**
- `lib/server/authorization.ts`: Canonical server guard for active account, fixed role, and branch-location context.
- `lib/server/catalog.ts`: Product/inventory query schemas, Prisma reads, pagination, status derivation, and DTO mapping.
- `lib/server/auth.ts`: Better Auth server configuration and Prisma adapter.
- `lib/server/prisma.ts`: Server-only Prisma singleton.
- `lib/catalog.ts`: Shared product/inventory API contracts and browser fetch functions.
- `prisma/schema.prisma`: Authoritative implemented persistence model.
- `lib/mock-data.ts`: Shared fixture source; explicitly non-durable.
- `app/inventory/_data.ts`: Inventory-only prototype types, fixtures, options, permissions, and helpers.

**Shell and Shared UI:**
- `components/app-layout-shell.tsx`: Route-aware normal/POS/sign-in layout selection.
- `components/app-sidebar.tsx`: Responsive navigation and sidebar preference state.
- `components/app-header.tsx`: Page header, session display, theme state, and logout.
- `components/page-shell.tsx`: Standard business page composition.
- `components/ui/`: Direct-import primitive modules.
- `lib/menu.ts`: Visible sidebar route metadata, not access control.
- `lib/utils.ts`: Shared Tailwind class merge helper.

**Feature Routes:**
- `app/dashboard/page.tsx`: Main fixture-backed owner dashboard; alternates live at `app/dashboard2/page.tsx` and `app/dashboard3/page.tsx`.
- `app/products/page.tsx`: Prisma-backed product list UI; edit/add behavior remains disabled/prototype.
- `app/inventory/page.tsx`: Prisma-backed main inventory list combined with fixture-backed auxiliary dialogs.
- `app/customers/page.tsx`: Page-local customer fixture list and history overlays.
- `app/customer-orders/`: List/create/detail/release prototype route family.
- `app/job-orders/`: List/create/dynamic-edit prototype route family.
- `app/pos/page.tsx`: Full-width sales/order/job prototype selected specially by the shell.
- `app/branches/page.tsx`, `app/users/page.tsx`, `app/users/roles/page.tsx`: Administrative prototype routes.

**Testing:**
- Not detected: no test directories, `*.test.*`/`*.spec.*` files, test runner configuration, or test script exists in the repository (`package.json`, `docs/TESTING.md`).
- Manual verification guidance lives in `docs/TESTING.md` and `docs/DEVELOPMENT.md`.

## Naming Conventions

**Files:**
- Use App Router reserved lowercase names for framework entries: `app/layout.tsx`, `app/page.tsx`, and `app/api/products/route.ts`.
- Use kebab-case for shared component and utility filenames: `components/app-layout-shell.tsx`, `components/page-shell.tsx`, `lib/auth-client.ts`, `lib/mock-data.ts`.
- Colocated React component exceptions may use PascalCase when established nearby, as in `app/customers/CustomerHistoryTabs.tsx`; prefer the repository-wide kebab-case shared-component pattern for new cross-route files.
- Prefix route-private support files with `_` only where they are not routable, as in `app/inventory/_data.ts`; keep feature-only helpers beside their route.
- Use numbered kebab-case ADR names under `docs/adr/`, such as `docs/adr/0005-nextjs-api-prisma-postgresql.md`.
- Use uppercase descriptive names for generated planning/reference documents, such as `.planning/codebase/ARCHITECTURE.md` and `docs/API.md`.

**Directories:**
- Use lowercase kebab-case route segments that map directly to URLs: `app/customer-orders/`, `app/stock-transfers/`, `app/sign-in/`.
- Use bracketed dynamic segments for route parameters: `app/customer-orders/[id]/` and `app/job-orders/[id]/`.
- Use nested action/resource segments for subflows: `app/inventory/receive/`, `app/inventory/transfer/`, `app/customer-orders/[id]/release/`, `app/users/roles/`.
- Keep infrastructure group names lowercase: `components/ui/`, `lib/server/`, `prisma/migrations/`, `docs/product/`.

**Symbols and Exports:**
- Use PascalCase for components and types: `ProductsPage`, `PageShell`, `AuthContext`, and `InventoryApiResponse` in `app/products/page.tsx`, `components/page-shell.tsx`, `lib/server/authorization.ts`, and `lib/catalog.ts`.
- Use camelCase for functions and values: `fetchInventory`, `requireUser`, `listProducts`, and `reactSelectStyles` in `lib/catalog.ts`, `lib/server/authorization.ts`, `lib/server/catalog.ts`, and `app/products/page.tsx`.
- Use uppercase snake case for immutable option/fixture constants: `CATEGORY_OPTIONS`, `STATUS_OPTIONS`, `MOCK_INVENTORY`, and `AUTHENTICATED_ROLES` in `app/products/page.tsx`, `app/inventory/_data.ts`, and `lib/server/authorization.ts`.
- Use default exports for App Router pages/layouts and named exports for shared components/functions; examples are `app/layout.tsx`, `app/products/page.tsx`, `components/page-shell.tsx`, and `lib/catalog.ts`.

## Where to Add New Code

**New Feature:**
- Primary route: Add `app/<feature>/page.tsx`; keep it a server component unless it directly requires browser state or APIs.
- Focused interaction: Add a colocated client component such as `app/<feature>/<feature>-client.tsx` rather than expanding `page.tsx` into another monolith; `app/sign-in/sign-in-form.tsx` demonstrates route-level separation.
- Nested flow: Add URL-shaped folders such as `app/<feature>/create/page.tsx` or `app/<feature>/[id]/page.tsx`; use the dynamic parameter to select real data rather than a fixed record.
- Visible navigation: Add an entry to `lib/menu.ts`, but implement authorization separately in `proxy.ts` and the relevant server handler.
- Standard presentation: Wrap normal business content with `components/page-shell.tsx`; preserve the intentional `/pos` exception in `components/app-layout-shell.tsx`.
- Tests: No established test location exists; when introducing the test stack, colocate unit/component tests with modules or define a documented top-level convention and update `docs/TESTING.md` plus `package.json`.

**New Component/Module:**
- Cross-route application component: Place it in `components/<kebab-name>.tsx` and use named exports, following `components/page-shell.tsx`.
- Reusable primitive: Extend or add `components/ui/<primitive>.tsx`, import it directly, and keep `components.json` aliases intact.
- Feature-only component/helper: Colocate it beneath `app/<feature>/` until it has a genuine second consumer, following `app/customers/CustomerHistoryTabs.tsx` and `app/inventory/_data.ts`.
- Browser-safe contract/client: Add it to `lib/<domain>.ts`, following the DTO/fetch separation in `lib/catalog.ts`.
- Server business operation: Add a focused `lib/server/<domain>.ts` module with `import "server-only"`; expose it through an authorized handler in `app/api/<resource>/route.ts`.
- Database change: Update `prisma/schema.prisma` and add a migration under `prisma/migrations/`; keep seed changes in `prisma/seed.mjs` deterministic and environment-driven.

**Utilities:**
- Shared browser-safe helpers: Place in `lib/` and import through `@/*`; class merging already belongs in `lib/utils.ts`, and dashboard-only transforms belong in `lib/dashboard-data.ts`.
- Server-only helpers: Place in `lib/server/`, preserve `server-only`, and never import them from a file marked `"use client"`.
- Route-only helpers: Keep them under the owning route, as with `app/inventory/_data.ts`, until reuse justifies promotion.

**New API/Database Read:**
- Define canonical request/response types in a browser-safe module such as `lib/<domain>.ts`.
- Add runtime validation and Prisma mapping in `lib/server/<domain>.ts`, following `lib/server/catalog.ts`.
- Add `app/api/<resource>/route.ts`, call `requireUser()` from `lib/server/authorization.ts`, and map validation/auth/unexpected errors at the boundary.
- Call the endpoint from a focused client component with a complete TanStack Query key through the provider in `app/provider.tsx`.

## Special Directories

**`app/api/`:**
- Purpose: Next.js route handlers and Better Auth endpoint.
- Generated: No.
- Committed: Yes.

**`components/ui/`:**
- Purpose: shadcn-style generated/maintained primitive source customized for this project.
- Generated: Partly generator-originated, but treated as editable source.
- Committed: Yes.

**`prisma/migrations/`:**
- Purpose: Ordered database migration history; current foundation lives in `prisma/migrations/20260824000000_initial_foundation/`.
- Generated: Prisma tooling creates migration files, which are then reviewed source artifacts.
- Committed: Yes.

**`public/`:**
- Purpose: Root-served static assets referenced by components such as `components/app-sidebar.tsx` and `components/app-header.tsx`.
- Generated: No.
- Committed: Yes.

**`docs/adr/` and `docs/product/`:**
- Purpose: Architecture decisions and product/domain source material; ADR status must be checked before treating a proposal as an implemented constraint.
- Generated: No.
- Committed: Yes.

**`.planning/codebase/`:**
- Purpose: Generated codebase maps for planning/execution agents.
- Generated: Yes.
- Committed: Repository policy determines commit handling; this mapper writes files but does not commit them.

**`data/`:**
- Purpose: Local PostgreSQL files mounted by `docker-compose.yml`; never use as source, migration history, or a backup artifact.
- Generated: Yes.
- Committed: No; ignored by `.gitignore`.

**`.next/`:**
- Purpose: Next.js development/build output and generated route/type artifacts.
- Generated: Yes.
- Committed: No; ignored by `.gitignore`.

**`node_modules/`:**
- Purpose: Installed dependency tree from `package-lock.json`.
- Generated: Yes.
- Committed: No; ignored by `.gitignore`.

---

*Structure analysis: 2026-08-25*
