# Coding Conventions

**Analysis Date:** 2026-08-25

## Naming Patterns

**Files:**
- Use Next.js App Router names for framework entry points: `page.tsx`, `layout.tsx`, and `route.ts`, as in `app/products/page.tsx`, `app/layout.tsx`, and `app/api/products/route.ts`.
- Use lowercase kebab-case for shared component modules, such as `components/page-shell.tsx`, `components/simple-table.tsx`, and `components/app-layout-shell.tsx`.
- Use lowercase utility/domain module names under `lib/`, such as `lib/catalog.ts`, `lib/dashboard-data.ts`, and `lib/server/authorization.ts`.
- Keep tightly scoped route support files beside the route; examples are `app/sign-in/sign-in-form.tsx`, `app/inventory/_data.ts`, and `app/customers/CustomerHistoryTabs.tsx`. The capitalized `CustomerHistoryTabs.tsx` is an existing exception to the usual kebab-case module style.

**Functions:**
- Use camelCase for functions and event handlers: `formatPeso`, `safeNumber`, and `groupTopProducts` in `lib/dashboard-data.ts`; `handleApplyFilters` and `handleResetFilters` in `app/products/page.tsx`.
- Prefix UI event handlers with `handle`, as demonstrated by `handleSubmit` in `app/sign-in/sign-in-form.tsx` and filter handlers in `app/products/page.tsx`.
- Use PascalCase for React component functions: `PageShell` in `components/page-shell.tsx`, `SimpleTable` in `components/simple-table.tsx`, and `SignInForm` in `app/sign-in/sign-in-form.tsx`.
- Use uppercase HTTP method names for route-handler exports, such as `GET` in `app/api/products/route.ts` and `app/api/inventory/route.ts`.

**Variables:**
- Use camelCase for local state, derived values, and mutable variables, such as `selectedProduct`, `showingFrom`, and `reactSelectStyles` in `app/products/page.tsx`.
- Prefix boolean state with `is` where practical: `isSubmitting` in `app/sign-in/sign-in-form.tsx` and `isLoading`, `isFetching`, and `isEditOpen` in `app/products/page.tsx`.
- Use uppercase snake case for immutable fixture and option collections, such as `MONTH_OPTIONS` in `lib/dashboard-data.ts`, `AUTHENTICATED_ROLES` in `lib/server/authorization.ts`, and `CATEGORY_OPTIONS` in `app/products/page.tsx`.
- Existing exported fixture collections in `lib/mock-data.ts` use lower camelCase (`customers`, `orders`, `products`); do not use that inconsistency as a reason to mix styles in a new module.

**Types:**
- Use PascalCase for type aliases and domain unions: `ProductRow`, `ProductsApiResponse`, and `InventoryStatus` in `lib/catalog.ts`; `AuthContext` in `lib/server/authorization.ts`.
- Prefer explicit unions for bounded UI/domain values, such as `ProductStatus = "Active" | "Inactive"` in `lib/catalog.ts`.
- Infer validated input types from Zod schemas with `z.infer`, as with `ProductListQuery` and `InventoryListQuery` in `lib/server/catalog.ts`.
- Keep TypeScript strict and use `unknown` at untrusted boundaries; `tsconfig.json` enables `strict`, and `authorizationErrorResponse(error: unknown)` in `lib/server/authorization.ts` narrows errors explicitly.
- Avoid new explicit `any`. Existing `react-select` style callbacks in `app/products/page.tsx`, `app/customers/page.tsx`, and similar pages are lint debt, not a pattern to extend.

## Code Style

