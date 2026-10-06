<!-- generated-by: gsd-doc-writer -->

# Agent Guide

## Project status

The Sales, Inventory & Monitoring System is a Next.js 16/React 19 **UI prototype**, not a production sales system. Most screens operate on page-local arrays or `lib/mock-data.ts`; interactions commonly update React state, navigate, close a dialog, or log a payload. Do not describe these actions as persistent or complete unless server and database behavior has actually been added.

Current gaps are intentional and material:

- Better Auth email/password sessions, active-account checks, action-only RoleDefinition grants, explicit owner identity, and UserLocation authorization are implemented. Public sign-up is disabled; `UserRole`, `User.locationId`, and `RoleDefinition.scope` remain compatibility storage only.
- Products, Suppliers, Personnel master data, Salesperson attribution for Direct Sales/Customer Orders, quarantine-aware Inventory and Availability, customers/orders/sales/accounting, stock receiving/transfers, Backjobs, Customer Warranty, Supplier Claims, focused reports, notifications, users, roles, and branches use PostgreSQL through Prisma. General Job Orders and some supporting panels remain mock/local behavior.
- Receipt verification is manual side-by-side review of persisted sale details and private uploaded evidence. Verification requires evidence-view access in addition to the verification capability; receipt OCR and automatic extraction are intentionally absent. Every uploaded receipt photo, and the branch's own preview before upload, opens in a magnifier that zooms and pans. A payment receipt with no photo cannot be verified at all, so that panel states it plainly and offers `POST /api/accounting/payments/:paymentId/notify-evidence` under `sales:verify`, which asks the branch and the all-branch administrators once and records the moment on `Payment.evidencePendingNotifiedAt`.
- A `Payment` ledger records one row per receipt issued for money received. Order downpayments and later order payments are verified on their own Receipt Verification tab; a receipt that settles a sale mirrors that sale's review instead of being reviewed twice. Sales and Sales by Salesperson count verified receipts on their verification date, so an order's total is never double counted and a cancelled order's forfeited downpayment still appears.
- The Reports module has five live location-scoped reports in source: Sales, Sales by Salesperson, branch-only available Inventory Summary, Stock Movement, and Returns & Warranty. Sales and Sales by Salesperson read the `Payment` ledger, counting each verified receipt once; `dateBasis` selects whether the period is measured on the sale date (default) or the verification date, and both reports disclose receipts issued in the period that are still unverified. Reports are granted one at a time: `reports:sales`, `reports:salesperson-sales`, `reports:inventory-summary`, `reports:stock-movement`, and `reports:returns-warranty`, each covering both reading that report and exporting its PDF. Stock Movement pairs branch stock with units sold from posted sales in the period, grades each row by selling pace (average days between sales, Fast at one a week or better), and prints blank Actual and Variance columns for a physical count. Inventory Movements and Low Stock remain deferred; operational inventory history is intact. Each sales row says what the receipt was for: on screen the Items cell is a link opening a panel with one line per item, carrying quantity, list price, the discount taken off, the unit price charged, the line amount, and what the part fits from its vehicle compatibility; the PDF prints the same in an Items column, without the fitment. Fitment is read in one query for every product on the page, because the sales query has no row limit and a nested include would repeat a product's whole fitment list for every line that sold it. A receipt settling an order shows the order's goods and says so, with units left at zero so goods are counted once. Consult `docs/product/REPORTS-SPEC.md` for shared sales filters, historical attribution/grouping, draft/Apply dates, and PDF semantics. Sales by Salesperson needs no new migration and leaves existing pending migrations unresolved. Sales and Sales by Salesperson have been walked on screen and exported to PDF; Inventory Summary, Stock Movement, and Returns & Warranty remain source-only, with no runtime or PDF verification.
- Direct Sales carry a `soldAt` calendar day, so a branch encoding a receipt late dates it by the day the goods changed hands; the sale's `Payment.collectedAt` follows it, which is what the Sales and Sales by Salesperson reports measure. `Sale.postedAt` still records the encoding moment. The date cannot be in the future and reaches back at most 365 days.
- An order that has not been released can be amended through `POST /api/customer-orders/:orderId/lines` under `customer-orders:update`, which takes the complete set of lines. Reservations move by the difference and `onHand` is never touched, because the goods have not moved. The branch price is not editable in the dialog, and a discount is one figure off the whole order rather than a price typed over line by line, matching how a POS sale is discounted: `CustomerOrder.discountAmount` holds it, `totalAmount` is net of it, and release copies it to `Sale.discountAmount`. An order discounted line by line before this is read back as the one figure it adds up to, so opening the dialog never changes what the customer owes. Overpayment left by a smaller order is handed back as an `AMENDED_ORDER` refund and needs an acknowledgement number and a note; a larger order becomes balance owed.
- A receipt records money received, so releasing an order that is already paid in full issues none: `finalReceiptNumber` is required only when the release collects a balance. The goods still leave and the `Sale` is still written, because stock moved and the warranty starts, but it carries `receiptIssued: false`, takes the order reference as its `manualReceiptNumber`, registers nothing in `ManualReceipt`, and its Accounting review is created `VERIFIED` — there is no paper to compare, and that money was verified on the receipts that brought it in. Its `ORDER_FINAL` ledger row is written at zero and verified so the units are still counted once, and the sales reports mark the row as having no receipt rather than letting the order reference read as one.
- A posted sale's salesperson can be corrected through `PATCH /api/sales/:saleId/salesperson` under `sales:salesperson:update`. Money, receipt identity, lines, and stock are untouched; the sale and its payment ledger row move together so the salesperson report follows, the previous name is kept in `SaleSalespersonEvent`, and the change is audited.
- A customer records the kind of party it is: `INDIVIDUAL`, `COMPANY`, `GOVERNMENT`, or `RELIGIOUS_ORGANIZATION`. There is one `name` field, not a first and last name, because a company has no surname to split off; the type decides what that field is called (Customer Name, Company Name, Agency Name, Organization Name) and POS and Customer Order pickers read `name - type`. The type is optional on create and defaults to `INDIVIDUAL`, and an update that omits it leaves the stored value alone.
- The product Add/Edit modal no longer offers Category. The stored value is still submitted unchanged, because `updateProduct` writes `category` on every save and the products list still filters on it; dropping it from the payload would blank the category of every edited product.
- Money can go back to a customer. Cancelling an order asks whether the collected money is **forfeited** (the branch keeps it, sales unchanged, which is what this workflow always did) or **refunded**; a posted sale — direct, or a released order — can be refunded in full or by returned line through `POST /api/sales/:saleId/refund` under `sales:refund`. A refund is a row in its own `Refund` ledger rather than an edit of the receipt that brought the money in, because `Payment.saleId` is unique and the receipt really was collected. The Sales and Sales by Salesperson reports read it as a negative row dated the day the money went back, so a period already reported does not change underneath. A partial refund gives back the line's share of any discount, not its sticker price. Earlier refunds are subtracted from both the money and each line, so the same unit cannot be returned twice.
- A returned unit is marked sellable or quarantined. Quarantine used to be one-way — it was only ever cleared inside a warranty or supplier-claim case — so `inventory:quarantine-release` and `POST /api/inventory/:balanceId/quarantine-release` were added as the way out; releasing moves `quarantined` only, never `onHand`, because the units were always physically present.
- The Inventory branch filter accepts several branches at once. `location` takes `all`, one code, or comma-separated codes; each is access-checked separately, and an unreachable code returns 403.
- Stock transfers still `IN_TRANSIT` nudge the receiving branch and all-location users every 48 hours, starting 48 hours after dispatch and stopping 30 days after it. The sweep runs from `GET /api/notifications`, beside the receipt-evidence reminder; there is no scheduler.
- Checked-in additive migrations and an environment-driven development seed exist. The seed provisions reference catalog data, deterministic built-in roles, and the first Admin without committed credentials.
- Migrations are applied by Coolify's pre-deployment command, which has been observed to not run while the deployment still reported success, releasing a build against a database missing a column it queried. `GET /api/health` therefore compares the migrations in the image against `_prisma_migrations` and answers `503 schema-behind` when any is outstanding, and the CI deploy job fails on that rather than on the status code alone. A deploy that cannot be verified — no `APP_HEALTH_URL`, or an image whose migration folder is unreadable — fails too, because an unverifiable release is what caused the outage. Do not weaken this back to a liveness probe.
- Every money-moving or stock-moving workflow writes an `AuditLog` row, inside the same transaction so a rolled-back action leaves no entry: posting a direct sale (shared with the offline sync path), releasing a customer order, amending its lines, changing an order's or a sale's salesperson, recording and refunding payments, Accounting's verdict on a sale receipt, the branch's answer to a reported mismatch, and asking a branch for a missing payment receipt photo. Releasing and posting a direct sale went unaudited until 2026-10-03; when adding a workflow, add its entry with it rather than relying on the derived events `/api/audit` merges in.
- A system console lives at `/system` under `system:monitor`: database and per-table sizes, storage volume usage, memory and CPU load, and the application's own error log. The container's stdout belongs to Docker and the application cannot read it back, so anything worth keeping is written to `SystemLog` when it happens; the shared API error responders do that for every unexpected 500. `system:backup` adds pg_dump backups written to `BACKUP_STORAGE_PATH` and downloadable from the page. Restoring is deliberately absent: it replaces every row, and belongs in a terminal with the runbook open.
- The Sales card on the dashboard opens the **All Sales** tab, not Direct Sales, and carries its period and branch with it (`/api/sales?source=all|direct&salesPeriod&salesBranchId`). The card totals every posted sale, so the tab it opens lists order releases alongside direct sales or a branch releasing customer orders would see a smaller figure than the one it clicked; the two are read from one query differing only by `orderId: null`, and the releases are badged. The filters are measured through the dashboard's own window helper on `postedAt`, and are Admin-only as they are there; `all` means every branch, not a branch id, and reading it as one answered the dashboard's own default link with a 400. Both sales tabs carry the same filter the Customer Orders tab does -- the same card below the figures, the same selects, the same draft-until-Apply pair -- written to the URL so a reload or a shared link keeps them, and `filterBranches` comes back empty for anyone who may not filter, which is how the page decides whether to offer them at all. The tabs read All Sales, Direct Sales, Customer Orders.
- A voided sale can be deleted through `DELETE /api/accounting/receipts/:saleId` under `sales:delete-voided`, which frees its receipt number so the branch can encode it again. Voiding already returned the stock and the money; this clears the record. It is refused while a refund, customer warranty, backjob or replacement sale points at it, and the deletion is itself audited.
- Accounting can put a wrongly keyed sale right itself through `POST /api/accounting/receipts/:saleId/correct-verify` (`correctEncodedSale`), holding `sales:void-replace`, `sales:verify` and `sales:evidence:view`. When the paper is right and only the encoding is wrong there is nothing to ask the branch, so the sale is **rewritten in place** and verified rather than voided and replaced. In place is not a shortcut: `Sale` is unique on `(locationId, receiptBooklet, manualReceiptNumber)`, so a voided row would keep its claim on the number and the replacement would have to invent one the receipt does not carry. Stock moves by the difference, the `Payment` row is restated rather than voided and rewritten, and the previous lines and total survive only in the `Sale Encoding Corrected` audit entry. It is offered straight from the review, beside Confirm correct, as soon as what Accounting has written down differs from the encoding: Confirm correct asserts the encoding matches the paper, so it cannot be the button for a reader who has just written something different. It requires an attached photo, refuses to change the receipt number, and refuses outright once a refund, warranty or backjob stands on the sale -- those were worked out from the lines as they were. The branch's own answer to "Sale was encoded incorrectly" takes the same in-place route through `POST /api/accounting/receipts/:saleId/correct` under `sales:mismatch:respond`, for the same reason: the paper is right, so asking the branch for a fresh receipt number only made it invent one the receipt does not carry. It differs in the outcome -- a branch does not sign off its own correction, so the review goes back to Accounting `UNVERIFIED` with the branch finding recorded, and no photo is demanded because nothing is being verified. A branch that has already answered that its encoding was correct must change that answer first. Only one correction button is ever offered: whoever can correct and verify outright does not also see the branch's send-it-back button, because two controls that both read as correcting the sale but end in different places is a choice that gets made wrong in a hurry.
- A voided **payment** receipt can likewise be deleted through `DELETE /api/accounting/payments/:paymentId` under `payments:delete-voided`. Voiding hands the money back to the order balance but leaves the number claimed, so a branch holding a good paper receipt could not record it again. The number is claimed in two places and both are released: the `ManualReceipt` registry and the order's own unique `downpaymentReceiptNumber`. Freeing only the registry is not enough and an integration test covers exactly that. It is refused for an ACTIVE payment and for a receipt that settles a sale, which is deleted with its sale instead; the deletion moves no money and is audited.
- Developer accounts listed in `AUDIT_EXEMPT_EMAILS` (`lib/server/audit-exempt.ts`, currently `jerum@gmail.com`) are kept out of the audit trail entirely, by the developer's decision: `recordAuditLog` writes nothing for them (sign-in, failed sign-in, sign-out, every workflow entry), and `getAuditTrail` hides the derived entries it merges in from business tables. Derived entries carry only a display name, so they are matched by name and email; another user sharing the exact display name would be hidden too. The business rows themselves — sales, payments, movements — are still written.
- `npm run db:provision-support` creates a read-only support account and its role from environment variables: every capability is a view, a report or a backup, so nothing it does can change a business record. Viewing writes no audit entry, so such an account does not fill the audit trail; signing in and out is still recorded, as it is for everyone. The role is `BUSINESS_WIDE`, never `OWNER`: the schema allows exactly one owner role and the Admin holds it.
- Vitest unit and serial disposable-PostgreSQL integration suites run locally and in GitHub Actions CI. Coverage and automated browser tests do not exist.
- An earlier Node.js 20 baseline passed `npm run build`, `npm run typecheck`, and both Vitest projects; this is not verification of the current source-only changes.
- `npm run lint` passes with 24 existing warnings; do not call the repository warning-free.
- `npm audit --omit=dev` reports zero production dependency findings; the full development tree currently reports one high and one low transitive tooling finding.

