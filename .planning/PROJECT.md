# Chezcar Sales & Inventory

## What This Is

Chezcar Sales & Inventory is an internal, cloud-based sales and inventory system for the owner, branch staff, stock staff, and accounting staff. The existing Next.js application is a brownfield UI prototype with production-oriented authentication, fixed role/location authorization, and PostgreSQL-backed Product and primary Inventory reads; most screens and every business mutation are still mock-backed or page-local and are roadmap work rather than completed behavior.

## Core Value

Core production MVP workflows for sales, warehouse receiving, stock transfers, discrepancy resolution, and accounting reconciliation are durable, server-authorized, auditable, and tested.

## Requirements

### Validated

(None yet — the implemented foundation has technical evidence, but the production MVP has not shipped or been operationally validated.)

### Active

- [ ] Branch Staff can post one internal sale per handwritten receipt, with server-calculated totals, atomic stock deduction, immutable movements, and explicit correction paths.
- [ ] Admin or Stock Staff can receive warehouse stock and dispatch multi-item warehouse-to-branch transfers through durable inventory movements.
- [ ] Branch Staff can confirm matched transfer receipts or report complete physical discrepancies without directly editing stock.
- [ ] Stock Staff can investigate discrepancies and Admin can approve, return, reject, or otherwise resolve them through controlled, auditable actions.
- [ ] Accounting Staff can verify sales or report mismatches while Admin owns any resulting sale correction.
- [ ] Each role receives server-enforced, location-scoped access, operational views, and durable notifications.
- [ ] Branch users can install a limited offline PWA, queue sales and transfer receipt evidence, and synchronize with explicit idempotent outcomes and conflict handling.
- [ ] Existing spreadsheet data can be profiled and mapped into canonical product, price, location, and opening-stock records when supplied.
- [ ] The application can be operated on Coolify/Hetzner with HTTPS, managed secrets, migrations, health checks, logs, and restore-tested PostgreSQL backups.

### Out of Scope

- Customer-facing POS and official receipt/invoice printing — the system records internal sales; handwritten receipts remain authoritative for customers.
- Daily closing and cash/collection reconciliation — deferred until payment and closing requirements are confirmed.
- Offline administration, warehouse receiving/dispatch, final discrepancy resolution, direct stock adjustment, sale correction, and current cross-branch reporting — these remain online-only in the proposed limited offline design.
- Redis or a general-purpose job queue at the outset — the locked backend stack uses PostgreSQL durability and a dedicated `pg` listener for notification wake-ups.
- Public sign-up — internal users are provisioned under controlled account management; the current Better Auth configuration disables public registration.

## Context

- **Implemented foundation:** Next.js 16/React 19 modular monolith on Node.js 20; Better Auth email/password sessions; persisted active-user checks; fixed role/location authorization; Prisma/PostgreSQL Product and primary Inventory reads; one initial migration and environment-driven Admin seed.
- **Not yet implemented:** Transactional sales, receipts, transfers, inventory movements, discrepancies, reconciliation, notifications, offline synchronization, deployment operations, and all business mutations. Existing screens for these areas are prototypes and must not be treated as durable behavior.
- **Verification baseline:** A clean Node.js 20.20.2 run passed build and strict type-check on 2026-08-24. No automated test suite or CI exists. Lint is configured but currently fails with 104 errors and 41 warnings; build emits known Recharts zero-size prerender warnings.
- **Business framing:** This is a remote sales-monitoring and stock-accountability system. Branch Staff can compare system and physical stock but cannot directly alter balances; stock changes belong to authorized central workflows and immutable movements.
- **External dependency:** The stakeholder's inventory spreadsheet has not yet been supplied. Import mapping and final terminology cannot be completed until it is profiled.

## Constraints

