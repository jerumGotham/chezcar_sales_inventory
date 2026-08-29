<!-- generated-by: gsd-doc-writer -->
# Development

This guide covers development of the Chezcar Sales & Inventory UI prototype. The repository is hybrid: documented workflows use authenticated Prisma/PostgreSQL APIs, while Job Orders and some supporting panels remain mock/local. Preserve that distinction when changing or reviewing the code.

## Local setup

1. Fork the repository if you plan to contribute through a pull request, then clone your fork. The current repository remote is `https://github.com/jerumGotham/chezcar_sales_inventory.git`:

   ```bash
   git clone https://github.com/<your-user>/chezcar_sales_inventory.git
   cd chezcar_sales_inventory
   ```

2. Install exactly the dependencies recorded in `package-lock.json`:

   ```bash
   npm ci
   ```

   Use `npm install` only when intentionally changing dependencies or regenerating the lockfile.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the URL printed by Next.js. Unauthenticated requests redirect to `/sign-in`; after sign-in, the root route redirects to `/dashboard`.

Create an untracked `.env` from `.env.example`, start PostgreSQL, apply migrations, and seed the first Admin before using authenticated routes. `package.json` requires Node.js `>=20.9.0`; the latest clean verification used Node.js `20.20.2`.

The framework baseline is Next.js `16.3.2`, React `19.2.8`, and Tailwind CSS `4.3.3`. Authentication, authorization, migrations, and automated tests cover the implemented foundation, but browser coverage, CI, deployment, recovery, monitoring, and several workflows remain incomplete.

## Repository layout

```text
app/                         App Router layouts, pages, and route handlers
  api/                       Better Auth plus protected mock/Prisma read endpoints
  inventory/_data.ts         Inventory-specific types, fixtures, and helpers
components/                  Shared application shell and presentation code
  ui/                        Base UI/Radix-backed, shadcn-style primitives
lib/                         Shared fixtures, navigation, dashboard helpers, and cn()
prisma/schema.prisma         Implemented auth, catalog, sales, inventory, and workflow models
public/                      Logo and avatar assets
data/                        Ignored local PostgreSQL files created by Compose
docker-compose.yml           Optional local PostgreSQL 17 service
components.json              shadcn component-generation configuration
next.config.ts               Next.js configuration and typed routes
tailwind.config.ts           Tailwind paths, semantic colors, and design extensions
tsconfig.json                Strict TypeScript and the @/* root alias
```

Routes are organized by URL and business area under `app/`. Shared shell and visual building blocks belong under `components/`; genuinely cross-route data and helpers belong under `lib/`. Most existing feature pages also contain their own types, fixtures, filtering, and UI. That colocation is prototype debt, not a preferred architecture for new production behavior.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete route inventory and current data flow.

## App Router and client/server patterns

### Conventions worth following

- Keep `app/layout.tsx` server-rendered. It owns global CSS, font metadata, `Providers`, and `AppLayoutShell`.
- Keep route files server components by default. Add `"use client"` only when that file directly needs state, effects, event handlers, browser APIs, or client-only libraries.
- Put HTTP handlers in `app/api/<resource>/route.ts` and return JSON with Next.js route-handler APIs. Existing handlers show file placement, but not a production API contract.
- Use `next/link`, `next/image`, and `next/navigation` rather than browser-level replacements.
- Use the configured `@/*` alias for imports across top-level directories. Relative imports are appropriate for tightly colocated route files such as `./CustomerHistoryTabs`.
- Keep browser-only access such as `window.localStorage` inside client components and effects, as demonstrated by `components/app-sidebar.tsx` and `components/app-header.tsx`.

### Prototype debt not worth copying

- Every business `page.tsx` currently starts with `"use client"`. Do not make a new route client-only merely because existing routes do. Prefer a server page with focused client children for filters, dialogs, forms, charts, and other interactions.
- Do not import Prisma into client code. A future database path needs a server-only client plus validated route handlers, server actions, or application services.
- Do not treat client-side role checks, hidden navigation entries, or the hard-coded current user as authorization.
- Do not create another large page that combines fixtures, domain types, query simulation, workflow state, and presentation. Extract focused feature components and shared contracts as the feature becomes real.
- Do not assume dynamic route parameters are already handled consistently. The customer-order detail and release pages currently display hard-coded records; validate and use route IDs in new work.
- Do not model successful mutations with `console.log`, dialog closure, navigation, or component-state updates when implementing durable behavior. Several current forms do exactly that as prototype placeholders.

## Shared UI usage

Use the existing primitives in `components/ui/` before introducing a new control. Available primitives include `Badge`, `Button`, `Card`, `Checkbox`, `Dialog`, `Input`, `Label`, `Select`, `Separator`, `Sheet`, `Table`, `Tabs`, and `Textarea`.