## Sources of truth

Prefer executable source and configuration over prose when facts conflict. Consult these documents before broad changes:

- `README.md` — scope, current status, and entry points.
- `docs/product/PRODUCT-REQUIREMENTS.md` — proposed internal sales/inventory MVP, roles, workflows, and deferred decisions.
- `docs/product/PROVISIONAL-DATA-MODEL.md` — proposed canonical entities and Excel refinement strategy; it is not the implemented Prisma schema.
- `docs/product/GLOSSARY.md` — working domain terminology.
- `docs/adr/` — proposed product and workflow decisions; check each ADR status before treating it as locked.
- `docs/ARCHITECTURE.md` — route inventory, boundaries, data flow, and known risks.
- `docs/DEVELOPMENT.md` — coding patterns, UI conventions, and safe-change guidance.
- `docs/API.md` — the exact current authenticated HTTP surface.
- `docs/DATABASE.md` — implemented Prisma foundation, migration/seed workflow, and persistence cautions.
- `docs/CONFIGURATION.md` — environment and tool configuration.
- `docs/TESTING.md` — verification gaps and manual smoke checks.
- `docs/GETTING-STARTED.md` — local setup.

For runtime navigation, `lib/menu.ts` controls visible sidebar entries but is **not** an access-control list. `prisma/schema.prisma` is authoritative only for the implemented foundation models; future workflow shape remains provisional in product documentation.

