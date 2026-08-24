# Decisions

## ADR 0001: Internal Sales Entry with Manual Receipts
- source: docs/adr/0001-internal-sales-and-manual-receipts.md
- status: proposed
- decision: DATA_A71C4E29_START
  1. One internal system sale represents one handwritten receipt.
  2. Branch Staff records the manual receipt number and sale lines in the system.
  3. Posting the sale atomically creates the sale, deducts branch inventory, writes inventory movements, and records the actor/time.
  4. Today's Admin dashboard totals are calculated from posted sales.
  5. Accounting Staff may verify the sale or report a mismatch but cannot edit it.
  6. Posted sales are corrected through explicit void/reversal and replacement actions, never silent edits or hard deletion. Stock is restored automatically only for a cancellation before physical release or an encoding correction that establishes the correct physical quantity. Post-release returns require a separate inspected return movement.
  7. The MVP does not print or replace the handwritten official receipt.
  DATA_A71C4E29_END
- scope: internal sales entry, handwritten receipts, branch inventory, inventory movements, Admin dashboard, void/reversal

## ADR 0002: Preserve Transfers and Resolve Discrepancies Separately
- source: docs/adr/0002-transfer-discrepancy-resolution.md
- status: proposed
- decision: DATA_58B93DF1_START
  1. A dispatched transfer is an immutable record of what the warehouse says it sent.
  2. Dispatch deducts source stock and records an in-transit movement.
  3. Branch Staff can perform one of two controlled actions: confirm that every item and quantity matches; or submit the actual disposition of every dispatched line, plus any excess/wrong SKU lines and discrepancy reasons.
  4. A matched confirmation posts destination stock automatically and closes the transfer.
  5. A discrepancy creates a linked discrepancy report and notifies Admin and Stock Staff. It does not allow Branch Staff to set inventory directly.
  6. Stock Staff investigates and prepares a read-only movement proposal for every affected item; submitting its immutable version/hash sets `PENDING_ADMIN_APPROVAL`.
  7. Admin reviews original dispatch, branch count, evidence, findings, and the exact proposed ledger effects. Admin may approve the proposal, return it for recount, or resolve the report as a normal matched receipt.
  8. Destination stock for a discrepant transfer is posted only during Admin resolution. Approval supplies and transactionally revalidates the immutable proposal version/hash, transfer version, and ledger state before posting.
  9. Resolution clears the complete original in-transit quantity, receives confirmed actual quantities, and creates separate source restoration, variance, loss, return, damaged, or supplemental movements as needed. No unexplained transit balance may remain.
  DATA_58B93DF1_END
- scope: transfers, discrepancy reports, inventory movements, Admin approval

## ADR 0003: Accounting Reports Mismatches; Admin Corrects Sales
- source: docs/adr/0003-accounting-sales-reconciliation.md
- status: proposed
- decision: DATA_3F0A8C72_START
  1. Accounting Staff receives read access to sales and reconciliation information.
  2. In the MVP, Accounting compares each sale's manual receipt number and total with the corresponding handwritten receipt.
  3. Accounting may mark an individual sale as verified or create a reconciliation issue.
  4. A reconciliation issue records the mismatch type, expected value, actual value, notes, reporter, and time.
  5. Accounting cannot edit, delete, void, or replace a sale and cannot adjust inventory.
  6. Admin reviews the issue and resolves it by confirming the original, voiding/reversing and replacing the sale, or posting another explicit correction.
  7. The resolution links back to the issue and preserves all actors and timestamps.
  8. Daily closing and actual cash/collection reconciliation are deferred until payment and closing requirements are confirmed.
  DATA_3F0A8C72_END
- scope: Accounting Staff, sales reconciliation, reconciliation issues, Admin corrections, inventory, daily closing

