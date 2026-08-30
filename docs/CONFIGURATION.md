<!-- generated-by: gsd-doc-writer -->
# Configuration

This project uses checked-in configuration for Next.js, Better Auth, TypeScript, Tailwind CSS, PostCSS, React Query, Prisma, ESLint, Vitest, read-only SheetJS workbook profiling, and local PostgreSQL. Authentication and implemented product, inventory, customer, order, sales, accounting, notification, user, role, and branch workflows use PostgreSQL; Job Orders and supporting panels remain mock-backed.

## Environment variables

Copy the sanitized `.env.example` to an untracked `.env` and replace every placeholder. `.gitignore` explicitly permits only `.env.example`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Authenticated runtime and Prisma commands | None | PostgreSQL connection used by Prisma, Better Auth, and catalog/inventory reads. |
| `PRODUCT_IMAGE_STORAGE_PATH` | Product image upload | `./data/product-images` | Private JPEG/PNG/WebP product-image directory. Mount persistent storage in deployed environments; files are served only through the authenticated product-image API. |
| `BETTER_AUTH_SECRET` | Runtime | None | At least 32 random characters used to protect authentication state. Use a deployment secret. |
| `BETTER_AUTH_URL` | Runtime | Application origin | Canonical application origin, such as `http://localhost:3000` locally. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Runtime | Empty | Optional comma-separated additional browser origins for local LAN device testing. |
| `SEED_ADMIN_EMAIL` | Seed only | None | Email for the first development Admin. |
| `SEED_ADMIN_PASSWORD` | Seed only | None | Admin password; the seed rejects examples and values shorter than 12 characters. |
| `SEED_ADMIN_NAME` | Seed only | None | Display name for the seeded Admin. |
| `ALLOW_OWNER_PROVISIONING` | One-time production bootstrap | None | Must equal `true` for `db:provision-owner`; remove immediately after success. |
| `PROVISION_OWNER_DATABASE` | One-time production bootstrap | None | Exact database name expected from `DATABASE_URL` and `current_database()`. |
| `PROVISION_OWNER_EMAIL` | One-time production bootstrap | None | Email for the first immutable owner Admin. |
| `PROVISION_OWNER_PASSWORD` | One-time production bootstrap | None | Temporary owner password; hashed before storage and changed at first sign-in. |
| `PROVISION_OWNER_NAME` | One-time production bootstrap | None | Display name for the first owner Admin. |
| `ALLOW_CATALOG_RESET` | Local catalog seed/reload and the phase gate only | `true` in `.env.example` | Must equal `true`; accepts only the exact local Compose URL or disposable test URL and refuses production or unknown targets. |
| `ALLOW_OPERATIONAL_DATA_RESET` | `db:data:reset` only | `true` in `.env.example` | Accepts only the exact local Compose or disposable test URL and preserves users/auth, roles, products, and locations. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser push only | Empty | Public VAPID key exposed to authenticated browsers for PushManager subscription. |
| `VAPID_PRIVATE_KEY` | Browser push only | Empty | Private VAPID key used server-side for best-effort browser push delivery attempts. |
| `VAPID_SUBJECT` | Browser push only | `mailto:admin@example.invalid` | Contact subject passed to push providers. Use an owner/operator email or HTTPS URL. |

Use the credentials configured for your environment and do not commit the populated file:

```dotenv
DATABASE_URL="postgresql://<user>:<password>@localhost:5435/<database>?schema=public"
BETTER_AUTH_SECRET="<at-least-32-random-characters>"
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:3000,http://192.168.1.14:3000"
RECEIPT_STORAGE_PATH="./data/receipt-photos"
PRODUCT_IMAGE_STORAGE_PATH="./data/product-images"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<base64url-public-key>"
VAPID_PRIVATE_KEY="<matching-private-key>"
VAPID_SUBJECT="mailto:<operator-or-owner-email>"
```

Notification realtime delivery reuses `DATABASE_URL` for one dedicated PostgreSQL `LISTEN/NOTIFY` connection per Node application instance. No Redis or extra broker is required for the current SSE implementation. Proxies should not buffer `/api/notifications/stream`; the route sends `X-Accel-Buffering: no` and heartbeat comments every 25 seconds.

Browser push notifications are enabled only when both VAPID keys are present. Without them, durable in-app notifications and SSE still work, but the browser push opt-in button remains unavailable. Push provider acceptance never marks a notification read.

`RECEIPT_STORAGE_PATH` and `PRODUCT_IMAGE_STORAGE_PATH` control private image volumes. For Coolify, mount a persistent volume or bind mount at `/app/storage`, then use paths such as `/app/storage/receipts` and `/app/storage/products`; Coolify documents `/app` as the container base directory for persistent storage. Do not expose either directory as a public static folder. Seed variables are needed only for `npm run db:seed`; keep production provisioning in a controlled operational workflow.

## Config file format

### Package scripts

The npm scripts in `package.json` are:

