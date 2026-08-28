# Technology Stack

**Analysis Date:** 2026-08-25

## Languages

**Primary:**
- TypeScript 5.8.x - Strict application, route-handler, component, and configuration code in `app/**/*.ts`, `app/**/*.tsx`, `components/**/*.tsx`, `lib/**/*.ts`, `proxy.ts`, `next.config.ts`, and `tailwind.config.ts`; the declared range is `^5.8.2` in `package.json`.
- TSX with React JSX runtime - App Router pages and layouts in `app/**/*.tsx` and shared UI in `components/**/*.tsx`; `tsconfig.json` selects `react-jsx` and disallows JavaScript input.

**Secondary:**
- JavaScript (ECMAScript modules) - Prisma's development seed in `prisma/seed.mjs`, ESLint configuration in `eslint.config.mjs`, and PostCSS configuration in `postcss.config.js`; the package is ESM through `package.json`.
- CSS - Tailwind imports, theme variables, and global styling in `app/globals.css` and `app/shadcn-tailwind.css`.
- SQL - The committed PostgreSQL foundation migration in `prisma/migrations/20260824000000_initial_foundation/migration.sql`; schema authoring uses Prisma Schema Language in `prisma/schema.prisma`.

## Runtime

**Environment:**
- Node.js >=20.9.0 - Required by `package.json`; Node.js 20.20.2 is the documented clean build/type-check runtime in `README.md`.
- Browser - React client components, TanStack Query, theme persistence, and sidebar persistence execute in the browser from `app/provider.tsx`, `components/app-header.tsx`, and `components/app-sidebar.tsx`.
- Next.js server runtime - App Router server components, route handlers under `app/api/**/route.ts`, route protection in `proxy.ts`, and server-only modules under `lib/server/` execute on Node.js. No Edge runtime declaration is present.

**Package Manager:**
- npm - Version is not pinned; use `npm ci` for reproducible installation as directed by `README.md` and the scripts in `package.json`.
- Lockfile: present at `package-lock.json` using lockfile version 3.

## Frameworks

**Core:**
- Next.js 16.3.2 - Full-stack React App Router framework; routes and layouts live in `app/`, HTTP handlers in `app/api/`, and typed routes are enabled by `next.config.ts`.
- React 19.2.8 and React DOM 19.2.8 - UI rendering and client state throughout `app/**/*.tsx` and `components/**/*.tsx`.
- Tailwind CSS 4.3.3 - Utility-first styling configured through `postcss.config.js`, `tailwind.config.ts`, and `app/globals.css`; class-based dark mode and CSS-variable semantic tokens are configured in `tailwind.config.ts`.
- shadcn-style component architecture - Reusable primitives live in `components/ui/`; generator conventions and aliases are declared in `components.json`. The shadcn CLI itself is not an application dependency in `package.json`.

**Testing:**
- Not detected - `package.json` has no test script or test framework dependency, and the repository has no checked-in automated test configuration. Verification is currently build, strict type-check, lint, and manual route inspection as documented in `README.md` and `docs/TESTING.md`.

**Build/Dev:**
- Next.js CLI 16.3.2 - `npm run dev`, `npm run build`, and `npm run start` are defined in `package.json`.
- TypeScript compiler 5.8.x - `npm run typecheck` runs `tsc --noEmit`; strict, incremental, bundler-resolution settings are in `tsconfig.json`.
- ESLint 9.39.5 with `eslint-config-next` 16.3.2 - Flat configuration in `eslint.config.mjs` applies Core Web Vitals and TypeScript rules. `README.md` records existing lint failures, so lint is configured but is not a passing gate.
- PostCSS 8.5.26 with `@tailwindcss/postcss` 4.3.3 - CSS transformation is configured in `postcss.config.js`.
- Prisma CLI 6.12.0 - Client generation, development migrations, and seeding are exposed by `package.json`; the schema and migration state live under `prisma/`.

## Key Dependencies

**Critical:**
- `better-auth` 1.6.23 - Database-backed email/password sessions and Next.js auth endpoints; server configuration is in `lib/server/auth.ts`, browser client creation is in `lib/auth-client.ts`, and handlers are mounted by `app/api/auth/[...all]/route.ts`.
- `@prisma/client` 6.12.0 - Typed PostgreSQL access for authentication, authorization, products, and inventory through `lib/server/prisma.ts`, `lib/server/authorization.ts`, and `lib/server/catalog.ts`.
- `zod` 4.4.3 - Runtime validation and coercion of product and inventory query parameters in `lib/server/catalog.ts`, with route-level validation errors handled in `app/api/products/route.ts` and `app/api/inventory/route.ts`.
- `@tanstack/react-query` ^5.96.1 - Client query lifecycle and caching; the global provider and 30-second stale time are configured in `app/provider.tsx`.

