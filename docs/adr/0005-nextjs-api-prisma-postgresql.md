# ADR 0005: Next.js Route Handlers with Prisma and PostgreSQL

**Status:** Accepted for implementation planning
**Date:** 2026-08-24

## Context

The current repository is a Next.js App Router UI prototype. It already contains four mock `GET` route handlers, Prisma dependencies, a starter Prisma schema, and a local PostgreSQL Compose service, but the UI does not call those APIs and no runtime code creates a Prisma client.

The MVP needs authenticated sales, inventory movements, stock transfers, discrepancy resolution, accounting reconciliation, durable notifications, realtime SSE delivery, and offline synchronization. These workflows require server-side authorization, validation, idempotency, and database transactions.

The current page-local fixtures and `prisma/schema.prisma` disagree on many fields. The stakeholder's Excel inventory will arrive later, so the initial model must support current MVP fields while remaining evolvable through migrations.

## Decision

1. Keep the application as a single Next.js modular monolith.
2. Use App Router route handlers under `app/api/**/route.ts` as the HTTP backend for browser mutations, React Query requests, offline sync, notification polling, and SSE.
3. Use PostgreSQL as the authoritative production database.
4. Use Prisma only in server code for database access and migrations.
5. Add one server-only Prisma client module; never import Prisma into a client component.
6. Keep route handlers thin: authenticate, parse/validate input, call an application service, and serialize a typed response/error.
7. Put authorization and transaction boundaries in application services rather than page components or route handlers.
8. Use repositories only where they clarify persistence operations; do not create a generic repository framework.
9. Use Prisma transactions for sale posting, transfer dispatch/receipt, discrepancy resolution, stock adjustment, and other multi-write inventory workflows.
10. Use canonical validation/DTO contracts shared by API callers and server handlers. Do not expose Prisma records directly as the public API contract.
11. Client pages may call `/api/**` through a typed client and TanStack Query. Server Components may call the same application services directly instead of making HTTP requests back into the same Next.js process.
12. Persist notification/outbox and sync-operation records in PostgreSQL. SSE and polling are delivery mechanisms over the same durable data.

Backend authentication, validation, and realtime delivery recommendations are detailed in [ADR 0007](0007-backend-services-and-realtime-delivery.md).

## Proposed Server Boundaries

Exact file names may be adjusted during planning, but dependencies should flow in this direction:

```text
app/api/**/route.ts
  -> server authentication and input validation
  -> application service
  -> focused repository/Prisma transaction
  -> PostgreSQL
```

Suggested areas:

```text
lib/contracts/              Canonical DTOs and validation schemas
lib/server/auth/            Session and authorization policies
lib/server/db/              Server-only Prisma client
lib/server/services/        Sales, inventory, transfer, reconciliation, sync
lib/server/repositories/    Focused persistence helpers where useful
lib/api-client/             Typed browser-side HTTP client
```

The exact structure is a planning decision. The required rule is that browser bundles cannot import `lib/server/**`.

## API Conventions

- JSON collection responses use `{ data, meta }` where pagination exists.
- JSON item responses use `{ data }`.
- Errors use a stable envelope with machine-readable code, human-readable message, and optional field details.
- Route parameters, query strings, and request bodies are validated at the server boundary.
- Money is represented using integer centavos or an agreed decimal string, never JavaScript floating-point values for persisted calculations.
- Dates/times use ISO 8601 at API boundaries and PostgreSQL timestamps in storage.
- Retried mutations use idempotency keys where duplicate execution is possible.
- Authorization checks include role and branch/location scope.
- Posted transaction records are corrected through explicit commands, not generic unrestricted `PATCH` operations.

## Initial API Areas

The implementation plan may split these further:

- `/api/auth/**`
- `/api/branches`
- `/api/users`
- `/api/products`
- `/api/inventory`
- `/api/inventory/movements`
- `/api/warehouse-receipts`
- `/api/stock-transfers`
- `/api/stock-transfers/[id]/dispatch`
- `/api/stock-transfers/[id]/receipt-report`
- `/api/stock-transfers/[id]/resolution-proposal`
- `/api/stock-transfers/[id]/resolve`
- `/api/stock-discrepancies`
- `/api/sales`
- `/api/sales/[id]/void`
- `/api/sales/[id]/verify`
- `/api/reconciliation-issues`
- `/api/notifications`
- `/api/notifications/stream`
- `/api/sync`

These are proposed route names, not implemented endpoints. Final contracts belong in the implementation plan and API documentation when built.

## Data Evolution Decision

- Use the current UI fields and confirmed MVP workflows to create a provisional canonical schema.
- Do not copy all page-local fixtures or the current starter Prisma models verbatim.
- Assign stable internal IDs and preserve business codes such as item code, branch code, transfer number, and receipt number separately.
- Use additive migrations when the Excel sheet introduces new metadata or classifications.
- Profile and clean the Excel before import; map it into canonical tables rather than making spreadsheet column names the database architecture.
- Before production data exists, reviewed renames and restructuring are inexpensive. After go-live, changes require migrations and backfills that preserve transaction history.
- Do not add generic JSON/EAV columns merely to avoid deciding core sales, stock, transfer, and audit relationships.

## Consequences

### Positive

- Reuses the existing Next.js deployment and team stack.
- Keeps authorization, API, UI, and database in one deployable application.
- Prisma transactions can enforce sales and inventory invariants.
- PostgreSQL supports durable records, constraints, audit history, notification cursors, and transactional outbox patterns.
- Current mock React Query pages can migrate incrementally to real APIs.
- The schema can evolve after Excel analysis through reproducible migrations.

### Negative

- Route handlers and server modules require strict import discipline to avoid leaking Prisma or secrets into browser bundles.
- Realtime SSE and long-lived connections need Node runtime and Coolify proxy testing.
- Offline sync substantially increases validation, idempotency, conflict, and test requirements.
- The starter Prisma schema requires redesign before it can represent the MVP.

## Rejected Alternatives

- **Separate API service immediately:** adds deployment and operational complexity without a current scaling or team-boundary need.
- **Use browser-side database access:** cannot safely protect credentials or enforce authorization and inventory transactions.
- **Keep Google Sheets/Excel as the runtime database:** does not provide reliable transactions, constraints, concurrency control, or auditability.
- **Copy the starter Prisma schema unchanged:** it lacks sale lines, transfer lines, movements, discrepancies, reconciliation, notifications, and sync records.
- **Wait for Excel before any modeling:** delays architecture unnecessarily; confirmed workflows already define the required transactional core.

## Revisit When

- Independent services need separate scaling or ownership.
- Long-running workloads justify a dedicated worker service.
- API consumers outside the Next.js application require formal versioning or separate deployment guarantees.
