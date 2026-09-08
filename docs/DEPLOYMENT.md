# Coolify Deployment

The application is built from the checked-in `Dockerfile`. GitHub Actions verifies every pull request and push to `main`. A successful `main` push publishes that verified image to GitHub Container Registry (GHCR) with immutable commit-SHA and mutable `production` tags. Coolify deployment is manual at `https://chezcar.antiguasbakeandcuisine.com`.

The current Coolify target is **staging, not the final production environment**. The image tag `production` and Next.js `NODE_ENV=production` describe the image/runtime, not the business environment or permission to erase data. Use staging-specific database credentials and storage. The existing migration and first-owner flows below are deployment procedures; they must not be confused with the separate manual staging reset.

## Staging Deployment Record

On 2026-09-08, Coolify successfully deployed immutable image `ghcr.io/jerumgotham/chezcar_sales_inventory:2d0fc80a1228df2e74ea8523e0a6bc6aa59d8e3b` to the existing Chezcar application. The application is now pinned to that SHA, not the mutable `production` tag. Future releases must select a newly verified SHA deliberately; GitHub publication alone does not redeploy this resource.

- [CI run 34248064320](https://github.com/jerumGotham/chezcar_sales_inventory/actions/runs/34248064320) passed typecheck, lint (with existing warnings), unit/integration tests, application build, Docker build, and image publication. No local test/build commands were run during this release.
- A private PostgreSQL custom-format backup and storage archive were saved on the staging host before migrations. The database archive restored successfully into a separate temporary database, which was removed afterward. Backup paths and credentials are intentionally not published here.
- All 48 checked-in migrations in that image were confirmed applied in staging, including optional Warranty photos and Backjob items/deletion. They were applied from the intended image in a one-off container before the Coolify rolling update; the ordinary migration-only hook remains configured. This does not establish local-database migration status.
- The old staging database had no users, locations, or products. No historical-data purge was needed. With explicit operator approval, a locked empty-database bootstrap created one Owner Admin credential using the authorized local seed configuration, retained only its owner role, and initialized the six project locations (five branches and Stock Room). No credentials were printed or committed, and no full catalog seed or staging-reset command was executed.
- Post-deployment counts: 1 User, 1 RoleDefinition, 1 credential Account, 6 Locations; 0 Products, Suppliers, Personnel, Customers, Sales, Customer Orders, Inventory Balances, Backjobs, Customer Warranties, and Supplier Claims. Normal sign-in creates a session; these counts describe initialization, not a permanent invariant.
- `/api/health` returned `200 {"status":"ok"}`; Admin sign-in returned 200. Sales by Salesperson loaded, its JSON returned the empty initialized dataset, and its PDF response returned 200 with PDF content type and signature. These are focused release checks, not a populated-data workflow or visual PDF regression suite. The destructive staging-reset tool itself remains unexecuted.
- Warranty and Supplier Claim runtime storage paths are configured under the existing `/app/storage` volume. The same immutable image was redeployed to activate those environment settings; this did not rerun initialization or clear new data.

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
DATABASE_URL=<environment-specific PostgreSQL URL; currently staging>
BETTER_AUTH_SECRET=<at least 32 random characters>
BETTER_AUTH_URL=https://<public application domain>
RECEIPT_STORAGE_PATH=/app/storage/receipts
PRODUCT_IMAGE_STORAGE_PATH=/app/storage/products
WARRANTY_STORAGE_PATH=/app/storage/warranty-evidence
SUPPLIER_CLAIM_STORAGE_PATH=/app/storage/supplier-claim-evidence
```

Optional browser-push variables:

```text
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key, also set as a Docker build argument>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:<operator email>
```

Mount persistent storage at `/app/storage`. Do not expose either upload directory directly through the proxy.

Use a dedicated PostgreSQL database reachable from the application container, separate for staging and final production. `localhost` inside the application container is not the Coolify database service. Keep database and application secrets out of Git and GitHub Actions.

## First Deployment

1. Confirm the verified `production` image exists in GHCR.
2. Create or select the environment's PostgreSQL database (currently staging) and record its internal connection URL.
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

## Manual Staging Reset

`npm run db:staging:reset` is a dedicated destructive staging maintenance tool, **dry-run by default**. It is not a seed: it creates no fixture products, users, roles, locations, opening balances, or passwords. The existing `db:data:reset` local-only guard is unchanged and must never be bypassed to target Coolify. The new entry point is `prisma/reset-staging-data.mjs`, included by the Dockerfile's existing `/app/prisma` copy; it needs no `scripts/` directory or `.env` file in the image.

The staging reset command itself has not been executed, including dry-run; the separate release and empty-database initialization are recorded above. Independently verify the current staging host/database/owner identity before any future reset. Do not infer it from the public application domain, local Compose configuration, image tag, or examples below.

1. Arrange a maintenance window. Stop application replicas, background workers/reminders, integrations, and offline sync writers; block incoming traffic and stop concurrent deployments/migrations. A proxy maintenance page alone does not stop background writes. Use a one-off shell/container from the intended immutable image on the staging database network with the same protected runtime database configuration, without starting Next.js. Keep writers stopped until post-reset inspection is complete. Table locks protect the transaction, not writes queued after commit.
2. Create and verify a restorable logical PostgreSQL backup and a corresponding private-storage backup before proceeding. Record the image SHA, database connection identity, existing owner User ID/email, and its RoleDefinition ID. Identify ownership through `RoleDefinition.isOwner=true`, not `User.role`, role name, scope, or permission grants. Confirm that exactly one user has that role and has already completed password setup; know its working login before maintenance. Backups contain credentials and private evidence and must remain restricted.
3. Review/apply any pending migrations through the separate approved backed-up migration workflow before attempting reset. The reset neither applies migrations nor repairs drift; it refuses missing/unknown tables or columns, unapplied/unknown migration names, unresolved migration failures, or unsupported trigger/schema shapes. Resolve refusals by reviewing the target/image/schema, never by weakening the tool's checks.
4. Inject the following temporary process environment variables into the maintenance shell. Keep the existing `DATABASE_URL` secret and unchanged. Substitute the independently confirmed actual values, not literal placeholders. Do not persist reset confirmation variables in Coolify's ordinary application configuration, shell history, Git, or startup commands.

```text
DATABASE_URL=<existing staging PostgreSQL URL, including its existing credentials>
APP_ENV=staging
STAGING_RESET_HOST=<exact hostname in DATABASE_URL, not the public app hostname>
STAGING_RESET_PORT=<explicit URL port, or 5432 if omitted>
STAGING_RESET_DATABASE=<exact decoded database name in DATABASE_URL>
STAGING_RESET_OWNER_ID=<existing owner User.id>
STAGING_RESET_OWNER_EMAIL=<existing owner User.email, exact case>
STAGING_RESET_ROLE_ID=<existing owner's RoleDefinition.id with isOwner=true>
STAGING_RESET_CONFIRM=RESET STAGING <host>:<port>/<database> OWNER <owner-id> <owner-email> ROLE <role-id>
```

`NODE_ENV=production` may remain unchanged. Only `APP_ENV=staging` is accepted as the environment gate. There is no override for recognized localhost/development/test/maintenance targets, including `chezcar_test_01_13`. A remote staging database may share an application database name such as `chezcar_db`; the independently confirmed endpoint and database together identify the target, not that name alone. The URL must use PostgreSQL, name a host/user/database explicitly, and use only optional `schema=public` and `sslmode=disable|require|verify-ca|verify-full` query parameters. Other schemas, connection-routing parameters, and unsupported SSL query parameters are refused rather than guessed. Use the reviewed direct staging endpoint; a matching URL hostname is not independent proof of where a proxy/DNS alias routes. The connected database name is checked with `current_database()` and server address/port/user are displayed for operator review.

5. Run the default dry-run from `/app`. It connects, checks identity/schema/owner credentials, acquires the same exclusive table locks, reports exact per-table before/delete/keep counts, and rolls back without UPDATE/DELETE or enabling the immutable-reset guard. Review the displayed target and connected identity, owner details, all Location counts, and every deletion count. It can temporarily block reads/writes; lock waits time out after 10 seconds and statements after 120 seconds.

```bash
npm run db:staging:reset
```

6. Only after backup and dry-run review, run the explicit apply. It repeats all checks/counts under fresh locks; a prior dry-run does not freeze the database or authorize a different target.

```bash
npm run db:staging:reset -- --apply
```

7. Retain the protected operator output. A successful apply prints final per-table counts after committing; discrepancies cause rollback. If the connection fails around COMMIT, do not assume rollback or blindly retry: keep writers stopped and inspect actual database state. Remove the temporary reset variables after maintenance. Before reopening traffic, inspect the preserved owner/role/locations and empty tables, then resume the application deliberately and sign in again with the **same owner email/password**. Every old session, including the owner's, has been revoked. Do not run a seed or provision-owner command afterward. Discard/reconcile stale browser offline queues and cached staging data before allowing clients to reconnect; the server reset cannot erase client disks.

The only retained application rows are the existing owner User, exactly its explicit owner RoleDefinition (all fields/grants unchanged), its existing `credential` Account, its existing UserLocation assignments, and **all** Location rows including inactive branches and Stock Room/warehouse rows. All credential fields including the password hash and timestamps remain unchanged except access/refresh/ID token values and their expiry fields, which are set to null. The owner must already be active, unbanned, and not require credential setup; the tool refuses rather than changing any of those fields. It validates a nonempty existing credential hash, not the password itself. `_prisma_migrations` is preserved in full. See [Database](DATABASE.md#staging-reset-contract) for the deletion and audit-reference contract.

### Residual Private Files

All deleted product/evidence records lose their database file references, but the tool deliberately performs **no disk deletion**. It does not emit file keys into logs. Product images, receipt photos, warranty intake photos, and Supplier Claim evidence can remain in the configured private directories (`PRODUCT_IMAGE_STORAGE_PATH`, `RECEIPT_STORAGE_PATH`, `WARRANTY_STORAGE_PATH`, `SUPPLIER_CLAIM_STORAGE_PATH`), including defaults under `data/` if those paths were not configured. Backjob binary upload remains unimplemented. Preserved owner fields, including any `User.image` value, are not scrubbed.

After the database and storage backups are verified and reset has committed, authorize a **separate** file-cleanup operation: derive an exact old-key manifest from the protected backup, resolve the actual staging-only roots/volumes, exclude any retained/shared files and owner image, validate canonical paths and symlink boundaries, and delete only reviewed keys under those roots. Keep uploads/writers stopped during that cleanup. Do not broadly remove `/app/storage`, `data/`, a mounted volume, or PostgreSQL's data directory; those paths may contain shared or retained data. Missing/unreferenced old uploads also need a separately reviewed storage inventory, not a guessed wildcard deletion. Database rollback cannot recover disk deletions. Leave residual files private until this separate work is authorized.

Never add staging reset to Coolify's pre-deployment command, a startup hook, CI, healthcheck, migration, or automatic seed. Keep the existing migration-only pre-deployment command; resetting remains an explicit manual maintenance operation and is forbidden on final production.