**Infrastructure:**
- PostgreSQL 17 - Local database image declared by `docker-compose.yml`; Prisma selects the PostgreSQL provider and `DATABASE_URL` in `prisma/schema.prisma`.
- `@base-ui/react` ^1.3.0 and `@radix-ui/react-tabs` ^1.1.13 - Accessible primitive foundations used by modules under `components/ui/`.
- `react-select` ^5.10.2 - Rich select controls used across business pages such as `app/products/page.tsx`, `app/inventory/page.tsx`, and `app/customer-orders/page.tsx`.
- `recharts` ^3.8.1 - Dashboard charting in `app/dashboard/page.tsx`.
- `lucide-react` ^0.511.0 - Icon system used by navigation, shell, controls, and business pages, including `lib/menu.ts` and `components/app-sidebar.tsx`.
- `class-variance-authority` ^0.7.1, `clsx` ^2.1.1, and `tailwind-merge` ^3.5.0 - Variant and class composition behind shared UI and `cn()` in `lib/utils.ts`.
- `tw-animate-css` ^1.4.0 - Tailwind animation utilities imported by `app/globals.css`.

## Configuration

**Environment:**
- Runtime and Prisma commands require `DATABASE_URL`; Better Auth requires `BETTER_AUTH_SECRET` and uses `BETTER_AUTH_URL` as the canonical application origin. These names are documented without values in `docs/CONFIGURATION.md`, while the datasource reference is declared in `prisma/schema.prisma`.
- Development seeding requires `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, and `SEED_ADMIN_NAME`; only the variable names are consumed in `prisma/seed.mjs`.
- `.env` and `.env.example` are present. `.gitignore` excludes populated `.env*` files while permitting the sanitized `.env.example`; do not read or commit populated environment files.
- No startup-time typed environment parser or environment-specific checked-in configuration is present, as recorded in `docs/CONFIGURATION.md`.
- Browser-only preferences use `chezcar-theme` and `chezcar-sidebar-pinned` local-storage keys in `components/app-header.tsx` and `components/app-sidebar.tsx`; these are UI preferences, not server configuration.

**Build:**
- `next.config.ts` enables typed routes.
- `tsconfig.json` enables strict checking, `ES2017` output targeting, `esnext` modules, bundler resolution, isolated modules, no emit, and the root alias `@/*`.
- `eslint.config.mjs` applies Next.js Core Web Vitals and TypeScript presets and ignores generated/build output.
- `postcss.config.js`, `tailwind.config.ts`, and `app/globals.css` configure Tailwind processing, source scanning, design tokens, animation utilities, and class-based dark mode.
- `components.json` configures shadcn-style TSX/RSC generation, Base Nova styling, Lucide icons, and `@/` aliases.
- `prisma/schema.prisma`, `prisma/migrations/20260824000000_initial_foundation/migration.sql`, and `prisma/seed.mjs` define the implemented data foundation, migration, and deterministic development seed.
- `docker-compose.yml` supplies only a local PostgreSQL service and bind-mounted development data; it does not configure the application connection string.

## Platform Requirements

**Development:**
- Install Node.js >=20.9.0 and npm, then install the exact dependency graph with `npm ci` from `package-lock.json`.
- Run a reachable PostgreSQL instance and provide the required environment configuration before using authentication or Prisma-backed routes; local PostgreSQL 17 can be started from `docker-compose.yml`.
- Generate Prisma Client and apply the migration with the scripts in `package.json`; provision the initial development Admin through the environment-driven `prisma/seed.mjs` workflow.
- Use `npm run dev` for the application. `npm run typecheck` and `npm run build` are available; no automated test command exists, and the existing `npm run lint` debt is documented in `README.md`.

**Production:**
- Deployment target is not configured: no `Dockerfile`, Vercel project configuration, alternative host manifest, or CI workflow is checked in.
- The application requires a Node.js-compatible Next.js host, PostgreSQL, deployment-managed `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`, a production build from `npm run build`, and migration deployment outside `prisma migrate dev`.
- Production operations such as secret management, backups, restore, monitoring, rate limiting, and migration automation are not implemented; see `docs/CONFIGURATION.md` and `docs/DATABASE.md`.

---

*Stack analysis: 2026-08-25*