## Essential architecture

- `app/` contains App Router pages, layouts, and route handlers. `/` redirects to `/dashboard`.
- `app/layout.tsx` composes `Providers` and `AppLayoutShell`; preserve it as a server component.
- Business pages are currently client-heavy. New routes should remain server components by default and delegate only interactive behavior to focused client components.
- `components/` contains the shared shell and presentation components; `components/ui/` contains reusable Base UI/Radix, shadcn-style primitives.
- `PageShell` is the standard business-page frame. `/pos` is the intentional full-width exception selected by `AppLayoutShell`.
- `lib/` contains shared mock records, menu metadata, dashboard helpers, and `cn()`.
- TanStack React Query is globally provided. Implemented workflows call same-origin HTTP endpoints; remaining prototype pages still use local mock query functions.
- `app/api/**/route.ts` exposes Better Auth and authenticated workflow APIs. Consult `docs/API.md` for the current Prisma-backed surface.

Keep server-only dependencies, database credentials, and future Prisma access out of client bundles.

## Commands

The following commands are backed by checked-in files:

```bash
npm ci                 # install package-lock.json exactly
npm install            # use when intentionally changing dependencies
npm run dev            # start the Next.js development server
npm run build          # request a production build
npm run start          # serve an existing build; build first
npm run typecheck      # strict TypeScript check
npm run lint           # deterministic ESLint check; currently passes with warnings
npm test               # Vitest Node unit project
npm run test:integration # serial disposable-PostgreSQL integration project
npm run prisma:generate
npm run db:migrate     # development migration; requires DATABASE_URL
npm run db:migrate:deploy # deployment migration; requires a reviewed, backed-up target
npm run db:seed        # guarded local catalog replacement; requires DATABASE_URL and SEED_ADMIN_* values
npm run db:provision-owner # guarded create-only production owner bootstrap; run once after migrations
npm run db:reset-owner-password # guarded owner password recovery; needs ALLOW_OWNER_PASSWORD_RESET and RESET_OWNER_* values
npm run db:data:reset  # guarded local reset; preserves users/auth, products, locations
docker compose up -d postgres
docker compose stop postgres
docker build -t chezcar .
```

