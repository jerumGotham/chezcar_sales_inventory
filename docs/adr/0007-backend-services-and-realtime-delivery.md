# ADR 0007: Backend Services and Realtime Delivery Stack

**Status:** Accepted
**Date:** 2026-08-24

## Context

ADR 0005 selects a Next.js modular monolith, App Router route handlers, Prisma, and PostgreSQL. ADR 0004 requires durable per-user notifications, authenticated SSE, cursor replay, and polling fallback.

The implementation still needs a concrete backend library set and a wake-up mechanism for realtime delivery. Realtime events cannot exist only in memory because users disconnect, the application restarts, and branches operate offline.

## Recommended Backend Stack

### Application and API

- Next.js App Router route handlers on the Node runtime
- TypeScript strict mode
- Zod for request, response, environment, and command validation
- Thin route handlers calling focused application services
- Stable JSON response/error contracts
- Same-origin secure cookie sessions

### Authentication

Use Better Auth with its Next.js integration, Prisma adapter, database-backed sessions, and email/password support unless a short implementation spike reveals a blocker.

- Better Auth owns credential and session lifecycle.
- Application authorization policies own the Chezcar roles and branch/location scope.
- A valid session does not by itself authorize a sale, transfer, adjustment, or report.
- Do not trust client-supplied role, user, branch, or location IDs.
- Admin account creation and password recovery require controlled internal workflows.

This recommendation is based on the current official Better Auth support for Next.js route handlers, Prisma adapters, server-side session checks, email/password authentication, and custom roles. Exact package versions and generated auth tables must be reviewed during implementation.

### Database and Transactions

- PostgreSQL is authoritative.
- Prisma Client handles normal queries and transactions.
- Committed Prisma migrations define every environment.
- Database constraints enforce uniqueness and core invariants alongside application validation.
- Transactional services own multi-write workflows such as sale posting, warehouse receiving, transfer dispatch/receipt, discrepancy resolution, and reconciliation corrections.
- `pg` (`node-postgres`) is used only for the dedicated PostgreSQL notification listener; application repositories should not mix Prisma and raw `pg` access without a documented need.

### Background Work

Do not add Redis or a general job queue initially.

- Create per-user Notification rows directly in the triggering transaction because the expected internal audience is small.
- Add a transactional outbox worker only when recipient fan-out, browser push, email, or other asynchronous work requires it.
- If durable background jobs become necessary, evaluate a PostgreSQL-backed queue before adding another infrastructure service.

### Operational Support

- Structured server logs with request/correlation IDs
- Redaction of passwords, cookies, tokens, and sensitive request bodies
- Health/readiness endpoints that separately report application and database readiness
- Error monitoring after the first production vertical slice
- Reverse-proxy rate limits plus application-level protection for authentication and expensive endpoints

## Realtime Notification Design

### Durable Source of Truth

The Notification table is authoritative. Each row contains:

- immutable notification ID
- database-generated monotonic cursor
- recipient user ID and branch/location scope
- type and linked entity ID
- minimal non-sensitive payload
- `createdAt` and nullable `readAt`

Notification creation happens in the same Prisma transaction as the business event. For example, transfer dispatch and its recipient notifications either commit together or both roll back.

### PostgreSQL Wake-Up Signal

After inserting Notification rows, the same database transaction calls `pg_notify` with only the latest cursor or another minimal non-sensitive wake-up identifier.

PostgreSQL emits the notification only after commit. A dedicated `node-postgres` client holds `LISTEN chezcar_notifications` and forwards wake-ups to SSE connections in that Node process.

`LISTEN/NOTIFY` is not the source of truth:

- payloads do not contain authoritative business data;
- a dropped listener cannot lose durable Notification rows;
- listener reconnect always performs cursor catch-up;
- each horizontally scaled application instance keeps its own dedicated listener connection;
- normal database traffic continues through Prisma.

The listener requires reconnect/backoff logic and must not use a pooled query that releases the session, because PostgreSQL `LISTEN` is connection/session scoped.

### SSE Endpoint

