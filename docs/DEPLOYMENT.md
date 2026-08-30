# Coolify Deployment

The application is built from the checked-in `Dockerfile`. GitHub Actions verifies every pull request and push to `main`. A successful `main` push publishes that verified image to GitHub Container Registry (GHCR) with immutable commit-SHA and mutable `production` tags. Coolify deployment is manual at `https://chezcar.antiguasbakeandcuisine.com`.

## GitHub Setup

The CI workflow uses isolated placeholder configuration and needs no production secrets. For `main`, it transfers the image built by the verification job as a short-lived workflow artifact; a main-only package-write job loads those exact bytes and publishes `ghcr.io/jerumgotham/chezcar_sales_inventory:<commit-sha>` and `ghcr.io/jerumgotham/chezcar_sales_inventory:production`. Pull-request jobs have no package-write permission. Keep `DATABASE_URL`, Better Auth credentials, VAPID credentials, and storage configuration only in Coolify.

Before deploying, push the intended commit to `main` and wait for both the CI `verify` and `publish` jobs to pass. Do not deploy a tag from a failed or incomplete workflow.

## Coolify Application

Use the existing Coolify application `chezcar-sales-inventory`, or create an image-based application with these settings:

| Setting | Value |
| --- | --- |
| Image | `ghcr.io/jerumgotham/chezcar_sales_inventory:production` |
| Exposed port | `3000` |
| Domain | `https://chezcar.antiguasbakeandcuisine.com` |
| Pre-deployment command | `npm run db:migrate:deploy` |
| Persistent storage | Volume mounted at `/app/storage` |
| Coolify HTTP healthcheck | Disabled |

Do not configure Coolify to rebuild the Git repository. The Dockerfile contains the runtime healthcheck, and `/api/health` is available for manual readiness checks. If the GHCR package is private, configure Coolify registry credentials with read-only package access; do not put a registry token in application environment variables.

Required runtime variables:

```text
DATABASE_URL=<production PostgreSQL URL>
BETTER_AUTH_SECRET=<at least 32 random characters>
BETTER_AUTH_URL=https://<public application domain>
RECEIPT_STORAGE_PATH=/app/storage/receipts
PRODUCT_IMAGE_STORAGE_PATH=/app/storage/products
```

Optional browser-push variables:

```text
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key, also set as a Docker build argument>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:<operator email>
```

Mount persistent storage at `/app/storage`. Do not expose either upload directory directly through the proxy.

Use a production PostgreSQL database reachable from the application container. `localhost` inside the application container is not the Coolify database service. Keep database and application secrets out of Git and GitHub Actions.

## First Deployment

1. Confirm the verified `production` image exists in GHCR.
2. Create or select the production PostgreSQL database and record its internal connection URL.
3. Configure the runtime variables and `/app/storage` volume above.
4. Configure the domain, port `3000`, and pre-deployment command.
5. Click **Deploy**.
6. On the first deployment, Coolify has no old application container in which to run the pre-deployment command. Open the started container's Coolify terminal and run `npm run db:migrate:deploy` once.
7. Confirm `https://chezcar.antiguasbakeandcuisine.com/api/health` returns a successful readiness response.

After all migrations are applied, provision the first owner Admin once from the Coolify application terminal. Configure these as temporary process environment variables rather than writing credentials into a file or command history:

```text
NODE_ENV=production
ALLOW_OWNER_PROVISIONING=true
PROVISION_OWNER_DATABASE=<exact database name from DATABASE_URL>
PROVISION_OWNER_EMAIL=<owner email>
PROVISION_OWNER_PASSWORD=<temporary password with at least 12 characters>
PROVISION_OWNER_NAME=<owner display name>
```

Run `npm run db:provision-owner`, confirm the success message, then immediately remove all `ALLOW_OWNER_PROVISIONING` and `PROVISION_OWNER_*` values. The create-only command verifies `current_database()`, requires the migrated immutable owner role, hashes the password through Better Auth, creates the User and credential Account atomically, requires password setup on first sign-in, and refuses to run when any owner already exists. It does not import or reset products, inventory, or other business data. Do not use the destructive local seed in production.

## Later Releases

Migrations are intentionally not run from ordinary container startup or GitHub Actions. Before a manual production deployment:

1. Create and verify a PostgreSQL backup.
2. Review the pending SQL under `prisma/migrations/`.
3. Confirm the GitHub Actions `verify` and `publish` jobs succeeded for the intended `main` commit.
4. Confirm Coolify's pre-deployment command is `npm run db:migrate:deploy`, then click **Redeploy**.
5. Confirm the migration command and `/api/health` succeed, then smoke-test sign-in, protected reads, uploads, and notification streaming.

Never run `npm run db:migrate`, `prisma db push`, or `npm run db:seed` against production. The checked-in seed is destructive catalog-development tooling and deliberately refuses production targets.

Coolify remains responsible for deployment logs, rollback, and deployment notifications. For rollback, select a previously published immutable commit-SHA image rather than assuming the mutable `production` tag still points to the earlier release. Review migration compatibility before rolling application code backward.
