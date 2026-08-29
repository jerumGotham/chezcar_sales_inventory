# Coolify Deployment

The application is built from the checked-in `Dockerfile`. GitHub Actions verifies every pull request and push to `main`. A successful `main` push publishes that verified image to GitHub Container Registry (GHCR) with immutable commit-SHA and mutable `production` tags. Coolify deployment is manual.

## GitHub Setup

The CI workflow uses isolated placeholder configuration and needs no production secrets. For `main`, it transfers the image built by the verification job as a short-lived workflow artifact; a main-only package-write job loads those exact bytes and publishes `ghcr.io/<owner>/<repository>:<commit-sha>` and `ghcr.io/<owner>/<repository>:production`. Pull-request jobs have no package-write permission. Keep `DATABASE_URL`, Better Auth credentials, VAPID credentials, and storage configuration only in Coolify.

## Coolify Application

Configure an image-based Coolify application using `ghcr.io/<owner>/<repository>:production`; do not configure Coolify to rebuild the Git repository. Expose port `3000`, leave Coolify's optional HTTP healthcheck disabled, and use the Dockerfile's built-in Node healthcheck. `/api/health` remains available for manual readiness checks. Configure `npm run db:migrate:deploy` as Coolify's pre-deployment command so future releases apply checked-in migrations before replacement.

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

## Database Release

Migrations are intentionally not run from ordinary container startup or GitHub Actions. Before a manual production deployment:

1. Create and verify a PostgreSQL backup.
2. Review the pending SQL under `prisma/migrations/`.
3. Confirm Coolify's pre-deployment command is `npm run db:migrate:deploy`, then click Deploy or Redeploy in Coolify.
4. On the first deployment, Coolify has no old container in which to run the pre-deployment command. After that container starts, run `npm run db:migrate:deploy` once from its Coolify terminal. Later deployments run it automatically.
5. Confirm the migration command and `/api/health` succeed, then smoke-test sign-in, protected reads, uploads, and notification streaming.

Never run `npm run db:migrate`, `prisma db push`, or `npm run db:seed` against production. The checked-in seed is destructive catalog-development tooling and deliberately refuses production targets.

Coolify remains responsible for deployment logs, rollback, and deployment notifications.
