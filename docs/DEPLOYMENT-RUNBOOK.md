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
- A backup exists. Every step below writes.
- The workbook is on this machine, and a CSV export of its sheet for step 7.

Every step below also accepts `--dry-run`, which writes nothing and reports what
it would do. Use it on the first run against a database you have not loaded
before, and whenever the workbook's shape has changed.

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

## 2. Confirm migrations

```bash
npx prisma migrate status   # expect: Database schema is up to date!
```

Apply them only if that reports otherwise:

```bash
npx prisma migrate deploy
```

`npx prisma migrate dev` and `npm run db:migrate` are development commands: they
can generate migrations and reset the database. Never point either at a deployed
environment.

## 3. Load the catalogue

Upserted by item code: a product already there is updated, a new one is created.
Nothing is deleted, so stock, sales history and branch prices all survive.

```bash
node prisma/import-products.mjs --file="<path to the workbook>" --skip-images
```

`--sheet="<name>"` names the sheet, and a workbook that keeps a tab per month
needs it: the importer refuses to guess between them and lists the candidates
with the flag to copy. Only a workbook with a single catalogue sheet can leave
it out.

`--skip-images` because the photos are step 4. An `.xlsx` does carry them, but
they have to reach the server's storage volume and a database connection cannot
put them there.

A product that has dropped out of the new sheet is **not** removed — the upsert
only writes what the sheet contains. Deactivate those on the Products screen.

### When the catalogue has to be replaced rather than updated

`_staging-load.mjs` deletes every product first and then imports. It is the
right tool only for a database with no operational data yet, and it protects
itself: it counts `inventoryBalance`, `inventoryMovement`, `saleLine`,
`customerOrderLine`, `stockTransferLine` and `stockReceiptLine`, and refuses
while any of them is above zero.

```bash
node _staging-load.mjs --file="<path to the workbook>"
```

Deleting a product also deletes its **branch prices** and its vehicle
compatibilities, by cascade. On a database where branches have set their own
prices, that is the whole of step 3's cost and there is no undo.

## 4. Clear the old transactions

Removes everything that records something having happened — sales, refunds,
orders, transfers, receipts, stock movements, backjobs, warranties, supplier
claims and the notifications they raised — so a branch opens on the new
catalogue without its trial runs behind it.

```bash
export ALLOW_TRANSACTION_RESET=true
node prisma/reset-transactions.mjs --host=<hostname>          # reports, deletes nothing
node prisma/reset-transactions.mjs --host=<hostname> --apply
```

Roles, users, personnel, suppliers, branches and customers are kept: they are
master data somebody typed in. Products and inventory balances are kept too,
because steps 3 and 8 are their loaders and deleting them here would only make
those steps mandatory.

The host is typed out and has to match `DATABASE_URL`, which is the guard that
matters: the connection string is exported once and stays exported, and the
mistake worth preventing is running this in a shell still pointed somewhere
else.

The balances that survive are no longer explained by any movement. That is
deliberate — they are opening figures, and the sheet is their explanation.

Four audit tables reject their own deletion through a trigger. The script sets
the flag those triggers read rather than disabling them, so they stay armed
against every other connection while it runs.

## 5. Upload the product photos

This uploads through `POST /api/products/:id/image`, the same path the Products
screen uses, so the server writes each file where it expects to find it again.

Chrome opens on the sign-in page and waits for a human to sign in; the script
borrows the session afterwards and never sees the password.

```bash
node _staging-images.mjs --base=https://<host>
```

`--limit=5` tries a few first. This needs a persistent volume mounted for
`PRODUCT_IMAGE_STORAGE_PATH`; without one the uploads succeed and then disappear
on the next redeploy.

## 6. Suppliers

Promotes each distinct product brand into a Supplier, using the brand text as
both the name and the code, and links every product to its own. Also clears
placeholder brands such as a lone dot, so they never become suppliers.

```bash
node prisma/seed-suppliers-from-brands.mjs
```

## 7. Reorder levels

2 across the catalogue, 20 for perfume.

```bash
node prisma/seed-reorder-levels.mjs
```

## 8. Opening branch stock

Reads columns I to M of the CSV export — QC, BL, LU, VC, SP — and writes the
counts as branch balances. Refuses to write if a row disagrees with its own
TOTAL STOCK AVAILABLE, which is the guard that the column mapping is still
right. A blank TOTAL is exempt: the sheet leaves plenty of them empty and they
say nothing either way.

```bash
node prisma/seed-branch-stock.mjs --file="<path to the CSV>"
```

A CSV, not the workbook: this step reads the sheet as exported.

Read a dry run first on a database you have not loaded before:

| Output | Meaning |
| --- | --- |
| `unknownProducts` not empty | The catalogue is missing those item codes; step 3 did not run, or ran against another database |
| `unknownBranches` not empty | A branch code in the sheet has no location |
| `skippedUnnamedRows` | Sheet rows with an item code but no name, which never became products |
| `written: 0` and `unchanged: 0` | Nothing matched at all; check step 1 |

## 9. Operational roles

Creates Branch Manager, Accounting and Inventory, to be handed out in User
Management. Roles only: a role is business-wide and the location scope lives on
the user, so who reaches which branch is assigned per person.

```bash
node prisma/seed-operational-roles.mjs            # reports, writes nothing
node prisma/seed-operational-roles.mjs --apply
```

Reports only without `--apply`, and writes only a role whose permissions differ
from the target, so a second run reports every role unchanged.

## Order matters

Steps 6 to 8 all read products, so step 3 has to come first. Step 9 depends on
nothing and can be run at any point. Step 4 touches neither products nor
balances, so it can run before or after them; after the import is the usual
place, because that is when the catalogue is the one the branches will open on.

Every seeder in steps 6 to 9 is safe to run again: they set values rather than
adding to them, and report nothing changed on a second run. So is step 4, which
reports nothing left to delete.

## Scripts used here

`_staging-load.mjs` and `_staging-images.mjs` are committed despite the
`_*.mjs` scratch rule, because this runbook depends on them. A fresh clone that
cannot run these steps is a runbook that does not work.

`_staging-images.mjs` imports `playwright-core`, which the project gets through
`@playwright/mcp` rather than declaring itself. `npm ci` installs it today, but
a step that matters should not rest on another package's dependency: if that
import ever fails, add `playwright-core` to `devDependencies` rather than
working around it.

`npm run db:staging:reset` is **not** usable as written. It checks its delete
order against every model in the schema and refuses when one is unaccounted
for, and `Payment`, `Refund`, `RefundLine` and `ProductBranchPrice` have been
added since it was last updated. The guard is doing its job; the list needs
extending before that script can wipe a deployed database again.
