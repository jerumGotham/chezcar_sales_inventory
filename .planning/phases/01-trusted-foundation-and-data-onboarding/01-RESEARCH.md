# Phase 1: Trusted Foundation and Data Onboarding - Research

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Excel evidence and initial data
- **D-01:** `excel/REALTIME INVENTORY- NEW 3.xlsx` is the basis for both canonical column/database design and the initial development/test seed dataset. It is project input, not an application upload feature. - **Reversibility:** costly - schema and seed mappings will depend on the workbook analysis.
- **D-02:** Do not copy the spreadsheet shape directly into the database. Preserve traceability from source columns to normalized canonical fields.
- **D-03:** Location codes are fixed as follows for initial analysis: `SR` is the central Stock Room; `QC`, `BL`, `LU`, `VC`, and `SP` are branches.
- **D-04:** Seed opening quantities directly from the Excel-derived dataset per location. A later physical count or discrepancy uses controlled operational workflows; it does not block initial development seeding.
- **D-05:** The developer may reset and reload seeded catalog/opening inventory at any time in development or test. Production reset-and-reload must be blocked.

### Data cleanup
- **D-06:** Suspected duplicate items are flagged for owner review. Do not merge them automatically.
- **D-07:** Rows without item codes receive generated temporary codes. The exact temporary-code format is left to the planner.
- **D-08:** A row with a negative, blank, or non-numeric quantity is blocked until reviewed and confirmed; do not silently coerce it to zero.
- **D-09:** Conflicting prices for the same item require explicit owner confirmation; no last-row or highest-price rule applies automatically.

### Role and branch experience
- **D-10:** Hide unauthorized pages and actions from navigation, while retaining independent server authorization for every request.
- **D-11:** Direct navigation to an unauthorized page shows a dedicated access-denied screen without protected data and provides a route back to the dashboard.
- **D-12:** Admin can select `All` or a specific location. Branch Staff is fixed to its assigned branch. Stock Staff defaults to `SR`.
- **D-13:** A Branch Staff account cannot be activated without a branch assignment. The user-creation form must enforce this instead of allowing an invalid account state.

### Minimal User Management
- **D-14:** Phase 1 includes an Admin-only User Management menu for creating internal users, assigning a fixed role and required location, activating/deactivating accounts, and initiating credential setup/reset. Custom permission editing is out of scope because roles remain fixed.
- **D-15:** Admin sets a temporary password and provides it through an offline channel. First login prompts the user to change it but allows the user to skip.
- **D-16:** Deactivating an account immediately revokes its active sessions.
- **D-17:** Changing an active user's role or assigned branch immediately revokes active sessions. The user must sign in again to receive the new access and branch context.

### the agent's Discretion
- Temporary item-code format and collision handling.
- Exact seed report/output format and source-column mapping artifact.
- Access-denied page presentation within the existing design system.
- User-list filtering, pagination, and form layout consistent with existing page patterns.

### Deferred Ideas (OUT OF SCOPE)
- Custom permissions beyond the fixed roles are not part of Phase 1.
- Recurring in-app spreadsheet upload/import is not requested.
- Physical discrepancy resolution belongs to the later discrepancy workflow phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-role-authorization | Server policy prevents forbidden role actions and cross-location access; every action independently enforces active user, fixed role, and persisted location scope. | Central policy manifest, persisted authorization context, page/API denial patterns, session-revoking user lifecycle, and an automated role/location matrix. |
| REQ-excel-import | Existing wording describes an Admin import UI, but D-01 corrects this to developer-only workbook profiling, canonical mapping, review, and deterministic initial seed. | Read-only workbook profile, source-to-canonical mapping pipeline, owner-review gates, deterministic seed/reset design, and database integration tests. |
</phase_requirements>

**Researched:** 2026-08-25  
**Domain:** Canonical data onboarding, PostgreSQL seeding, fixed-role/location authorization, and internal account lifecycle  
**Confidence:** MEDIUM — codebase and schema findings are HIGH; official documentation is cited; workbook statistics are conservatively marked ASSUMED because the binary source could not be opened by the required `Read` tool.

## Summary

Phase 1 should be planned as four vertical slices, not as an upload feature: (1) test infrastructure and a disposable PostgreSQL harness, (2) read-only workbook profiling plus an owner-reviewable source mapping, (3) an additive canonical schema and deterministic development/test catalog-opening-stock seed, and (4) complete role/location and Admin user-management enforcement from database to navigation. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:7-14] The current roadmap criteria 3–4 and `REQ-excel-import` still say “Admin upload/import”; they must be interpreted as developer profiling/review/seeding under D-01, while adding D-14 user management to Phase 1. [VERIFIED: .planning/ROADMAP.md:21-30] [VERIFIED: .planning/REQUIREMENTS.md:40-43]

The project already has the right boundary shape: browser-safe DTOs call same-origin route handlers; handlers use persisted active-user/role checks and server-only Prisma. [VERIFIED: app/api/inventory/route.ts:9-20] [VERIFIED: lib/server/authorization.ts:24-56] It does not yet have complete page policy, role-aware menus, durable user management, automated tests, or the real workbook seed. [VERIFIED: proxy.ts:6-48] [VERIFIED: lib/menu.ts:17-33] [VERIFIED: app/users/page.tsx:441-500]