- **Runtime:** Keep the application on Next.js 16 App Router, React 19, strict TypeScript, Node.js 20, and PostgreSQL.
- **Server boundary:** Keep Prisma server-only. Browser code calls typed same-origin APIs; route handlers authenticate, validate, delegate to focused application services, and serialize stable responses.
- **Authorization:** Every sensitive read and mutation independently enforces persisted role, active-account, and branch/location scope on the server. Navigation and hidden controls are usability only.
- **Transactions:** Multi-write stock workflows use PostgreSQL/Prisma transactions, immutable inventory movements, explicit reasons, actor/time attribution, idempotency, and version/concurrency checks.
- **Contracts:** Establish canonical DTOs, Zod schemas, statuses, identifiers, and a documented money representation before connecting divergent fixtures to persistence.
- **Data model status:** The detailed sales, movement, transfer, discrepancy, notification, price-version, and synchronization models in `docs/product/PROVISIONAL-DATA-MODEL.md` are **proposed/provisional**, not the implemented Prisma schema. Extend the committed foundation additively, one vertical workflow at a time.
- **Frontend:** Preserve the existing visual stack, `PageShell`, Tailwind semantic tokens, responsive behavior, dark mode, TanStack Query, and server-component-by-default direction.
- **Testing:** Add deterministic unit, route, and PostgreSQL integration coverage for authorization, invariants, rollback, idempotency, and concurrency as production workflows are introduced; add end-to-end and CI coverage once durable workflows are reliable.
- **Operations:** Production credentials remain outside source control. Deployment uses committed migrations and backed-up targets; local Compose credentials and data are development-only.

## Locked Decisions

### ADR 0005 — Next.js Route Handlers with Prisma and PostgreSQL

> **Status: LOCKED.** Keep one Next.js modular monolith. App Router route handlers are the HTTP backend; PostgreSQL is authoritative; Prisma is server-only; thin handlers call application services that own authorization and transaction boundaries. Canonical validation/DTO contracts cross the API boundary, and durable notification/outbox and sync records live in PostgreSQL.

### ADR 0007 — Backend Services and Realtime Delivery Stack

> **Status: LOCKED.** Use Node-runtime App Router handlers, strict TypeScript, Zod, Better Auth secure cookie sessions, Prisma migrations/transactions, and stable JSON contracts. Notification rows are authoritative; one dedicated `node-postgres` `LISTEN/NOTIFY` connection per Node application instance wakes authenticated SSE streams, with cursor catch-up and polling for correctness. Do not add Redis or a general job queue initially.

## Proposed Decisions

These decisions guide planning but remain explicitly proposed until accepted as ADRs.

| ADR | Proposed direction | Status |
|-----|--------------------|--------|
| 0001 | One internal sale represents one handwritten receipt; posting is atomic and corrections use explicit reversal/replacement rather than edits or deletion. | Proposed |
| 0002 | Preserve immutable dispatched transfers; matched receipt posts automatically, while discrepancies use investigation, immutable movement proposals, and Admin resolution. | Proposed |
| 0003 | Accounting verifies or reports individual sale mismatches; only Admin corrects sales, with linked audit history. | Proposed |
| 0004 | Provide a limited branch PWA with IndexedDB snapshots/queue, fresh-auth idempotent sync, durable notifications, SSE, and polling fallback. | Proposed |
| 0006 | Continue TanStack Query/native fetch/local React state/URL parameters; add form tooling for production forms and reserve IndexedDB for offline durability. | Proposed |

## Open Planning Decisions

- Confirm manual receipt uniqueness scope: branch, receipt series, or another rule.
- Confirm spreadsheet terminology (`SKU`, `Item Code`, or another business term) after profiling the supplied file.
- Confirm whether the warehouse is a `WAREHOUSE` location type or a special branch.
- Confirm whether `Delivered`, `Received`, and `Confirmed` are distinct operational states.
- Confirm whether accounting remains individual `Sale Verification` records for MVP; daily closing is currently deferred.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Preserve the brownfield prototype/foundation distinction | Local UI transitions must not be mistaken for persistence, authorization, validation, auditability, or production readiness. | — Pending |
| Deliver production behavior as vertical workflows | Canonical contracts, server policy, database changes, UI, and tests must establish one usable outcome together. | — Pending |
| Treat ADR 0005 and ADR 0007 as non-negotiable architecture constraints | Both source ADRs are locked and define the server, persistence, auth, and realtime boundaries. | — Locked |
| Keep ADRs 0001–0004 and 0006 provisional | Their workflow details are documented but not locked; implementation planning must surface unresolved business choices. | — Proposed |

---
*Last updated: 2026-08-25 after brownfield document ingest and codebase mapping*
