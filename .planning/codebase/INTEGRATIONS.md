# External Integrations

**Analysis Date:** 2026-08-25

## APIs & External Services

**Business APIs:**
- Not detected - No payment, messaging, CRM, cloud-storage, analytics, mapping, or other third-party business SDK is declared in `package.json` or imported by application source under `app/`, `components/`, or `lib/`.

**Application HTTP API:**
- Next.js same-origin route handlers - Browser code calls the application's own authenticated endpoints rather than a separate external backend.
  - SDK/Client: Native `fetch` wrapper in `lib/catalog.ts`; TanStack Query consumers live in `app/products/page.tsx` and `app/inventory/page.tsx`.
  - Auth: Better Auth same-origin session cookie; requests explicitly use `credentials: "same-origin"` in `lib/catalog.ts`.
  - Persisted reads: `GET /api/products` in `app/api/products/route.ts` and `GET /api/inventory` in `app/api/inventory/route.ts` use Prisma/PostgreSQL.
  - Protected fixture reads: `app/api/dashboard/route.ts`, `app/api/customers/route.ts`, and `app/api/customer-orders/route.ts` return in-process mock records from `lib/mock-data.ts`; these are not external integrations or durable data sources.

**Font Delivery:**
- Google Fonts via Next.js - `app/layout.tsx` imports Geist from `next/font/google`; Next.js fetches and self-hosts the generated font assets during the build rather than making a browser runtime API call.
  - SDK/Client: `next/font/google` from Next.js 16.3.2.
  - Auth: None.

## Data Storage

**Databases:**
- PostgreSQL 17 - Persistent store for Better Auth records and implemented Location, Product, and InventoryBalance reads.
  - Connection: `DATABASE_URL` referenced by `prisma/schema.prisma`; supply it through an untracked `.env` in development or the deployment secret manager.
  - Client: Prisma Client 6.12.0, instantiated as a hot-reload-safe server singleton in `lib/server/prisma.ts`.
  - Schema: `prisma/schema.prisma`; reproducible foundation migration: `prisma/migrations/20260824000000_initial_foundation/migration.sql`.
  - Local service: PostgreSQL 17 is defined in `docker-compose.yml`, with mutable local server state bind-mounted beneath ignored `data/` as documented in `docs/DATABASE.md`.
  - Current scope: Authentication plus products and the primary inventory list are database-backed through `lib/server/auth.ts`, `lib/server/authorization.ts`, and `lib/server/catalog.ts`; most UI workflows and every business mutation remain local/mock behavior.

**File Storage:**
- Local repository/static files only - Checked-in visual assets are served from `public/`; no upload endpoint, object-storage SDK, or managed file-storage service is present in `package.json` or `app/api/`.
- Local PostgreSQL development state under `data/` is a Docker bind mount configured by `docker-compose.yml`, not application file storage; `.gitignore` excludes `data/`.

**Caching:**
- No external cache - Redis, Memcached, CDN cache configuration, and durable query persistence are not detected.
- TanStack Query provides in-memory browser caching with a 30-second `staleTime` and disabled focus refetch in `app/provider.tsx`; route handlers do not define public cache headers, per `docs/API.md`.
- Next.js framework build/runtime caching uses defaults because `next.config.ts` contains no custom cache integration.

## Authentication & Identity

**Auth Provider:**
- Better Auth 1.6.23 with the application's PostgreSQL database; this is a self-hosted library integration, not an external identity provider.
  - Implementation: `lib/server/auth.ts` configures the Prisma PostgreSQL adapter, email/password authentication, disabled public sign-up, and persisted role/status/location fields.
  - Browser client: `lib/auth-client.ts` creates the Better Auth React client; `app/sign-in/sign-in-form.tsx` performs sign-in and `components/app-header.tsx` performs sign-out.
  - HTTP mount: `app/api/auth/[...all]/route.ts` exports Better Auth GET and POST handlers under `/api/auth/*`.
  - Route session enforcement: `proxy.ts` checks the session and persisted active-user status for page routes; API handlers call `requireUser()` from `lib/server/authorization.ts`.
  - Authorization: `lib/server/authorization.ts` reloads the persisted User, requires `ACTIVE` status, enforces fixed roles, and requires a location for Branch Staff inventory access.
  - Session transport: Same-origin HTTP cookie managed by Better Auth; there is no token storage in browser local storage.
  - Required configuration: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the shared `DATABASE_URL`, documented by name in `docs/CONFIGURATION.md`.