**Primary recommendation:** first produce a reviewed, versioned canonical seed artifact from the workbook; then implement Admin user lifecycle and route/API policy against that same canonical location model, with PostgreSQL integration tests proving scope and revocation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workbook profiling and canonical mapping | Developer tooling | Database / Storage | The workbook is offline developer input; only reviewed normalized output reaches persistence. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:20-25] |
| Catalog/location/opening-stock seed | Database / Storage | API / Backend | PostgreSQL owns canonical records; a server-side seed validates and loads them deterministically. [VERIFIED: prisma/seed.mjs:90-130] |
| Active-user, role, and location policy | API / Backend | Frontend Server (page proxy) | Every data operation needs authoritative server policy; page denial is defense-in-depth and UX. [VERIFIED: lib/server/authorization.ts:24-56] [VERIFIED: proxy.ts:6-48] |
| Role-aware navigation and location selector | Browser / Client | API / Backend | The client hides unavailable options, but server-derived scope remains authoritative. [VERIFIED: lib/menu.ts:17-33] |
| Internal user creation and lifecycle | API / Backend | Database / Storage | Better Auth owns credentials/sessions while the application owns fixed role/location/status rules. [CITED: https://www.better-auth.com/docs/plugins/admin] |
| Access-denied experience | Frontend Server (SSR) | Browser / Client | Denial occurs before protected data is rendered; the page supplies navigation back to the dashboard. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:33-37] |
| Authorization and seed verification | Database / Storage | API / Backend | Real constraints, transaction behavior, and scope require a disposable PostgreSQL database, not mocks alone. [CITED: https://www.prisma.io/docs/orm/prisma-client/queries/transactions] |

## Scope Reconciliation

1. Replace roadmap success criteria “Admin can upload” and “Admin can import” with: a developer can run a read-only profiler, obtain row-level review findings, apply an approved mapping, and deterministically load development/test data. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:9-13]
2. Add a Phase 1 criterion that only Admin can list/create/update/activate/deactivate/reset internal users, with fixed roles and role-valid location assignment. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:39-43]
3. Do not plan a browser file picker, upload endpoint, staging UI, recurring import history, or production reset operation. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:113-119]
4. Do not treat prototype Users/Roles controls as reusable policy. The current screen contains mock roles such as `"Super Admin"`, `"Branch Manager"`, `"Cashier"`, and `"Inventory Staff"`, while the implemented fixed values are quoted below. [VERIFIED: app/users/page.tsx:192-199] [VERIFIED: prisma/schema.prisma:15-20]

## Workbook Evidence and Review Gates

### Read-only profile

The workbook was inspected without modification by reading its XLSX ZIP/XML members. The required binary `Read` call reported that it could not read the file, so the following discrete workbook findings remain `[ASSUMED]` under the provenance rule even though the profiling script observed them:

- The file is approximately 116,466,467 bytes and contains 21 worksheets, including hidden June/July history and visible August sheets. [ASSUMED]
- The latest rollup appears to be `"REALTIME INVENTORY AUGUST 2026"`; row 3 contains `"ITEM CODE"`, `"ITEM NAME"`, `"BRAND"`, `"CAR MODEL"`, `"YEAR MODEL"`, location-like columns, `"TOTAL STOCK AVAILABLE"`, and `"DISCOUNTED PRICE"`. [ASSUMED]
- The rollup links current quantities to branch sheets by formulas and cached values. It has two `"BL"` columns, one linked to `"BL AUGUST 2026"` and one to `"BL BEFORE"`; it has no explicit `"SR"` heading, although historical sheets named `"STOCKROOM JUNE 2026"` and `"STOCKROOM JULY 2026"` exist. [ASSUMED]
- A heuristic found about 1,434 product-like rows, but section headings and malformed rows mean the final count must come from an explicit row classifier, not this estimate. [ASSUMED]
- The profile found item code `"40"` on two distinct rows with different descriptions and prices (`"25000"` and `"30000"`), four same-description signatures with different codes, a cached quantity `"-106"`, missing quantity cells on several product-like rows, one price cell `"-"`, and hundreds of blank price cells. These are review findings, not automatic cleanup instructions. [ASSUMED]

### Planning consequences

- **Block canonical seed generation until the owner identifies which workbook source represents `SR` and explains `BL BEFORE`.** D-03 fixes canonical location codes but does not resolve the workbook’s ambiguous source columns. [ASSUMED]
- Treat latest opening quantities as source evidence, not as trustworthy merely because formula caches contain numbers. Recalculate row rules from the selected source columns, and report formula/cached-value disagreements. [CITED: https://docs.sheetjs.com/docs/api/parse-options/]
- Preserve source sheet, row, column, raw value, normalized value, rule outcome, and owner resolution in the mapping/report artifact. [ASSUMED]
- Generate temporary codes only after excluding headings and blank spacer rows; use a deterministic source-row-derived format with collision checks so reruns produce the same code. [ASSUMED]
- Duplicate-code, suspected-duplicate, invalid quantity, and conflicting-price findings must be blocking review records. Never choose a winner in code. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:27-31]

## Existing Canonical Values and Constraints

The implemented source of truth defines these values verbatim:

> `LocationType`: `"WAREHOUSE"`, `"BRANCH"`; `UserRole`: `"ADMIN"`, `"STOCK_STAFF"`, `"BRANCH_STAFF"`, `"ACCOUNTING_STAFF"`; `UserStatus`: `"ACTIVE"`, `"INACTIVE"`; `ProductStatus`: `"ACTIVE"`, `"INACTIVE"`. [VERIFIED: prisma/schema.prisma:10-30]

The user decisions define these location values verbatim:

> `"SR"` is the central Stock Room; `"QC"`, `"BL"`, `"LU"`, `"VC"`, and `"SP"` are branches. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:20-25]

The current seed conflicts with that decision: it uses `"WH-MAIN"`, `"BR-QC"`, `"BR-MKT"`, and `"BR-PSG"`; replace these fixtures only after the workbook mapping is reviewed. [VERIFIED: prisma/seed.mjs:6-11]

The existing schema already has unique product codes and unique location-product balances, but `User.locationId` is nullable and does not enforce Branch Staff assignment. [VERIFIED: prisma/schema.prisma:32-47] [VERIFIED: prisma/schema.prisma:49-79] [VERIFIED: prisma/schema.prisma:81-97] Add an application validation rule and a manually reviewed SQL check equivalent to “Branch Staff implies non-null location”; separately validate that the referenced location is a branch because a simple row check cannot inspect the related Location row. [ASSUMED]

## Project Constraints (from AGENTS.md)