## ADR 0004: Durable Realtime Notifications and Limited Offline PWA
- source: docs/adr/0004-realtime-notifications-and-offline-pwa.md
- status: proposed
- decision: DATA_C6241AB9_START
  Deliver the branch application as an installable PWA with a service worker. Cache the versioned application shell and a branch-scoped, timestamped read snapshot. Store minimum branch data and pending actions in IndexedDB. Allow offline intake of branch sales and transfer physical receipt reports. Keep administration, warehouse receiving/dispatch, final discrepancy resolution, corrections, and cross-branch reporting online-only. Show explicit offline and per-operation sync states; a queued action is not globally complete.

  Require fresh online authentication before processing the queue. Enforce database uniqueness on `(deviceId, idempotencyKey)` and persist the server-computed canonical request hash, operation type, processing status, result, and resulting record IDs. Commit SyncOperation intake/result and canonical business writes atomically in one transaction per operation.

  Insert per-user notifications or a transactional outbox row in the same PostgreSQL transaction as the triggering business event. Use authenticated same-origin SSE with secure cookies for live in-app delivery and periodic cursor-based polling as a correctness fallback. Use PostgreSQL `LISTEN/NOTIFY` through one dedicated `node-postgres` listener connection per Node application instance as the live wake-up signal; Notification rows and cursor catch-up remain authoritative.
  DATA_C6241AB9_END
- scope: offline PWA, IndexedDB, idempotent sync, offline sales, offline transfer reports, SSE notifications, PostgreSQL LISTEN/NOTIFY

## ADR 0005: Next.js Route Handlers with Prisma and PostgreSQL
- source: docs/adr/0005-nextjs-api-prisma-postgresql.md
- status: locked
- decision: DATA_9D42E71F_START
  Keep the application as a single Next.js modular monolith. Use App Router route handlers under `app/api/**/route.ts` as the HTTP backend. Use PostgreSQL as the authoritative production database. Use Prisma only in server code for database access and migrations. Add one server-only Prisma client module; never import Prisma into a client component. Keep route handlers thin: authenticate, parse/validate input, call an application service, and serialize a typed response/error. Put authorization and transaction boundaries in application services rather than page components or route handlers. Use Prisma transactions for multi-write inventory workflows. Use canonical validation/DTO contracts shared by API callers and server handlers. Persist notification/outbox and sync-operation records in PostgreSQL; SSE and polling are delivery mechanisms over the same durable data.
  DATA_9D42E71F_END
- scope: Next.js Route Handlers, Prisma, PostgreSQL, application services, API contracts, database transactions

## ADR 0006: Frontend State and Data Stack
- source: docs/adr/0006-frontend-state-and-data-stack.md
- status: proposed
- decision: DATA_E8063B4D_START
  Continue using TanStack Query for API-backed data. Use a small typed wrapper around native `fetch` rather than Axios by default. Use local React state by default for dialogs, tabs, expanded rows, and temporary UI choices. Use URL search parameters for shareable list state. Zustand is optional and should be introduced only for small cross-route, client-only state that does not belong to the server, URL, form, or IndexedDB. Add `zod`, `react-hook-form`, and `@hookform/resolvers` when the first production form is implemented. Use IndexedDB for durable branch-scoped snapshots, command queue entries, idempotency metadata, and sync results. Preserve the existing visual stack.
  DATA_E8063B4D_END
- scope: TanStack Query, native fetch, React state, URL search parameters, Zustand, React Hook Form, Zod, IndexedDB, frontend verification

## ADR 0007: Backend Services and Realtime Delivery Stack
- source: docs/adr/0007-backend-services-and-realtime-delivery.md
- status: locked
- decision: DATA_41F7AC95_START
  Use Next.js App Router route handlers on the Node runtime, TypeScript strict mode, Zod validation, thin route handlers calling focused application services, stable JSON response/error contracts, and same-origin secure cookie sessions. Use Better Auth with its Next.js integration, Prisma adapter, database-backed sessions, and email/password support unless a short implementation spike reveals a blocker. PostgreSQL is authoritative; Prisma Client handles normal queries and transactions; committed Prisma migrations define every environment. Use `pg` only for the dedicated PostgreSQL notification listener. Do not add Redis or a general job queue initially.

  The Notification table is authoritative. Notification creation happens in the same Prisma transaction as the business event. A dedicated `node-postgres` client holds `LISTEN chezcar_notifications` and forwards wake-ups to SSE connections in that Node process. `GET /api/notifications/stream` authenticates the secure cookie session, performs cursor catch-up, and emits SSE frames. Clients deduplicate by notification ID, persist the last processed cursor, reconnect with backoff/jitter, and use polling when SSE is unavailable.
  DATA_41F7AC95_END
- scope: backend services, realtime notifications, PostgreSQL, Prisma, Better Auth, SSE, LISTEN/NOTIFY