**Formatting:**
- No formatter is configured: `package.json` has no format script, and the repository has no Prettier, Biome, or EditorConfig file. Preserve nearby formatting and avoid unrelated churn.
- Application code generally uses double quotes, semicolons, two-space indentation, and trailing commas in multiline structures; representative files are `app/products/page.tsx`, `lib/catalog.ts`, and `lib/server/catalog.ts`.
- Generated shadcn-style primitives commonly omit semicolons, as in `components/ui/button.tsx`. Match the file being edited rather than reformatting generated primitives.
- Break long JSX props and object/array literals across lines with trailing commas, following `app/products/page.tsx` and `lib/server/catalog.ts`.
- Use Tailwind utility classes for presentation and `cn()` from `lib/utils.ts` for conditional composition. Prefer semantic tokens visible in `components/ui/button.tsx` and `app/layout.tsx` over new inline style objects.

**Linting:**
- Run `npm run lint`, which executes `eslint .` from `package.json` using the flat config in `eslint.config.mjs`.
- `eslint.config.mjs` composes `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`; generated/build paths `.next/**`, `out/**`, `build/**`, and `next-env.d.ts` are ignored.
- Do not claim a lint-clean baseline: `AGENTS.md` records 104 errors and 41 warnings, primarily explicit `any` and React effect-state findings in files such as `app/products/page.tsx` and `app/job-orders/[id]/edit/page.tsx`.
- Run `npm run typecheck` for strict `tsc --noEmit` validation configured by `tsconfig.json`; do not replace this with JavaScript checks because `allowJs` is false.

## Import Organization

**Order:**
1. Put side-effect directives/imports first: `"use client"` in `app/products/page.tsx`, or `import "server-only"` in `lib/server/catalog.ts` and `lib/server/authorization.ts`.
2. Import React, Next.js, and third-party packages next; examples are React Query and `react-select` in `app/products/page.tsx`, and Prisma plus Zod in `lib/server/catalog.ts`.
3. Insert a blank line, then import project modules through `@/*`; see `app/api/products/route.ts` and `app/sign-in/sign-in-form.tsx`.
4. Use relative imports only for tightly colocated files and styles, as in `app/sign-in/page.tsx`, `app/layout.tsx`, and `app/customers/page.tsx` consumers of `./CustomerHistoryTabs`.
5. Use `import type` or inline `type` modifiers for type-only dependencies, as in `lib/server/authorization.ts`, `lib/server/catalog.ts`, and `app/users/page.tsx`.