- Preserve the prototype-versus-persistent distinction; most screens and every existing business mutation remain mock/local. [VERIFIED: AGENTS.md:4-16]
- Keep `app/layout.tsx` server-rendered; new routes are server components by default with focused client islands. [VERIFIED: AGENTS.md:37-48]
- Keep Prisma, credentials, and server-only dependencies out of client bundles. [VERIFIED: AGENTS.md:37-48]
- Use strict TypeScript without new `any`; use `@/*` across top-level directories; follow existing exports, naming, quotes, commas, and semicolons. [VERIFIED: AGENTS.md:73-83]
- Reuse `PageShell`, `components/ui/`, Lucide, `cn()`, Tailwind semantic tokens, class-based dark mode, responsive tables, and Next navigation/image/link APIs. [VERIFIED: AGENTS.md:73-83]
- Never use menu visibility, hard-coded roles, or client checks as authorization; protect every sensitive operation on the server. [VERIFIED: AGENTS.md:85-92]
- Establish canonical DTOs, validation, statuses, money, and identifiers before connecting divergent fixtures to Prisma. [VERIFIED: AGENTS.md:85-92]
- Do not delete unknown local database state or commit `.env`/`data/`; use disposable PostgreSQL for destructive verification. [VERIFIED: AGENTS.md:85-92]
- Keep changes focused, preserve public routes, inspect shared consumers, and update API/schema/auth/test/architecture documentation with cross-cutting changes. [VERIFIED: AGENTS.md:94-102] [VERIFIED: AGENTS.md:117-119]
- Typecheck and build are available; lint has a known failing baseline and there is currently no test command. Record exact outcomes and never claim a check passed without running it. [VERIFIED: AGENTS.md:50-71]

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Next.js / React | `16.3.2` / `19.2.8` | App Router pages, proxy, and route handlers | Locked existing modular monolith. [VERIFIED: package.json:16-32] |
| Better Auth | `1.6.23` pinned | Credential creation/change and database-backed session lifecycle | Existing auth engine; its version-matched Admin plugin exposes create user, set password, and revoke-user-sessions operations. [VERIFIED: package.json:16-32] [CITED: https://raw.githubusercontent.com/better-auth/better-auth/v1.6.23/docs/content/docs/plugins/admin.mdx] |
| Prisma Client / Prisma | `6.12.0` pinned | PostgreSQL schema, additive migrations, seed, and transactions | Locked persistence layer; do not upgrade during this phase without a separate compatibility plan. [VERIFIED: package.json:16-44] |
| PostgreSQL | `17` local image | Canonical persistence and integration-test target | Existing Compose contract. [VERIFIED: docker-compose.yml:1-12] |
| Zod | `4.4.3` pinned | HTTP, command, seed-row, and environment validation | Existing canonical boundary validator. [VERIFIED: package.json:16-32] |
| SheetJS CE (`xlsx`) | `0.20.3` from the official SheetJS CDN | Offline, read-only workbook parsing | Official docs identify the CDN tarball as authoritative; the npm registry package is stale. [CITED: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | `4.1.11` | Unit, route/service, and database integration tests | Add in Wave 0; Node is the default environment and Node 20 is supported. [CITED: https://vitest.dev/guide/] |
| TanStack React Query | existing `^5.96.1` | User list queries and mutation invalidation | Use only in the focused client component; preserve complete keys and `placeholderData`. [VERIFIED: package.json:16-32] |
| Existing Base UI/Radix primitives | existing | Dialogs, forms, feedback, tables | Reuse instead of adding another component/form system in Phase 1. [VERIFIED: AGENTS.md:73-83] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SheetJS CE | Handwritten ZIP/XML parsing | The research profile proved XML parsing is possible, but productionizing format parsing would create needless edge-case ownership; use a maintained parser. [CITED: https://docs.sheetjs.com/docs/api/parse-options/] |
| Better Auth Admin plugin | Directly hash and write Account rows | The current seed demonstrates direct hashing, but application user management should not duplicate credential lifecycle logic. [VERIFIED: prisma/seed.mjs:41-87] |
| Vitest | Node’s built-in test runner | Vitest is already the accepted verification direction and provides project/environment configuration suitable for unit and integration separation. [VERIFIED: docs/adr/0007-backend-services-and-realtime-delivery.md:174-181] [CITED: https://vitest.dev/guide/projects] |
| Dedicated scoped reload command | `prisma migrate reset` | Migrate reset destroys all database state; a scoped command can preserve internal users/auth while replacing only developer/test catalog and balances. [ASSUMED] |

**Installation (after legitimacy checkpoint):**

```bash
npm install --save "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
npm install --save-dev vitest@4.1.11
```

Versions were checked on 2026-08-25. The Vitest registry reports `4.1.11`. [CITED: https://registry.npmjs.org/vitest] npm `xlsx` reports `0.18.5`, while the official SheetJS docs specify CDN `0.20.3`. [VERIFIED: npm registry] [CITED: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/] Retain the checked-in Better Auth and Prisma pins rather than mixing a dependency upgrade into this phase. [VERIFIED: package.json:18-21,42]

## Package Legitimacy Audit

| Package | Registry | Age / Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----------------|-------------|---------|-------------|
| `xlsx` / SheetJS CE | npm check + official SheetJS CDN install | latest npm release 2022; ~12.3M/week | `github.com/SheetJS/sheetjs` / official CDN | OK | Approved only as official CDN `0.20.3`; do not install npm `0.18.5`. [VERIFIED: npm registry] [CITED: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/] |
| `vitest` | npm | queried release published 2026-08-18; ~93.3M/week | `github.com/vitest-dev/vitest` | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify` before install. [CITED: https://vitest.dev/guide/] [VERIFIED: package-legitimacy seam 2026-08-25] |
| `better-auth` | npm | queried latest release published 2026-08-18; ~7.2M/week | `github.com/better-auth/better-auth` | SUS (`too-new`) | Existing pin is quoted verbatim as `"better-auth": "1.6.23"`; do not reinstall/upgrade except through `npm ci`. [VERIFIED: package.json:21] [VERIFIED: package-legitimacy seam 2026-08-25] |
| `zod` | npm | queried latest release published 2026-05-04; ~265.7M/week | `github.com/colinhacks/zod` | OK | Existing pin is quoted verbatim as `"zod": "4.4.3"`. [VERIFIED: package.json:32] [VERIFIED: package-legitimacy seam 2026-08-25] |
| `@prisma/client`, `prisma` | npm | queried latest releases published 2026-07-27; ~15.4M/~16.5M weekly | `github.com/prisma/prisma` | SUS (`too-new`) | Existing pins are quoted verbatim as `"@prisma/client": "6.12.0"` and `"prisma": "6.12.0"`; do not upgrade. [VERIFIED: package.json:18,42] [VERIFIED: package-legitimacy seam 2026-08-25] |

**Packages removed due to [SLOP] verdict:** none.  
**Packages flagged as suspicious [SUS]:** `vitest` installation requires a human checkpoint; Better Auth and Prisma findings apply only to their newly published registry releases, not a recommendation to alter the existing lockfile.

No inspected package exposed a registry `postinstall` script. [VERIFIED: package-legitimacy seam and npm registry query 2026-08-25]

## Architecture Patterns

### System Architecture Diagram

```text
Owner workbook (read-only; developer machine)
  -> offline profiler (selected sheets + formula/cached-value checks)
  -> row classifier + canonical Zod validation
  -> blocking review report
       -> unresolved duplicate/quantity/price/location issue -> STOP for owner decision
       -> all blocking issues resolved
  -> reviewed canonical seed fixture + source mapping/hash
  -> environment-gated scoped seed transaction
  -> PostgreSQL Location / Product / InventoryBalance
  -> authenticated route/service reads
  -> role/location-scoped pages and selectors

Browser request
  -> Next.js page proxy (session + coarse route policy)
       -> denied -> access-denied page (no protected data)
       -> allowed -> page/client island
  -> same-origin API
  -> persisted user reload + action policy + Zod input
  -> focused service
  -> Prisma/PostgreSQL
```

### Recommended Project Structure

Exact new paths are planner choices and therefore `[ASSUMED]`; preserve this dependency direction:

```text
lib/contracts/                 # browser-safe user/catalog DTOs and Zod schemas
lib/server/policy/             # role/resource/action/location policy
lib/server/services/           # user lifecycle and seed application services
scripts/data-onboarding/       # read-only workbook profiler and canonical generator
prisma/fixtures/               # reviewed deterministic canonical seed data
tests/helpers/                 # disposable DB, users, sessions, request factories
tests/integration/             # Prisma seed/auth/scope tests
```

### Pattern 1: Profile → Review → Generate → Load

**What:** Separate workbook interpretation from database mutation. The profiler produces a deterministic report; unresolved findings stop generation; only reviewed canonical data reaches the seed. [ASSUMED]

**When to use:** Always for this workbook. Never parse and “fix” rows inside `prisma/seed.mjs` during a write transaction. [ASSUMED]

**Key invariant:** the same workbook hash plus the same explicit resolution file generates byte-equivalent canonical output. [ASSUMED]

### Pattern 2: Central policy with independent enforcement

**What:** Define one role/resource/action policy consumed by page gating, menu filtering, and API/service checks, but keep API/service authorization mandatory. The policy context must come from persisted User data. [VERIFIED: lib/server/authorization.ts:24-56]

**When to use:** Every protected page, read, and mutation. `proxy.ts` does not match APIs, so page gating cannot protect HTTP handlers. [VERIFIED: proxy.ts:51-53]

### Pattern 3: Application-owned account lifecycle over Better Auth

**What:** Use the Better Auth Admin plugin for credential/session operations; wrap it in a Chezcar service that enforces the fixed roles, status, role-valid location, last-Admin protection, and session revocation rules. [CITED: https://raw.githubusercontent.com/better-auth/better-auth/v1.6.23/docs/content/docs/plugins/admin.mdx] [ASSUMED]

**Important:** the v1.6.23 Admin plugin adds optional `role`, `banned`, `banReason`, `banExpires`, and `impersonatedBy` fields. The application already has an enum role and separate `status`; plan an explicit compatibility migration/spike rather than blindly running generated auth migration output. [CITED: https://raw.githubusercontent.com/better-auth/better-auth/v1.6.23/docs/content/docs/plugins/admin.mdx] [VERIFIED: prisma/schema.prisma:81-131]

### Pattern 4: Scoped, environment-gated reset

**What:** Reload only catalog/opening-stock records in development/test, inside a transaction, after positive environment and database-target checks. Preserve users/auth and refuse production. [ASSUMED]

**When to use:** Developer refreshes and integration-test setup. Never point the command at the unknown bind-mounted database without explicit confirmation. [VERIFIED: docs/DATABASE.md:78-84]

### Anti-Patterns to Avoid

- **Workbook-shaped schema:** monthly sheets, daily transaction columns, formulas, duplicate BL columns, and category headings are source layout—not entities. [ASSUMED]
- **Seed directly from raw workbook:** it makes review resolutions implicit and makes reruns dependent on formula caches and parser behavior. [ASSUMED]
- **Global destructive reset:** it will eventually erase auth and transactional records along with seed data. [ASSUMED]
- **Client-only role/location validation:** request parameters and direct HTTP calls bypass it. [CITED: https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x17-V8-Authorization.md]
- **Custom editable roles:** fixed roles are locked; remove or disable `/users/roles` management rather than persisting prototype permissions. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:39-43]
- **Two authorities for account status:** do not let Better Auth `banned` and application `status` drift. Choose one application-facing lifecycle and document how plugin fields support it. [ASSUMED]

## Recommended Vertical Implementation Slices

1. **Wave 0 — deterministic verification:** add Vitest, Node unit configuration, disposable PostgreSQL helpers, and exact package scripts; prove the fresh migration and current authorization guard before changing behavior. [ASSUMED]
2. **Workbook evidence:** add a read-only profiler, source hash, row classifier, mapping contract, blocking review report, and fixtures for malformed workbook rows. This slice writes no database data. [ASSUMED]
3. **Canonical data and safe reload:** reconcile the workbook with Product/Location/InventoryBalance, add the migration and constraints, produce reviewed canonical fixtures, implement scoped environment-gated reload, and verify rerun equivalence. [ASSUMED]
4. **Policy closure:** centralize route/action/location policy; add the access-denied page; filter menu/actions; ensure Admin all/specific, Branch fixed assignment, and Stock default SR behavior; test direct requests. [ASSUMED]
5. **Admin user management:** replace mock data and custom-role controls with real list/create/update/activate/deactivate/reset operations; integrate credential prompt/skip; revoke sessions on deactivation and role/location change. [ASSUMED]
6. **Documentation and phase gate:** update API, database, testing, architecture, configuration, roadmap/requirements wording, and manually verify responsive/dark-mode/error/reload behavior. [VERIFIED: AGENTS.md:117-119]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XLSX container/formula parsing | ZIP/XML parser as production tooling | SheetJS CE selected-sheet parser | Formula cells, cached values, hidden sheets, ranges, date/number formats, and merged cells are format edge cases. [CITED: https://docs.sheetjs.com/docs/api/parse-options/] |
| Password hashing/account records | Custom crypto or direct Account writes in the user-management API | Better Auth Admin plugin | It already supports create user and set user password for the pinned version. [CITED: https://raw.githubusercontent.com/better-auth/better-auth/v1.6.23/docs/content/docs/plugins/admin.mdx] |
| Session revocation protocol | Cookie manipulation | Better Auth session APIs or an explicitly tested atomic database-session deletion inside the service | Revocation must invalidate backend session state. [CITED: https://www.better-auth.com/docs/concepts/session-management] |
| Authorization in menu components | Per-component role conditionals | Central server policy plus derived UI capabilities | UI is manipulable and cannot protect objects or fields. [CITED: https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x17-V8-Authorization.md] |
| Spreadsheet cleanup heuristics | Automatic fuzzy merge or “best” price | Blocking review report with explicit owner resolutions | D-06 and D-09 forbid automatic winners. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:27-31] |
| Database reset | Generic shell deletion or production-capable endpoint | Environment-gated server script and disposable test database | The project contains mutable developer state and future durable records. [VERIFIED: docs/DATABASE.md:78-84] |

**Key insight:** this phase is trustworthy only if ambiguity is surfaced before mutation and authorization is proven with hostile direct requests, not inferred from the rendered UI.

## Common Pitfalls

### Pitfall 1: Treating the current August rollup as self-explanatory
**What goes wrong:** `BL`/`BL BEFORE` can be mapped incorrectly and `SR` omitted. [ASSUMED]  
**How to avoid:** require an owner-approved source-column mapping before fixture generation.  
**Warning sign:** the six canonical locations cannot each be traced to one unambiguous source.

### Pitfall 2: Formula cache trust
**What goes wrong:** a library reads the last cached value even if a source formula/reference is stale. [CITED: https://docs.sheetjs.com/docs/api/parse-options/]  
**How to avoid:** capture both formula and cached value, validate source-sheet row identity, and flag mismatches.  
**Warning sign:** totals do not equal selected per-location quantities or references are offset by one row.

### Pitfall 3: Accidental category-row products
**What goes wrong:** blank-code section headings receive temporary codes and become products. [ASSUMED]  
**How to avoid:** classify row kinds explicitly before applying D-07; test headings, spacers, and partial rows.  
**Warning sign:** “ACCESSORIES” headings appear in Product output.

### Pitfall 4: Non-atomic role/location change and revocation
**What goes wrong:** the user update succeeds but session revocation fails, so D-17 is not met. [ASSUMED]  
**How to avoid:** use one application-service boundary, fail closed, and prove database/session postconditions in an integration test.  
**Warning sign:** an old cookie remains usable after a successful Admin response.

### Pitfall 5: Better Auth plugin schema collision
**What goes wrong:** generated Admin plugin schema overwrites or duplicates the current enum role/status semantics. [CITED: https://raw.githubusercontent.com/better-auth/better-auth/v1.6.23/docs/content/docs/plugins/admin.mdx]  
**How to avoid:** diff generated schema, customize fixed-role access control, and hand-review the additive Prisma migration.  
**Warning sign:** lowercase `admin`/`user` roles or both `banned` and `status` independently control access.

### Pitfall 6: “Immediate” revocation defeated by cookie caching
**What goes wrong:** Better Auth documents that cached session cookies can remain active until cache expiry. [CITED: https://www.better-auth.com/docs/concepts/session-management]  
**How to avoid:** keep cookie cache disabled for this phase or force database session validation.  
**Warning sign:** `session.cookieCache.enabled` appears without revocation-specific tests.

### Pitfall 7: Temporary password becomes permanent
**What goes wrong:** D-15 allows skipping the first-login change, which conflicts with ASVS 5.0 control 6.4.1’s recommendation that initial secrets expire or cease after first use. [CITED: https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x15-V6-Authentication.md]  
**How to avoid:** honor D-15 but document the accepted risk, require a strong Admin-entered password, show the prompt exactly once, and support immediate reset/revocation. [ASSUMED]  
**Warning sign:** no credential-state flag or test distinguishes a new/reset account.

### Pitfall 8: Reset targets the live developer bind mount
**What goes wrong:** useful unknown state is destroyed. [VERIFIED: docs/DATABASE.md:78-84]  
**How to avoid:** use a dedicated test URL/container and require positive target checks.  
**Warning sign:** a reset command accepts any `DATABASE_URL` or uses `prisma migrate reset` indiscriminately.

## Code Examples

Verified patterns from current source and official documentation follow. The quoted discrete role/status/location values are in **Existing Canonical Values and Constraints** above.

### Thin authenticated route

```typescript
// Source: app/api/inventory/route.ts:9-20
export async function GET(request: Request) {
  const user = await requireUser(request.headers, [
    "ADMIN",
    "STOCK_STAFF",
    "BRANCH_STAFF",
  ]);
  const query = inventoryListQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );

  return Response.json(await listInventory(query, user));
}
```

### Persisted branch scope overrides request scope

```typescript
// Source: lib/server/catalog.ts:141-153
const scopeLocationId =
  user.role === "BRANCH_STAFF" ? user.locationId ?? "__unassigned__" : null;

const balanceWhere = {
  locationId: scopeLocationId ?? undefined,
  location:
    scopeLocationId || query.location === "all"
      ? undefined
      : { name: query.location },
};
```

The sentinel `"__unassigned__"` and query value `"all"` are quoted verbatim from the current implementation. [VERIFIED: lib/server/catalog.ts:141-153]

### Better Auth user creation and revocation primitives

```typescript
// Source: Better Auth v1.6.23 Admin plugin official docs
const newUser = await auth.api.createUser({
  body: { email, password, name, role, data },
});

await auth.api.revokeUserSessions({
  body: { userId },
  headers,
});
```

[CITED: https://raw.githubusercontent.com/better-auth/better-auth/v1.6.23/docs/content/docs/plugins/admin.mdx]

### Short atomic database operation

```typescript
// Source: Prisma transaction documentation
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: userId }, data: userChanges });
  await tx.session.deleteMany({ where: { userId } });
});
```

The model/field spellings `User`, `Session`, `id`, and `userId` are quoted verbatim from the schema. [VERIFIED: prisma/schema.prisma:81-110] Prisma documents that interactive transactions commit as a unit and should be kept short. [CITED: https://www.prisma.io/docs/orm/prisma-client/queries/transactions]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser upload/import implied by roadmap | Offline developer profile/review/generate/seed | Locked by D-01 on 2026-08-25 | Remove upload UI/API work from every plan. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:20-25] |
| Prototype custom roles | Four fixed persisted roles | Implemented foundation / D-14 | Delete custom-role planning and use a fixed policy matrix. [VERIFIED: prisma/schema.prisma:15-20] |
| Static seed fixtures | Reviewed Excel-derived canonical fixtures | Phase 1 target | Existing mock locations/products/balances must be replaced deterministically. [VERIFIED: prisma/seed.mjs:6-39] |
| Page redirects to dashboard/inventory | Dedicated access-denied route without protected data | D-11 | Direct navigation gets explicit denial, while APIs retain 403 JSON. [VERIFIED: proxy.ts:29-46] |
| Manual-only verification | Vitest unit/route/PostgreSQL integration layers | Phase 1 Wave 0 | Build/typecheck stop being mistaken for behavioral coverage. [VERIFIED: docs/TESTING.md:4-17] |

**Deprecated/outdated:** Vitest’s old `workspace` terminology is deprecated in favor of `projects`. [CITED: https://vitest.dev/guide/projects] The npm `xlsx` release is stale; official SheetJS docs direct Node users to CDN `0.20.3`. [CITED: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Workbook sheet/count/size/cell statistics and anomalies from the read-only XML profile | Workbook Evidence | Wrong source mapping or incorrect review scope; re-run with the implemented profiler and owner. |
| A2 | A source-row-derived temporary-code format is appropriate | Workbook / Architecture | Codes may not match owner conventions; planner must make format explicit. |
| A3 | Reviewed canonical fixture and mapping artifact paths/format | Project Structure | Only task/file organization changes. |
| A4 | Scoped reset should preserve auth/users and replace only catalog/opening balances | Architecture | Test/development workflow may instead require a fully isolated whole-database reset. |
| A5 | Last-active-Admin protection is required | User Lifecycle | Without it, Admin can lock out all administration. |
| A6 | Skipping the first-login password prompt consumes the prompt permanently until the next Admin reset | Pitfalls | User may expect the prompt on every login. |
| A7 | Stock Staff can select locations beyond its default `SR` | Open Questions | Incorrect scope could overexpose branch data or prevent required oversight. |
| A8 | The mapping artifact should retain source coordinates, raw/normalized values, outcomes, resolutions, and deterministic hashes | Workbook / Architecture | A different traceability contract could change generator and review tasks. |
| A9 | Branch Staff assignment should be backed by an application rule plus a reviewed database check, with related-location type validated in application code | Canonical Constraints | An invalid enforcement design could reject valid users or permit invalid active accounts. |
| A10 | Better Auth Admin operations should sit behind an application-owned lifecycle service with one authoritative status model | Architecture | Plugin and application fields could drift or revocation could become non-atomic. |
| A11 | Proposed implementation waves, new paths, test filenames, scripts, and sampling commands are suitable | Slices / Validation | Planner may need to rename or regroup tasks after implementation seams are fixed. |
| A12 | Integration tests should be serial or worker-isolated and use a separately protected disposable database | Validation | Shared mutable state could make tests flaky or destructive. |
| A13 | The identified workbook/reset/account-lifecycle failure modes require the prescribed guards | Anti-Patterns / Pitfalls | Missing or excessive controls could cause incorrect seed data, account exposure, or unnecessary complexity. |
| A14 | A small synthetic XLSX fixture can represent parser edge cases while the owner workbook stays out of quick tests | Validation | Some workbook-specific behavior may only be reproducible against the owner file. |

## Open Questions

1. **Which workbook source is canonical for `SR`, and what is `BL BEFORE`?**
   - What we know: canonical values are fixed to `SR`, `QC`, `BL`, `LU`, `VC`, `SP`. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:20-25]
   - What's unclear: the latest rollup appears to have duplicate BL sources and no explicit SR source. [ASSUMED]
   - Recommendation: owner approval is a blocking checkpoint before canonical fixture generation.

2. **What is the exact product identity rule?**
   - What we know: the current database makes `itemCode` unique. [VERIFIED: prisma/schema.prisma:49-61]
   - What's unclear: workbook code `"40"` appears to identify two different rows and several descriptions appear under different codes. [ASSUMED]
   - Recommendation: owner resolves each collision; no automatic merge or renumbering.

3. **Which prices are required for Phase 1?**
   - What we know: Product currently requires one Decimal `price`. [VERIFIED: prisma/schema.prisma:49-61]
   - What's unclear: the workbook profile found many blank prices and one nonnumeric marker. [ASSUMED]
   - Recommendation: decide whether missing price blocks the product, creates an inactive product, or requires a separately confirmed price; do not invent zero.

4. **What does “skip” mean on first login?**
   - What we know: the prompt is required and change is optional. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:39-43]
   - What's unclear: whether skipping dismisses once, permanently, or until a later login.
   - Recommendation: use A6 only after user confirmation.

5. **What locations are valid for Stock Staff and Accounting Staff accounts?**
   - What we know: Branch Staff requires a branch; Stock Staff defaults to `SR`; Admin can use All or specific. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:33-37]
   - What's unclear: whether Stock Staff is assigned to SR but can inspect all, and whether Accounting is unassigned/global or location-scoped.
   - Recommendation: lock the account-assignment and resource-scope matrix before migration/API tasks.

6. **Does the owner accept the temporary-password security deviation?**
   - What we know: D-15 permits skipping change. [VERIFIED: .planning/phases/01-trusted-foundation-and-data-onboarding/01-CONTEXT.md:39-43]
   - What's unclear: whether security policy can require expiry or one-time use despite that UX.
   - Recommendation: document the accepted risk; do not silently contradict D-15.

## Environment Availability

| Dependency | Required By | Available | Version / State | Fallback |
|------------|-------------|-----------|-----------------|----------|
| Node.js | Build, profiler, tests | ✓ but wrong baseline | `24.19.0`; project clean baseline is `20.20.2` | Run verification in an isolated Node `20.20.2` environment. [VERIFIED: node --version 2026-08-25] [VERIFIED: AGENTS.md:8-16] |
| npm | Install/scripts | ✓ | `11.17.0` | Use checked-in lockfile with `npm ci`. [VERIFIED: npm --version 2026-08-25] |
| Docker | Disposable PostgreSQL | ✓ | client/server `29.7.2` | None needed. [VERIFIED: docker version 2026-08-25] |
| PostgreSQL container | Current local app | ✓ | `chezcar_postgres`, image `postgres:17`, port `5435` | Do not use for destructive tests; start a separately named disposable test instance. [VERIFIED: docker-compose.yml:1-12] |
| `psql` / `pg_isready` host tools | DB probes | ✗ | unavailable | Run probes inside a disposable PostgreSQL container. [VERIFIED: command availability probe 2026-08-25] |
| Python/openpyxl | Ad-hoc workbook inspection | Python ✓ / openpyxl ✗ | Python `3.12.3` | Use the planned Node SheetJS tool; do not add a second Python toolchain. [VERIFIED: Python import probe 2026-08-25] |
| Installed `node_modules` | Local verification | ✗ inconsistent | Prisma `6.19.2`, Zod `3.25.76`, Better Auth absent vs checked-in pins | Run `npm ci` in an isolated clean copy; do not trust current modules. The required pins are quoted verbatim as `"@prisma/client": "6.12.0"`, `"better-auth": "1.6.23"`, and `"zod": "4.4.3"`. [VERIFIED: npm ls 2026-08-25] [VERIFIED: package.json:18,21,32] |

**Missing dependencies with no fallback:** none after an isolated `npm ci` and approved Vitest/SheetJS installation.  
**Missing dependencies with fallback:** host PostgreSQL CLI tools; use container-local tools.

## Validation Architecture

Nyquist validation is enabled because `.planning/config.json` is absent; no explicit `workflow.nyquist_validation: false` setting exists. [VERIFIED: direct Read returned File not found and init.phase-op confirmed default configuration on 2026-08-25]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.11` [WARNING: package-legitimacy seam marked this release SUS/too-new; human verification required before install.] |
| Config file | none — create in Wave 0 [VERIFIED: docs/TESTING.md:4-17] |
| Quick run command | `npm run test -- --run <changed-test-file>` after Wave 0 [ASSUMED] |
| Full suite command | `npm run test && npm run test:integration && npm run typecheck` after Wave 0 [ASSUMED] |

