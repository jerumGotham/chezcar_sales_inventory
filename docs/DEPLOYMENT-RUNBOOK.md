# Deployment Runbook

The ordered commands that load a deployed database after the application image
is already running. Everything here is run from a workstation, not from inside
the container: two of the steps read the workbook, which lives on the operator's
machine and is deliberately not in the repository or the image.

`docs/DEPLOYMENT.md` covers the image, Coolify, and the release record. This file
covers only the data.

## Before starting

- The deploy has finished. Coolify runs `npm run db:migrate:deploy` as its
  pre-deployment command, so the schema is normally already current; step 2
  confirms it rather than assuming it.
- A backup exists. Every step below writes, and steps 3 and 4 delete.
- The workbook and the CSV export of its September sheet are on this machine.

## 1. Point the shell at the target database

Exported, never passed through `--env-file`: that flag reads the local `.env`
and would quietly send the whole runbook at the development database.

```bash
export DATABASE_URL='postgresql://<user>:<password>@<host>:<port>/<database>?schema=public'
```

Confirm what is actually connected before going further:

```bash
node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.hostname, u.pathname)"
```

## 2. Apply migrations

```bash
npx prisma migrate deploy
npx prisma migrate status   # expect: Database schema is up to date!
```

`npx prisma migrate dev` and `npm run db:migrate` are development commands: they
can generate migrations and reset the database. Never point either at a deployed
environment.

## 3. Load the catalogue

Replaces the products with the workbook's September sheet. Products only; the
photos are step 4.

```bash
node _staging-load.mjs
```

Add `--yes` to skip the ten second pause before it deletes.

## 4. Upload the product photos

Photos cannot ride along with step 3. That step writes database rows, while the
files have to land in the server's storage volume, and a database connection
cannot put them there. This uploads through `POST /api/products/:id/image`, the
same path the Products screen uses, so the server writes each file where it
expects to find it again.

Chrome opens on the sign-in page and waits for a human to sign in; the script
borrows the session afterwards and never sees the password.

```bash
node _staging-images.mjs --base=https://<host> --dry-run   # match and report only
node _staging-images.mjs --base=https://<host> --limit=5   # try a few first
node _staging-images.mjs --base=https://<host>
```

This needs a persistent volume mounted for `PRODUCT_IMAGE_STORAGE_PATH`. Without
one the uploads succeed and then disappear on the next redeploy.

## 5. Suppliers

Promotes each distinct product brand into a Supplier, using the brand text as
both the name and the code, and links every product to its own. Also clears
placeholder brands such as a lone dot, so they never become suppliers.

```bash
node prisma/seed-suppliers-from-brands.mjs
```

## 6. Reorder levels

2 across the catalogue, 20 for perfume.

```bash
node prisma/seed-reorder-levels.mjs
```

## 7. Opening branch stock

Reads columns I to M of the CSV export — QC, BL, LU, VC, SP — and writes the
counts as branch balances. Refuses to write if any row disagrees with its own
TOTAL STOCK AVAILABLE, which is the guard that the column mapping is still
right.

```bash
node prisma/seed-branch-stock.mjs --file="<path to the September CSV>" --dry-run
node prisma/seed-branch-stock.mjs --file="<path to the September CSV>"
```

Read the dry run before the real one:

| Output | Meaning |
| --- | --- |
| `unknownProducts` not empty | The catalogue is missing those item codes; step 3 did not run, or ran against another database |
| `unknownBranches` not empty | A branch code in the sheet has no location |
| `skippedUnnamedRows` | Sheet rows with an item code but no name, which never became products |
| `written: 0` and `unchanged: 0` | Nothing matched at all; check step 1 |

## Order matters

Steps 5 to 7 all read products, so step 3 has to come first. Step 7 also needs
step 5 only if the branch figures are to be read alongside a brand; the stock
itself does not depend on it.

Every seeder in steps 5 to 7 is safe to run again: they set values rather than
adding to them, and report nothing changed on a second run.

## Scripts used here

`_staging-load.mjs` and `_staging-images.mjs` are committed despite the
`_*.mjs` scratch rule, because this runbook depends on them. A fresh clone that
cannot run these steps is a runbook that does not work.

`_staging-images.mjs` imports `playwright-core`, which the project gets through
`@playwright/mcp` rather than declaring itself. `npm ci` installs it today, but
a step that matters should not rest on another package's dependency: if that
import ever fails, add `playwright-core` to `devDependencies` rather than
working around it.