```tsx
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ExampleContent() {
  return (
    <PageShell
      title="Example"
      subtitle="Explain the task represented by this route."
      actions={<Button>Create</Button>}
    >
      <Card>
        <CardContent className="p-5">Content</CardContent>
      </Card>
    </PageShell>
  );
}
```

- Use `PageShell` for standard business pages so the title, subtitle, header, and action spacing remain consistent.
- Import primitives from their direct module paths. `components/ui.tsx` re-exports only a subset and is not the canonical complete barrel.
- Compose conditional classes with `cn()` from `lib/utils.ts`; it combines `clsx` and `tailwind-merge`.
- Use `buttonVariants()` when a `Link` must look like a button, as in the sidebar.
- Use Lucide icons, matching `components.json`, and include accessible labels for icon-only controls.
- Extend an existing primitive when behavior is broadly reusable. Keep feature-specific compositions near their route until more than one feature needs them.

The generated primitives use Base UI and Radix UI internally. Follow their public component props rather than relying on generated markup details.

## Mock React Query list pattern

Remaining mock list pages such as `app/job-orders/page.tsx` use this prototype pattern. Database-backed pages retain the useful applied-filter/query-key behavior but call typed same-origin APIs instead of local arrays:

1. Keep editable filter controls separate from applied filter state.
2. Reset the page to `1` when filters are applied or reset.
3. Include the page, page size, and every applied filter in the `queryKey`.
4. Have the asynchronous mock function filter and paginate an in-memory array and return `{ data, meta, summary }` or the feature's equivalent.
5. Use `placeholderData: (previousData) => previousData` to avoid clearing the list while changing pages or filters.
6. Render initial loading and background fetching states separately where the UI needs both.

```tsx
const { data, isLoading, isFetching } = useQuery({
  queryKey: ["widgets", { page, pageSize, search: appliedSearch }],
  queryFn: () => mockFetchWidgets({ page, pageSize, search: appliedSearch }),
  placeholderData: (previousData) => previousData,
});
```

This is a useful convention only while extending a mock list consistently. It simulates latency and prospective response shapes, but it does **not** exercise an API or persistence. For production work, keep stable query keys and useful response shapes while replacing `setTimeout` and local arrays with a typed client call to a validated server endpoint. Do not copy fixtures and entity types into another page: the existing page data, `lib/mock-data.ts`, and Prisma models have already drifted apart.

## Styling and coding conventions