`GET /api/notifications/stream`:

1. Authenticates the same-origin secure cookie session.
2. Reads the last cursor from `Last-Event-ID` or a validated query fallback.
3. Queries all authorized Notification rows after that cursor before joining live delivery.
4. Emits standard SSE frames with `id`, typed `event`, and minimal JSON `data`.
5. Sends heartbeat comments below the Coolify proxy idle timeout.
6. Rechecks session validity periodically and closes revoked/expired sessions.
7. Cleans up the subscriber when the request aborts.

SSE response requirements include:

- Node runtime, not Edge runtime
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- proxy buffering disabled and compression behavior tested
- bounded per-connection buffers and slow-client handling

### Client Behavior

- One authenticated EventSource connection per active browser session where practical.
- Deduplicate by notification ID because delivery is at least once.
- Persist the last processed cursor locally.
- On an event, update the notification list and invalidate the smallest relevant TanStack Query keys.
- Reconnect with backoff/jitter and replay from the cursor.
- Poll `GET /api/notifications?after=<cursor>` periodically when SSE is unavailable and immediately after reconnecting from offline mode.

### Marking Notifications Read

`POST /api/notifications/read` or a focused item endpoint updates `readAt` only after an explicit user/app action. Successful SSE delivery, polling, or browser push does not mean the user read the notification.

### Browser Push

Browser push is deferred until durable in-app notification, polling, and SSE behavior are proven.

- Push is a best-effort prompt for urgent events when the app is not open.
- It carries minimal non-sensitive identifiers.
- Opening the app fetches authorized details from PostgreSQL.
- Push-provider acceptance never marks Notification rows read.

## Typical Event Flow

```text
Admin/Staff command
  -> Next.js route handler
  -> authenticated and authorized service
  -> Prisma transaction
       -> business records/movements
       -> per-user Notification rows
       -> pg_notify(latest cursor)
  -> PostgreSQL commit
  -> dedicated node-postgres LISTEN client
  -> local SSE subscribers
  -> TanStack Query notification update/invalidation
```

If any live step fails, the client catches up from the durable cursor endpoint.

## Why SSE Instead of WebSockets

- Current realtime requirements are server-to-browser notifications and refresh signals.
- Browser commands already use authenticated HTTP APIs.
- SSE provides native reconnection semantics, event IDs, and simple reverse-proxy behavior.
- WebSockets would add bidirectional connection state without replacing durable storage or replay.

Reconsider WebSockets only if future requirements need low-latency bidirectional collaboration rather than ordinary API commands plus server events.

## Packages by Phase

### First Production Vertical Slice

- existing `next`, `react`, `@prisma/client`, and `prisma`, upgraded to secure compatible versions
- `zod`
- `better-auth`
- password/session dependencies required by the selected Better Auth release

### Realtime Notification Phase

- `pg`
- `@types/pg` if not bundled by the selected release

### Verification

- Vitest
- a dedicated PostgreSQL test database or isolated container
- MSW for frontend API simulations
- Playwright for authenticated role and realtime reconnect flows

Do not install these packages until their phase begins and exact compatible versions are selected.

## Rejected Alternatives

- **WebSockets first:** unnecessary bidirectional infrastructure for server-to-client notifications.
- **Redis Pub/Sub first:** another service to operate while PostgreSQL can supply the initial wake-up signal.
- **Prisma polling per connection only:** correct with cursor replay but wasteful as the primary realtime mechanism.
- **In-memory notifications only:** loses events during disconnects and restarts.
- **Push notifications as the record:** push is best effort and cannot provide audit or read state.
- **A separate backend service now:** duplicates deployment, authentication, contracts, and operational work without a demonstrated boundary.

## Revisit When

- Notification volume or recipient fan-out justifies a worker/outbox processor.
- Multiple channels such as email and browser push require durable retries.
- Horizontal application scaling exposes PostgreSQL listener or connection pressure.
- Bidirectional collaborative features require WebSockets.
- Authentication requirements exceed Better Auth's verified capabilities.