Use Vitest’s Node environment for policy, mapping, route/service, and integration tests; no DOM library is required to prove server authorization. [CITED: https://vitest.dev/guide/environment] Keep database integration serial or isolated per worker so tests cannot share mutable rows. [ASSUMED]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-excel-import | Classifies source rows and preserves raw/source mapping | unit | `npm run test -- --run scripts/data-onboarding/workbook-profile.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-excel-import | Blocks duplicate code, negative/blank/nonnumeric quantity, and conflicting price | unit/table-driven | `npm run test -- --run scripts/data-onboarding/canonicalize.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-excel-import | Same approved input yields the same canonical fixture/report | unit/snapshot/hash | `npm run test -- --run scripts/data-onboarding/generate-seed.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-excel-import | Fresh migration + seed creates exact locations/products/balances; rerun is equivalent | PostgreSQL integration | `npm run test:integration -- --run tests/integration/seed.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-excel-import | Reload refuses production and unknown database targets | unit + integration | `npm run test -- --run lib/server/services/catalog-reset.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-role-authorization | Unauthenticated/inactive/wrong-role/missing-branch requests return correct denial | route/service | `npm run test -- --run lib/server/authorization.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-role-authorization | Branch query manipulation cannot escape persisted location | PostgreSQL integration | `npm run test:integration -- --run tests/integration/inventory-scope.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-role-authorization | Direct forbidden page shows access denied and direct API returns 403 | route/proxy integration | `npm run test -- --run proxy.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-role-authorization | Only Admin lists/creates/changes/deactivates/resets users | route + PostgreSQL integration | `npm run test:integration -- --run tests/integration/user-management.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-role-authorization | Branch Staff cannot activate without branch assignment | service + DB constraint | `npm run test:integration -- --run tests/integration/user-management.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-role-authorization | Deactivate/role/location change revokes all old sessions immediately | auth integration | `npm run test:integration -- --run tests/integration/session-revocation.test.ts` | ❌ Wave 0 [ASSUMED] |
| REQ-role-authorization | First login prompts for change, change works, skip works | integration + manual UI | `npm run test:integration -- --run tests/integration/credential-setup.test.ts` | ❌ Wave 0 [ASSUMED] |

### Sampling Rate

- **Per task commit:** changed Vitest file(s) plus `npm run typecheck`. [ASSUMED]
- **Per wave merge:** complete unit suite; integration suite for any schema/auth/service change. [ASSUMED]
- **Phase gate:** clean migration, seed twice, full unit/integration suite, typecheck, build, documented lint baseline, and manual role/UI matrix before `/gsd-verify-work`. [ASSUMED]

### Wave 0 Gaps

- [ ] Add approved `vitest` dependency and `vitest.config.ts`; add `test` and `test:integration` scripts. [ASSUMED]
- [ ] Add disposable PostgreSQL lifecycle helper that refuses the development bind mount. [ASSUMED]
- [ ] Add minimal role/session/location fixture factories; do not import mock UI users. [ASSUMED]
- [ ] Add a small synthetic XLSX fixture covering formulas, hidden sheets, category rows, duplicate codes, missing codes, invalid quantities, and conflicting prices; keep the 116 MB owner workbook out of every quick test. [ASSUMED]
- [ ] Add request/session helpers for direct route/service matrix tests. [ASSUMED]
- [ ] Keep E2E tooling deferred; manually walk `/users`, denial, navigation, first-login, responsive, and dark-mode states in this phase. [VERIFIED: AGENTS.md:69-71]

## Security Domain

Security enforcement is enabled because no config explicitly disables it. [VERIFIED: direct Read returned File not found and init.phase-op confirmed default configuration on 2026-08-25]

### Applicable ASVS 5.0 Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Validation and Business Logic | yes | Positive Zod validation at trusted services; related role/location fields validated together; seed transaction succeeds or rolls back. [CITED: https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md] |
| V6 Authentication | yes | Better Auth owns credentials; users can change password; initial-secret deviation from 6.4.1 is documented because D-15 allows skip. [CITED: https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x15-V6-Authentication.md] |
| V7 Session Management | yes | Backend session verification; terminate all sessions on account disable; Admin can revoke one user’s sessions. [CITED: https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x16-V7-Session-Management.md] |
| V8 Authorization | yes | Explicit function/data policy, trusted-service enforcement, persisted location scoping, immediate policy changes. [CITED: https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x17-V8-Authorization.md] |
| V11 Cryptography | indirect | Better Auth cryptography only; never implement password hashing or token generation in application code. [CITED: https://www.better-auth.com/docs/concepts/users-accounts] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-branch query/ID manipulation | Information Disclosure / Elevation | Ignore client scope for Branch Staff and filter by persisted `locationId`; matrix-test hostile parameters. |
| Direct Admin API call by non-Admin | Elevation | `requireUser` plus action policy in every handler/service; menu hiding is UX only. |
| Session retained after deactivation/scope change | Elevation | Atomic user/session update or verified Better Auth revocation; cookie cache disabled; old-cookie integration test. |
| Spreadsheet formula/reference poisoning or stale cache | Tampering | Offline-only selected-sheet parse; capture formula and cached value; no formula execution; reviewed canonical artifact. |
| Production reset invocation | Tampering / Denial of Service | No HTTP endpoint; positive environment/database allowlist; hard refusal; separate credentials. |
| Admin lockout or self-demotion | Denial of Service | Preserve at least one active Admin and test self-change paths. [ASSUMED] |
| Temporary password exposure | Spoofing | Mask inputs, offline handoff, no logs, Better Auth hashing, reset + session revocation, one-time prompt state. |

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma`, `prisma/seed.mjs`, migration SQL — implemented models, discrete values, seed, constraints.
- `lib/server/authorization.ts`, `lib/server/catalog.ts`, `proxy.ts`, route handlers — current authorization and scoping.
- `01-CONTEXT.md`, requirements, roadmap, AGENTS.md — locked scope and project constraints.
- Read-only ZIP/XML workbook profile — direct inspection, but discrete workbook claims remain `[ASSUMED]` because binary `Read` was unsupported.

### Secondary (MEDIUM confidence)
- [Better Auth v1.6.23 Admin plugin](https://raw.githubusercontent.com/better-auth/better-auth/v1.6.23/docs/content/docs/plugins/admin.mdx) — version-matched official API and schema.
- [Better Auth sessions](https://www.better-auth.com/docs/concepts/session-management) — revocation and cookie-cache caveat.
- [Prisma seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding) and [transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
- [SheetJS parsing](https://docs.sheetjs.com/docs/api/parse-options/) and [Node installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).
- [Vitest guide](https://vitest.dev/guide/), [projects](https://vitest.dev/guide/projects), and [environments](https://vitest.dev/guide/environment).
- OWASP ASVS 5.0 [V2](https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md), [V6](https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x15-V6-Authentication.md), [V7](https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x16-V7-Session-Management.md), [V8](https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/en/0x17-V8-Authorization.md).

### Tertiary (LOW confidence)
- None used as authority; all unresolved interpretations are recorded as `[ASSUMED]`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for checked-in pins; MEDIUM for new SheetJS/Vitest additions because install/runtime compatibility still needs execution.
- Architecture: HIGH for boundaries and locked decisions; MEDIUM for proposed file/slice organization.
- Workbook mapping: LOW until binary findings are reproduced by committed tooling and owner resolves location/code/price/quantity blockers.
- Pitfalls: HIGH for code-observed gaps; MEDIUM for lifecycle recommendations.

**Research date:** 2026-08-25  
**Valid until:** 2026-09-01 for fast-moving auth/test packages; codebase/workbook findings remain valid until either source changes.