Never report a command as passing unless the current run completes successfully; record failures, timeouts, warnings, and skipped checks explicitly. Integration tests own the fixed disposable container `chezcar_test_postgres_01_13` on port `55435` and must not overlap another run.

For current changes, run the narrowest available command and manually walk the affected route. Check responsive behavior, light/dark themes, loading/empty/error states, filters and pagination where relevant, and reload behavior. Mock endpoints can be inspected while the dev server is running with `curl --fail http://localhost:3000/api/<resource>`.

## Coding and UI conventions

- Keep strict TypeScript types; avoid new `any` usage.
- Use `@/*` for imports across top-level directories and relative imports for tightly colocated files.
- App Router pages/layouts use default exports; shared components generally use named exports.
- Use PascalCase for components, camelCase for functions/values, and uppercase names for immutable fixture or option collections.
- Match nearby double-quote, trailing-comma, and semicolon style. No formatter is configured, so avoid unrelated formatting churn.
- Reuse `components/ui/` primitives, `PageShell`, Lucide icons, and `cn()` before adding alternatives.
- Style with Tailwind and existing semantic tokens; preserve class-based dark mode, mobile-first responsiveness, table overflow, and sidebar behavior.
- Use `next/link`, `next/image`, and `next/navigation` instead of browser-level substitutes.
- If extending a mock list, preserve applied-filter state, complete query keys, page reset behavior, and `placeholderData`. Do not mistake this pattern for real data access.