**Path Aliases:**
- Use `@/*` for imports across top-level directories; `tsconfig.json` maps it to the repository root.
- Follow aliases recorded in `components.json`: `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, and `@/hooks`.
- Import UI primitives directly from modules such as `@/components/ui/button`, as in `app/products/page.tsx`; `components/ui.tsx` is only a partial barrel and is not the canonical import surface.

## Error Handling

**Patterns:**
- Validate route query input with exported Zod schemas before calling server logic, as in `app/api/products/route.ts` with `productListQuerySchema` and `app/api/inventory/route.ts` with `inventoryListQuerySchema`.
- Return structured API errors as `{ error: { code, message } }` with an appropriate HTTP status. Existing examples cover `400`, `401`, `403`, and `500` in `app/api/products/route.ts` and `lib/server/authorization.ts`.
- Model expected authentication and authorization failures with dedicated error classes, then centralize their response mapping in `lib/server/authorization.ts`.
- Log unexpected server failures with operation context using `console.error`, then return a generic client-safe message; see `app/api/products/route.ts` and `app/api/inventory/route.ts`.
- In browser API clients, check `response.ok`, attempt to extract the server error message, and throw an `Error` for React Query to expose; follow `fetchJson` in `lib/catalog.ts`.
- In interactive forms, expose user-safe error state and stop the submitting state on failure, as `app/sign-in/sign-in-form.tsx` does. Do not expose raw server exceptions or credentials.
- Do not treat prototype `console.log` submissions in `app/pos/page.tsx`, `app/job-orders/create/page.tsx`, or `app/reports/page.tsx` as completed error-handled mutations.

## Logging

**Framework:** console

**Patterns:**
- Use `console.error` only for unexpected server/runtime failures with a concise operation label, as in `app/api/products/route.ts`, `app/api/inventory/route.ts`, and `prisma/seed.mjs`.
- No structured logging package or observability sink is configured in `package.json`; avoid adding ad hoc verbose or sensitive logs.
- Existing `console.log` payloads in `app/pos/page.tsx`, `app/job-orders/page.tsx`, and `app/reports/page.tsx` are prototype placeholders. Do not copy them into durable workflows, and never log passwords, sessions, environment values, or customer/payment secrets.

## Comments

**When to Comment:**
- Prefer descriptive names and extracted helpers over narration; representative modules such as `lib/catalog.ts`, `lib/dashboard-data.ts`, and `lib/server/catalog.ts` are largely self-documenting.
- Add comments only for non-obvious constraints, invariants, or framework workarounds. Keep implementation status in repository documentation such as `docs/DEVELOPMENT.md`, not duplicated across source comments.
- Do not use comments to legitimize prototype shortcuts such as fixed route records in `app/customer-orders/[id]/page.tsx` or console-only submissions in `app/pos/page.tsx`.

**JSDoc/TSDoc:**
- Not routinely used. Public functions and components in `lib/catalog.ts`, `lib/server/catalog.ts`, and `components/page-shell.tsx` rely on TypeScript signatures rather than JSDoc.
- Add TSDoc only where a contract cannot be made clear through types and naming; do not add boilerplate comments to every export.

## Function Design

**Size:** Keep shared utilities focused and composable, following `safeNumber`, `matchesFilters`, and `getPendingOrders` in `lib/dashboard-data.ts`. Do not reproduce oversized page modules such as `app/products/page.tsx` or `app/pos/page.tsx`; isolate server loading, interactive controls, and feature logic when adding code.

**Parameters:**
- Use typed object parameters for multi-field inputs and props, as in `PageShell` at `components/page-shell.tsx` and query objects passed through `lib/catalog.ts`.
- Accept `unknown` for external/error values and narrow them before use, as in `lib/server/authorization.ts` and `lib/dashboard-data.ts`.
- Use generics when a helper preserves caller shape, as in `getBranches`, `getFilteredData`, and `groupTopProducts` in `lib/dashboard-data.ts`.
- Keep server contracts explicit with inferred validated types and declared return promises, as in `listProducts` and `listInventory` in `lib/server/catalog.ts`.

**Return Values:**
- Return typed API envelopes with `data`, `meta`, and `summary` for list reads, as defined in `lib/catalog.ts` and produced by `lib/server/catalog.ts`.
- Return early for guard/error branches, as in `app/sign-in/sign-in-form.tsx` and status helpers in `lib/server/catalog.ts`.
- Keep pure transformations deterministic where possible; `groupTopProducts` and `getPendingOrders` in `lib/dashboard-data.ts` are the clearest examples.

## Module Design

**Exports:**
- Use default exports for App Router pages and layouts, as in `app/products/page.tsx` and `app/layout.tsx`.
- Use named exports for shared components, utilities, contracts, schemas, and server operations, as in `components/page-shell.tsx`, `lib/catalog.ts`, and `lib/server/catalog.ts`.
- Mark server-only modules with `import "server-only"`; this boundary is present in `lib/server/prisma.ts`, `lib/server/auth.ts`, `lib/server/catalog.ts`, and `lib/server/authorization.ts`.
- Keep client boundaries explicit with `"use client"` only in components that require state, effects, handlers, or browser libraries, such as `app/sign-in/sign-in-form.tsx` and `app/provider.tsx`. Keep `app/layout.tsx` server-rendered.
- Keep API route handlers thin: authorize and validate in `app/api/products/route.ts`, then delegate persistence/query work to `lib/server/catalog.ts`.

**Barrel Files:**
- `components/ui.tsx` re-exports only a subset of UI primitives. Prefer direct imports from `components/ui/*.tsx` to avoid ambiguity and missing exports.
- No broad `index.ts` barrel convention is present under `app/`, `lib/`, or `components/`; add explicit module imports consistent with `app/products/page.tsx` and `lib/server/catalog.ts`.

---

*Convention analysis: 2026-08-25*