| Command | Underlying command | Purpose |
| --- | --- | --- |
| `npm run dev` | `next dev` | Start the Next.js development server. |
| `npm run build` | `next build` | Create a production build. |
| `npm run start` | `next start` | Serve an existing production build. |
| `npm run lint` | `eslint .` | Run the checked-in ESLint flat configuration; it passes with existing warnings. |
| `npm run typecheck` | `tsc --noEmit` | Run strict TypeScript checking without emitting files. |
| `npm run test` | `vitest run --project unit` | Run Node unit tests once; pass a test path after `--` for a focused run. |
| `npm run test:integration` | `vitest run --project integration --no-file-parallelism` | Run serial integration tests against the fixed, no-bind-mount disposable PostgreSQL 17 harness. |
| `npm run data:profile -- --workbook <path> [--sheet <name> ...] --mapping-out <path> --report-out <path> --resolutions-out <path>` | `node scripts/data-onboarding/workbook-profile.mjs` | Read one selected sheet and emit JSON source evidence. Defaults to the owner workbook path, never executes formulas, and never writes beside the input. `--help` prints the contract. |
| `npm run data:generate -- --profile <path> --resolutions <path> --fixture-out <path> --mapping-out <path> [--check]` | `node scripts/data-onboarding/generate-seed.mjs` | Generate the byte-stable canonical fixture and source map from reviewed profile plus owner resolutions. `--check` refuses any byte-stale committed output. Requires complete one-to-one resolution coverage for the current workbook hash. |
| `npm run prisma:generate` | `prisma generate` | Regenerate Prisma Client from the checked-in schema. |
| `npm run db:migrate` | `prisma migrate dev` | Create/apply development migrations. Production uses `prisma migrate deploy`. |
| `npm run db:migrate:deploy` | `prisma migrate deploy` | Apply checked-in migrations in a controlled deployment task against a backed-up target. |
| `npm run db:seed` | `prisma db seed` | Transactionally reconcile the local canonical catalog, replace opening balances, and create or update the environment-supplied owner Admin while preserving product identities. |
| `npm run db:provision-owner` | `node scripts/provision-owner-admin.mjs` | Create the first production owner User and Better Auth credential once after migrations; refuses replacement and verifies the connected database. |
| `npm run db:catalog:reload` | `node --env-file=.env prisma/seed.mjs --catalog-only` | Transactionally reconcile canonical products, replace opening balances, and upsert the six import locations while preserving product identities, auth, and additional records; uses the same positive reset gates. |
| `npm run db:data:reset` | `node --env-file=.env prisma/reset-operational-data.mjs` | Transactionally delete local operational data while preserving users/auth, roles, products, and required locations; requires the exact approved Compose database identity. |
| `npm run verify:phase-01 -- [--validate-evidence]` | `node scripts/verify-phase-01.mjs` | Phase 1 evidence gate: asserts the disposable test target and seed/reset environment, then runs fresh migration deploy, seed, two equivalent catalog reloads, full unit/integration suites, typecheck, and build; captures lint's expected failure baseline separately and writes/validates `docs/verification/phase-01-evidence.md`. |

`package-lock.json` is present, so npm is the repository's locked package manager.

GitHub Actions builds the Coolify runtime from the root `Dockerfile` and publishes the verified image to GHCR. Deployment variables, registry access, persistent storage, and the manual Coolify release sequence are documented in `docs/DEPLOYMENT.md`.

### Vitest and workbook tooling

`vitest.config.ts` defines a Node unit project and a serial integration project (`tests/integration/**`, `--no-file-parallelism`). Vitest is pinned to the human-approved `4.1.11` release. SheetJS CE is locked to the official `0.20.3` CDN tarball rather than the stale npm-registry release.

The workbook profiler, canonicalizer, and fixture generator are developer CLIs, not upload or import endpoints; they have no HTTP or UI surface. Their `.mjs` entry points run directly on Node 20 with strict `.d.mts` TypeScript contracts. The checked-in hostile XLSX fixture is synthetic; the owner workbook remains read-only input and is excluded from quick tests.

The integration harness in `tests/helpers/database.ts` accepts only the fixed disposable identity — container `chezcar_test_postgres_01_13`, port `55435`, database `chezcar_test_01_13`, user/password `postgres`, no bind mount — starts it with Docker, applies committed migrations, and tears down only the container it started. The phase evidence gate uses the same target for its fresh migration/seed/reload sequence and removes the container before the integration project boots its own instance.

### Next.js

`next.config.ts` enables stable typed routes:

```ts
const nextConfig = {
  typedRoutes: true,
};
```

The project uses Next.js `16.3.2` with the App Router under `app/`. `package.json` requires Node.js `>=20.9.0`; the latest clean verification used Node.js `20.20.2`.

### TypeScript

`tsconfig.json` configures strict, type-check-only TypeScript for Next.js:

- target: `ES2017`
- module and resolution: `esnext` with `bundler` resolution
- JavaScript input disabled with `allowJs: false`
- strict checking enabled and library checks skipped
- output disabled with `noEmit: true`
- React automatic JSX runtime (`react-jsx`)
- incremental builds enabled
- JSON imports and isolated modules enabled
- alias `@/*` maps to the repository root (`./*`)
- included sources: `next-env.d.ts`, all `*.ts` and `*.tsx` files, `.next/types/**/*.ts`, and `.next/dev/types/**/*.ts`