## Prototype and security warnings

- Never copy remaining hard-coded users, roles, client-side permission checks, fixed route records, `setTimeout` queries, or console-only submissions into production behavior.
- Hidden buttons and menu entries do not authorize anything. Protect every future mutation and sensitive read on the server.
- Do not silently join the divergent page fixtures, `lib/mock-data.ts` shapes, and Prisma models. Establish canonical DTOs, validation, statuses, money representation, and identifiers first.
- Do not import Prisma into a client component. Add one server-only client and a deliberate repository/service boundary when persistence begins.
- Extend durable inventory and sales workflows only through validated, authorized database transactions and auditable movement records. General Job Order completion remains a prototype; do not confuse it with the implemented Backjob workflow.
- `docker-compose.yml` credentials are for isolated local development only. Never commit `.env` files or files under `data/`, and do not use the live PostgreSQL data directory as a migration or backup artifact.

## Safe change rules

1. Keep changes focused; do not rewrite an oversized page incidentally.
2. Preserve public route paths unless redirects, links, typed routes, and menu entries are updated together.
3. Inspect all consumers before changing shared UI primitives, shells, global CSS tokens, React Query defaults, or mock-data shapes.
4. Use dynamic route parameters to select real data; do not add another fixed-record dynamic page.
5. Preserve current prototype behavior while extracting smaller components or contracts.
6. Treat API shape, schema, authentication, authorization, inventory, and payment changes as cross-cutting; update affected callers and documentation together.
7. Never claim persistence, validation, security, test coverage, or deployment readiness without implementation and verification evidence.

## Recommended implementation order

For production work, proceed incrementally:

1. Reconcile UI needs with canonical domain contracts and validation schemas.
2. Extend the committed foundation migration additively as each canonical workflow is implemented.
3. Add deterministic unit, route, and database integration tests plus dependable type-check/lint scripts.
4. Expand the existing authentication, action-capability, and UserLocation authorization to each new server workflow.
5. Implement transactional mutations one workflow at a time, with auditability and concurrency/idempotency protections.
6. Add end-to-end coverage and CI only after local commands and durable workflows are reliable.

Do not begin with high-risk stock or payment mutations merely because their UI already exists.

## Documentation maintenance

When a change alters routes, commands, environment variables, API contracts, schema/runtime database status, authentication, tests, or architectural boundaries, update the corresponding root or `docs/*.md` file in the same change. Preserve the distinction between implemented facts and future recommendations, remove stale warnings only after verifying the replacement behavior, and keep this file operational rather than duplicating detailed inventories from the linked documents.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
