# Phase 1: Trusted Foundation and Data Onboarding - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish trustworthy initial catalog/location/inventory data from the owner's real Excel workbook, complete server-enforced role/location access, and provide the minimal Admin-only user management needed to create valid internal accounts. This phase does not build an in-app spreadsheet import feature or transactional sales, receiving, transfer, or discrepancy workflows.

The planner must reconcile two scope corrections before producing executable plans:
- `REQ-excel-import` currently describes an Admin upload/review feature. The owner clarified that the workbook is a one-time developer input for database design and initial seeding.
- Minimal Admin-only User Management is required in Phase 1 so fixed roles and mandatory branch assignments can be configured safely.

</domain>

<decisions>
## Implementation Decisions

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

### Agent Discretion
- Temporary item-code format and collision handling.
- Exact seed report/output format and source-column mapping artifact.
- Access-denied page presentation within the existing design system.
- User-list filtering, pagination, and form layout consistent with existing page patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Owner data source
- `excel/REALTIME INVENTORY- NEW 3.xlsx` - Real inventory workbook that must be profiled for columns, identifiers, prices, location quantities, duplicates, and missing/invalid values.
- `docs/product/PROVISIONAL-DATA-MODEL.md` - Proposed model vocabulary and spreadsheet-refinement strategy; remains provisional until reconciled with the workbook.
- `docs/product/PRODUCT-REQUIREMENTS.md` - Owner workflows, role boundaries, and MVP direction.
- `docs/product/GLOSSARY.md` - Current role and inventory terminology plus unresolved business terms.

### Planning contracts
- `.planning/PROJECT.md` - Locked architecture, scope constraints, and prototype-versus-production distinction.
- `.planning/REQUIREMENTS.md` - Phase requirements and traceability; `REQ-excel-import` needs correction to match D-01.
- `.planning/ROADMAP.md` - Phase boundary and success criteria; Phase 1 needs the User Management clarification from D-14.

### Architecture and persistence
- `docs/adr/0005-nextjs-api-prisma-postgresql.md` - Locked modular-monolith, server-only Prisma, PostgreSQL, and service-boundary decision.
- `docs/DATABASE.md` - Implemented schema/migration/seed foundation and persistence cautions.
- `docs/API.md` - Current authenticated HTTP surface and error behavior.
- `.planning/codebase/ARCHITECTURE.md` - Existing auth/catalog flow, integration points, and server boundaries.
- `.planning/codebase/CONCERNS.md` - Authorization gaps, fixture drift, user-management gap, and migration risks.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/server/authorization.ts`: persisted active-user, fixed-role, and location-scope guard pattern.
- `lib/server/auth.ts` and `lib/auth-client.ts`: Better Auth server/browser foundations.
- `lib/server/prisma.ts`: server-only Prisma singleton for seed-backed and application data access.
- `lib/catalog.ts` and `lib/server/catalog.ts`: browser-safe DTO plus explicit Prisma mapping pattern.
- `components/page-shell.tsx` and `components/ui/`: established page frame, forms, dialogs, tables, and feedback primitives.
- `app/users/page.tsx`: existing User Management prototype that can inform presentation but must not be copied as durable authorization behavior.

### Established Patterns
- Client pages call same-origin route handlers; handlers authenticate, validate, and delegate to server-only modules.
- Fixed role/location policy comes from persisted user state, not menu visibility or client constants.
- Prisma models and additive migrations are authoritative only for implemented foundation data.
- Existing business pages are client-heavy prototypes; new durable routes should use focused server/application boundaries.

### Integration Points
- Extend `prisma/schema.prisma`, migration, and `prisma/seed.mjs` only after profiling the workbook and defining canonical mappings.
- Extend `lib/server/authorization.ts`, `proxy.ts`, and route handlers together for complete role/location policy.
- Update `lib/menu.ts` for role-aware presentation, while keeping it explicitly non-authoritative.
- Replace the prototype behavior in `app/users/page.tsx` with validated Admin-only HTTP/service operations.

</code_context>

<specifics>
## Specific Ideas

- The owner will provide and use the real Excel workbook as the concrete basis for schema and seeder decisions.
- `SR` must be represented as Stock Room rather than treated as another branch.
- Branch codes `QC`, `BL`, `LU`, `VC`, and `SP` must be preserved during initial mapping.
- Developer reset-and-reload is intentionally convenient for development/test, with a structural production safeguard.

</specifics>

<deferred>
## Deferred Ideas

- Custom permissions beyond the fixed roles are not part of Phase 1.
- Recurring in-app spreadsheet upload/import is not requested.
- Physical discrepancy resolution belongs to the later discrepancy workflow phase.

</deferred>

---

*Phase: 1-Trusted Foundation and Data Onboarding*
*Context gathered: 2026-08-25*