- OAuth, SAML, OIDC, social login, email verification delivery, password-reset email delivery, and public registration are not configured in `lib/server/auth.ts`.

## Monitoring & Observability

**Error Tracking:**
- None - No Sentry, Datadog, OpenTelemetry, or equivalent dependency/configuration is present in `package.json`, `next.config.ts`, or application source.

**Logs:**
- Native console/server output only - Unexpected catalog failures use `console.error` in `app/api/products/route.ts` and `app/api/inventory/route.ts`; Next.js, Prisma, and PostgreSQL otherwise use their default process/container output.
- No structured logger, log transport, request tracing, metrics exporter, health endpoint, uptime integration, or alerting service is configured.

## CI/CD & Deployment

**Hosting:**
- Not configured - No `vercel.json`, `Dockerfile`, Netlify, Render, Fly.io, or other deployment manifest is checked in. `.gitignore` mentions `.vercel`, but this does not establish a hosting integration.
- Production execution is limited to generic `next build` and `next start` scripts in `package.json`; a Node.js-compatible Next.js host and PostgreSQL must be supplied externally.

**CI Pipeline:**
- None - `.github/workflows/` is absent, and no other checked-in CI pipeline configuration is detected.
- No automated deployment, migration deployment, test gate, dependency scan, or secret injection pipeline is defined. Available local checks are `npm run build`, `npm run typecheck`, and `npm run lint` from `package.json`; the repository has no test script.

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - Prisma PostgreSQL connection for schema commands, authentication, authorization reloads, and catalog/inventory reads; referenced by `prisma/schema.prisma`.
- `BETTER_AUTH_SECRET` - Better Auth state/session protection secret; required runtime configuration documented in `docs/CONFIGURATION.md`.
- `BETTER_AUTH_URL` - Canonical Better Auth application origin; required runtime configuration documented in `docs/CONFIGURATION.md`.
- `SEED_ADMIN_EMAIL` - Seed-only initial Admin email consumed by `prisma/seed.mjs`.
- `SEED_ADMIN_PASSWORD` - Seed-only initial Admin password consumed and validated by `prisma/seed.mjs`.
- `SEED_ADMIN_NAME` - Seed-only initial Admin display name consumed by `prisma/seed.mjs`.
- `NODE_ENV` - Standard runtime mode checked only to retain the development Prisma singleton in `lib/server/prisma.ts`; it is normally set by Next.js rather than manually provisioned.

**Secrets location:**
- Development: A populated, untracked `.env` is present for local environment configuration; its contents must not be read or committed. `.gitignore` excludes `.env*` while allowing only the sanitized `.env.example` template.
- Deployment: No provider or checked-in secret-management integration is configured. Supply values through the selected host's secret manager as prescribed by `docs/CONFIGURATION.md`.
- Seed credentials are environment inputs to `prisma/seed.mjs`; no initial Admin credential is committed.

## Webhooks & Callbacks

**Incoming:**
- No third-party webhooks are implemented - `app/api/` contains Better Auth handlers and five authenticated GET endpoints only; no payment, messaging, identity-provider, or other callback receiver is present.
- Better Auth's catch-all `app/api/auth/[...all]/route.ts` handles first-party authentication requests, including email/password sign-in and session operations; it is not configured as a third-party OAuth callback.

**Outgoing:**
- No outgoing webhooks or third-party API calls are implemented.
- Browser fetches in `lib/catalog.ts` target only same-origin `/api/products` and `/api/inventory` routes.
- Post-sign-in `callbackUrl` handling in `app/sign-in/page.tsx`, `app/sign-in/sign-in-form.tsx`, and `proxy.ts` is internal navigation, not an external callback integration.

---

*Integration audit: 2026-08-25*