### Tailwind CSS and PostCSS

`tailwind.config.ts` uses class-based dark mode and scans TypeScript/TSX files in `app/`, `components/`, and `lib/`. It extends the theme with CSS-variable-backed semantic colors, sidebar colors, a `brand` palette, variable-based border radii, and the `soft` box shadow. No Tailwind plugins are configured in this file.

The project uses Tailwind CSS `4.3.3`. `postcss.config.js` runs the separate `@tailwindcss/postcss` plugin. `app/globals.css` imports Tailwind, `tw-animate-css`, and the local MIT-attributed `app/shadcn-tailwind.css`, loads the legacy TypeScript theme config with `@config`, and defines light/dark design tokens. The shadcn CLI is not installed as an application dependency.

### shadcn components

`components.json` contains the shadcn CLI/component settings:

| Setting | Value |
| --- | --- |
| Style | `base-nova` |
| React Server Components | Enabled |
| TSX output | Enabled |
| Tailwind config | `tailwind.config.ts` |
| Global CSS | `app/globals.css` |
| Base color | `neutral` |
| CSS variables | Enabled |
| Class prefix | Empty |
| Icon library | `lucide` |
| RTL | Disabled |
| Component aliases | `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks` |
| Registries | None |

### React Query defaults

`app/provider.tsx` creates one `QueryClient` per mounted provider and wraps the application from `app/layout.tsx`. Its global query defaults are:

| Option | Value | Effect |
| --- | --- | --- |
| `staleTime` | `30,000` ms | Query data remains fresh for 30 seconds. |
| `refetchOnWindowFocus` | `false` | Returning focus to the browser window does not automatically refetch queries. |

No custom global mutation defaults, retry override, `gcTime` override, persistence, or devtools configuration is defined. TanStack Query's version-specific defaults apply to omitted options, including retries and garbage collection.

### Prisma

`prisma/schema.prisma` contains the implemented foundation only: Location, Product, InventoryBalance, User, Session, Account, and Verification. `lib/server/prisma.ts` owns the hot-reload-safe server client. `lib/server/auth.ts` configures the public Better Auth instance with the Prisma adapter and disabled public sign-up; `lib/server/internal-user-auth.ts` holds the server-only unmounted Admin-plugin credential engine used exclusively by staff-lifecycle services.

## Required vs optional settings

The authenticated runtime requires a reachable `DATABASE_URL` and a deployment-safe `BETTER_AUTH_SECRET`. Build can compile with supplied non-production values without opening a database connection, but runtime requests require PostgreSQL.

No custom validation error message is defined. Missing-variable errors therefore come from Prisma when a Prisma command or future Prisma-backed application code loads the datasource.

## Defaults

### Docker Compose PostgreSQL

`docker-compose.yml` defines one local service named `postgres`:

| Setting | Configured value |
| --- | --- |
| Image | `postgres:17` |
| Container name | `chezcar_postgres` |
| Host-to-container port | `5435:5432` |
| Data directory | `./data/sales_inventory_postgres:/var/lib/postgresql/data` |
| Database | `chezcar_db` |
| Username | Local development value is hard-coded in `docker-compose.yml` |
| Password | Local development value is hard-coded in `docker-compose.yml`; do not reuse it outside local development |

The Compose service does not populate the application's `DATABASE_URL`; construct that URL separately with placeholders as shown above. The `data/` directory is ignored by Git.

The `5435:5432` mapping publishes PostgreSQL on all host interfaces and the Compose file uses trivial development credentials. Run it only on a trusted, isolated network. For localhost-only access, change the mapping to `127.0.0.1:5435:5432`; use externally supplied nontrivial credentials for anything beyond disposable local development.

### Browser localStorage

These client-side preferences are independent of environment variables:

| Key | Values | Behavior when absent or invalid |
| --- | --- | --- |
| `chezcar-theme` | `light` or `dark` | Uses the browser's `prefers-color-scheme` value, then stores the selected theme. |
| `chezcar-sidebar-pinned` | String `true` or `false` | Sidebar state initially defaults to pinned and expanded. A stored value is treated as pinned only when it equals `true`. |

Both keys are read and written in browser-only React components, so they are not available during server rendering.

## Per-environment overrides

No `.env.development`, `.env.test`, `.env.production`, environment loader, or `NODE_ENV` conditional configuration is checked in. Next.js can load conventional local environment files, but this repository does not define project-specific development, staging, or production overrides.

For separate environments:

1. Supply distinct `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` values per environment.
2. Keep credentials in untracked local environment files or the deployment platform's secret manager.
3. Use a distinct database and credentials for each environment.
4. Do not copy the local Docker Compose credential into shared or production environments.

## Missing configuration

The following configuration is absent from the repository:

- Startup-time environment validation or typed environment parsing.
- Environment-specific configuration for development, test, staging, or production.
- Concrete production database credentials, monitoring, and external-service values. The deployment variable contract is documented, but values remain deployment-managed.

Do not infer production values from `docker-compose.yml`; it is local PostgreSQL configuration only.