- TypeScript is strict, output is disabled, and JavaScript source is excluded by `tsconfig.json`. Define explicit domain and component prop types; avoid adding new `any` usage.
- Components use PascalCase, functions and local values use camelCase, and immutable option/fixture collections generally use uppercase names such as `STATUS_OPTIONS` and `MOCK_CUSTOMERS`.
- Default exports are used for App Router pages and layouts. Shared components usually use named exports.
- The codebase generally uses double quotes and trailing commas in multiline structures. Semicolon usage differs between generated UI primitives and application files because no formatter is configured; keep edits internally consistent and avoid unrelated formatting churn.
- Use Tailwind utility classes for component styling. Prefer semantic tokens such as `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, and configured `brand-*` colors over introducing one-off hard-coded colors.
- Support dark mode when changing shared components. Theme values live in `app/globals.css`, and Tailwind uses class-based dark mode.
- Build responsive layouts mobile-first with the existing `md`, `lg`, and `xl` breakpoints. Preserve table overflow behavior and the sidebar's desktop/mobile layouts.
- Put reusable theme values in `app/globals.css` or `tailwind.config.ts`, not repeated inline style objects.

Existing `react-select` style objects use `any` and literal colors, and several pages repeat status-color helpers and long Tailwind strings. These are examples to consolidate or replace, not conventions to spread.

## Adding a route or component

1. Decide the boundary first. Use a server page for static or server-loaded content; create a small client component only for interactive behavior.
2. Add `app/<route>/page.tsx`. Use `[id]` folders for dynamic segments and make the route parameter select real data rather than a fixed fixture.
3. Wrap standard business content in `PageShell`. Customer Sales at `/pos` uses the same authenticated shell and sidebar as the other business routes.
4. Reuse `components/ui/` primitives and `cn()`. Add a shared component under `components/` only when it has a cross-route responsibility.
5. Add a visible navigation entry to `lib/menu.ts` if users should reach the route from the sidebar. A route may intentionally exist without a menu entry, but it must still have an authorization mapping.
6. For a list prototype, follow the applied-filter/query-key pattern above. For real data, define one canonical contract, validate input on the server, and keep secrets and persistence out of client bundles.
7. Check mobile and desktop layouts, light and dark themes, keyboard focus, labels, loading/empty/error states, and direct navigation to dynamic URLs.
8. Run the available verification commands and document any command that cannot complete.

When adding a shared shadcn-style primitive, keep `components.json` aliases and the Base Nova/CSS-variable setup intact. Review generated changes before accepting them so they do not overwrite project-specific theme behavior.

## Commands

| Command | Description |
| --- | --- |
| `npm install` | Install dependencies and update the npm lockfile when package requirements change. |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Create an optimized production build and run Next.js build-time checks. |
| `npm run start` | Serve an existing production build; run `npm run build` first. |
| `npm run lint` | Run deterministic ESLint. It currently passes with existing warnings. |
| `npm run typecheck` | Run standalone strict TypeScript checking without emitting files. |
| `npm test` | Run the Vitest Node unit project once. |
| `npm run test:integration` | Run serial integration tests against the fixed disposable PostgreSQL container. |
| `npm run prisma:generate` | Regenerate Prisma Client. |
| `npm run db:migrate` | Create/apply development migrations. |
| `npm run db:seed` | Seed reference catalog data and the environment-supplied Admin. |
| `npm run db:data:reset` | Clear isolated development operational data while preserving users/auth, products, and locations; requires `ALLOW_OPERATIONAL_DATA_RESET=true`. |

There is no formatting script, browser-test script, or coverage script.

## Code style tooling

`eslint.config.mjs` uses Next.js Core Web Vitals and TypeScript flat configurations. No Prettier, Biome, or EditorConfig configuration is checked in. The linter is deterministic and currently exits successfully with existing warnings, so distinguish passing from warning-free.

Until tooling is established:

- follow the TypeScript, import, naming, and Tailwind patterns documented above;
- keep diffs focused and avoid reformatting generated primitives incidentally;
- rely on editor TypeScript diagnostics, then attempt the build and manual checks;
- call out any skipped or timed-out verification in the pull request.

## Current verification gaps

- Unit and serial PostgreSQL integration tests exist, but no DOM/browser suite, coverage threshold, or CI workflow is present.
- No formatting check is present; lint passes with existing warnings.
- Re-run unit, integration, type-check, lint, and build commands for each relevant change rather than treating an earlier local run as CI evidence.
- Manual UI use validates only the routes exercised by that workflow; direct route and service tests remain necessary.
- Mock submissions do not verify persistence, authorization, validation, transaction behavior, or reload durability.
- Implemented auth and workflow APIs have unit/integration coverage; remaining mock surfaces still lack durable contracts.

For each change, perform the narrowest relevant manual walkthrough in addition to command-based checks. For example, a list change should cover filter apply/reset, pagination, empty data, initial loading, background fetching, and responsive table overflow.

## Branch conventions

The checked-out default development branch is `main`. No branch naming convention is documented, and there is no contribution guide or pull-request template. Use a short descriptive branch such as `feature/customer-search` or `fix/sidebar-mobile-close`, but treat these as suggested names rather than an enforced repository rule.

## Pull request process

Because no repository-specific PR checklist or CI gate is checked in, contributors should provide the verification context reviewers cannot obtain automatically:

- Keep the branch and pull request focused on one behavior or refactor.
- Explain whether the change preserves mock behavior or introduces real server/persistence behavior.
- List the commands run and their exact outcome, including timeouts or skipped checks.
- Describe manual routes and states exercised; include screenshots for visible desktop, mobile, or dark-mode changes.
- Flag changes to shared contracts, route IDs, menu visibility, authorization assumptions, Prisma models, or database behavior explicitly.
- Request review before merging into `main`; do not represent local-state demos as durable completed workflows.

## Safe change guidance

- Preserve the existing public route paths unless redirects and all links are updated together.
- Treat `lib/menu.ts` as visible-navigation metadata, not an access-control list.
- Check consumers before changing shared primitives, `PageShell`, the application shell, global tokens, React Query defaults, or mock-data shapes.
- Keep client/server imports one-directional: client components may call HTTP interfaces, but must not pull database clients, credentials, or server-only modules into the browser bundle.
- Reconcile entity types before connecting a screen to Prisma. Do not silently map between the differing customer, product, order, inventory, user, and branch fixtures.
- Design inventory receiving, transfers, checkout, downpayments, releases, and job completion as server-authorized transactions before making them persistent.
- Do not reuse the literal Docker Compose credentials outside isolated local development, and do not commit `.env` files or files under `data/`.
- Avoid opportunistic rewrites of oversized pages in an unrelated feature change. Extract behavior in small steps and preserve the current interaction while adding verification.
- Do not copy hard-coded identities, client-only permissions, arbitrary timeouts, console-only submission handlers, or fixed dynamic-route records into new work.

The strongest foundations to preserve are the App Router layout, shared responsive shell, `PageShell`, reusable UI primitives, semantic theme tokens, strict TypeScript configuration, root import alias, complete React Query keys, server-only Prisma boundary, and persisted capability authorization policy. Add executable capabilities only to the client-safe catalog, define required view implications in `lib/permissions.ts`, load RoleDefinition grants on each request, require the exact action grant before parsing mutation input, and render controls from the same capability IDs. RoleScope remains the resource-location constraint; `User.role` is only synchronized operational-scope compatibility. Duplicated fixtures, oversized pages, fake mutations, and hard-coded role dropdowns are debt to retire rather than patterns to standardize.
