<!-- generated-by: gsd-doc-writer -->
# Configuration

This project uses checked-in configuration for Next.js, Better Auth, TypeScript, Tailwind CSS, PostCSS, React Query, Prisma, ESLint, and local PostgreSQL. Authentication plus product/inventory reads use PostgreSQL; most other business behavior remains mock-backed.

## Environment variables

Copy the sanitized `.env.example` to an untracked `.env` and replace every placeholder. `.gitignore` explicitly permits only `.env.example`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Authenticated runtime and Prisma commands | None | PostgreSQL connection used by Prisma, Better Auth, and catalog/inventory reads. |
| `BETTER_AUTH_SECRET` | Runtime | None | At least 32 random characters used to protect authentication state. Use a deployment secret. |
| `BETTER_AUTH_URL` | Runtime | Application origin | Canonical application origin, such as `http://localhost:3000` locally. |
| `SEED_ADMIN_EMAIL` | Seed only | None | Email for the first development Admin. |
| `SEED_ADMIN_PASSWORD` | Seed only | None | Admin password; the seed rejects examples and values shorter than 12 characters. |
| `SEED_ADMIN_NAME` | Seed only | None | Display name for the seeded Admin. |

Use the credentials configured for your environment and do not commit the populated file:

```dotenv
DATABASE_URL="postgresql://<user>:<password>@localhost:5435/<database>?schema=public"
BETTER_AUTH_SECRET="<at-least-32-random-characters>"
BETTER_AUTH_URL="http://localhost:3000"
```

Seed variables are needed only for `npm run db:seed`; keep production provisioning in a controlled operational workflow.

## Config file format

### Package scripts

The npm scripts in `package.json` are:

| Command | Underlying command | Purpose |
| --- | --- | --- |
| `npm run dev` | `next dev` | Start the Next.js development server. |
| `npm run build` | `next build` | Create a production build. |
| `npm run start` | `next start` | Serve an existing production build. |
| `npm run lint` | `eslint .` | Run the checked-in ESLint flat configuration; existing prototype findings currently make it fail. |
| `npm run typecheck` | `tsc --noEmit` | Run strict TypeScript checking without emitting files. |
| `npm run prisma:generate` | `prisma generate` | Regenerate Prisma Client from the checked-in schema. |
| `npm run db:migrate` | `prisma migrate dev` | Create/apply development migrations. Production uses `prisma migrate deploy`. |
| `npm run db:seed` | `prisma db seed` | Upsert development locations, products, balances, and the environment-supplied Admin. |

`package-lock.json` is present, so npm is the repository's locked package manager.

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

`prisma/schema.prisma` contains the implemented foundation only: Location, Product, InventoryBalance, User, Session, Account, and Verification. `lib/server/prisma.ts` owns the hot-reload-safe server client. `lib/server/auth.ts` configures Better Auth with the Prisma adapter and disabled public sign-up.

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
- Production database, deployment, monitoring, and external-service settings.

Do not infer production values from `docker-compose.yml`; it is local PostgreSQL configuration only.
