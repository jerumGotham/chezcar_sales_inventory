# Coolify Deployment

The application is built from the checked-in `Dockerfile`. GitHub Actions verifies every pull request and push to `main`. A successful `main` push publishes that verified image to GitHub Container Registry (GHCR) with an immutable commit-SHA tag. After protected-environment approval, the deployment workflow promotes that exact image to the mutable `production` tag and triggers Coolify through its deployment webhook.

## GitHub Setup

Create a protected GitHub environment named `production` and add:

| Secret | Value |
| --- | --- |
| `COOLIFY_DEPLOY_WEBHOOK_URL` | The deployment webhook generated for the Coolify application. |
| `COOLIFY_API_TOKEN` | A scoped Coolify token authorized to deploy that application. |

The CI workflow uses isolated placeholder configuration and needs no production secrets. For `main`, it transfers the image built by the verification job as a short-lived workflow artifact; a main-only package-write job loads those exact bytes and publishes `ghcr.io/<owner>/<repository>:<commit-sha>`. Pull-request jobs have no package-write permission. The protected CD job promotes the approved SHA to `ghcr.io/<owner>/<repository>:production`. Keep `DATABASE_URL`, Better Auth credentials, VAPID credentials, and storage configuration only in Coolify.

Require an approval reviewer on the `production` environment. The reviewer confirms the backup and pending migration review before approving the deployment job. Disable Coolify's direct push auto-deploy so `.github/workflows/coolify-cd.yml` is the single deployment trigger after CI. The workflow rejects a successful CI run if `main` has advanced to a different commit. Repository package visibility and Coolify registry credentials with `read:packages` access must allow the server to pull the GHCR image; do not make a private application image public merely to avoid configuring registry authentication.

## Coolify Application

Configure an image-based Coolify application using `ghcr.io/<owner>/<repository>:production`; do not configure Coolify to rebuild the Git repository. Ensure each deployment pulls the updated `production` tag. Expose port `3000`. Set `/api/health` as the health-check path; it returns `200` only when the Node process can query PostgreSQL. Apply proxy-level request throttling to this public, data-free endpoint. Configure `npm run db:migrate:deploy` as Coolify's pre-deployment command so pending checked-in migrations run once in the verified release image and abort deployment on failure.

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

Migrations are intentionally not run from ordinary container startup or GitHub Actions. Before approving a production deployment:

1. Create and verify a PostgreSQL backup.
2. Review the pending SQL under `prisma/migrations/`.
3. Confirm Coolify's pre-deployment command is `npm run db:migrate:deploy` and approve the protected GitHub deployment job.
4. Confirm the pre-deployment command and `/api/health` succeed.
5. Smoke-test sign-in, protected reads, uploads, and notification streaming.

Never run `npm run db:migrate`, `prisma db push`, or `npm run db:seed` against production. The checked-in seed is destructive catalog-development tooling and deliberately refuses production targets.

The webhook confirms that Coolify accepted a deployment request; Coolify remains responsible for build logs, health gating, rollback, and deployment notifications.
