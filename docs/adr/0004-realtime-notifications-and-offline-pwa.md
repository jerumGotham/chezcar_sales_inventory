# ADR 0004: Durable Realtime Notifications and Limited Offline PWA

**Status:** Proposed for stakeholder confirmation
**Date:** 2026-08-24

## Context

The application will be hosted in the cloud through Coolify on Hetzner. Branch operations must continue during temporary internet or application outages, and users need timely transfer, discrepancy, and reconciliation notifications.

A cloud database cannot be reached while a branch is offline. Therefore, offline support requires a controlled local copy and a synchronization protocol; it cannot provide globally current stock or true realtime notifications without connectivity. Making every operation available offline would also create unacceptable conflicts for warehouse dispatch, master data, and final stock adjustments.

## Decision

### Offline PWA

1. Deliver the branch application as an installable PWA with a service worker.
2. Cache the versioned application shell and a branch-scoped, timestamped read snapshot.
3. Store minimum branch data and pending actions in IndexedDB. Do not cache passwords, reusable bearer tokens, Admin data, customer PII, or cross-branch data, and do not treat origin-accessible encryption as protection against XSS.
4. Every queued operation carries a client aggregate ID, UUID idempotency key, server-issued device activation epoch, operation/schema type, expected entity/price versions, local occurrence time, and typed payload. The server canonicalizes the validated payload and computes the authoritative request hash.
5. Allow offline intake of branch sales and transfer physical receipt reports. Intake is immutable evidence; it is not automatically a canonical transaction until server validation passes.
6. Keep administration, warehouse receiving/dispatch, final discrepancy resolution, corrections, and cross-branch reporting online-only.
7. Show explicit offline and per-operation sync states; a queued action is not globally complete.
8. Retry sync on reconnect, app open/focus, and Background Sync where supported.
9. Enforce one active logical offline-sales activation epoch per branch during synchronization and assign it operationally to one physical device. Without a non-exportable WebAuthn/device key, browser storage cannot prove physical-device uniqueness. A replacement normally requires the old queue to synchronize before retirement.
10. Apply a best-effort local offline window and an authoritative server acceptance window based on server last-sync/activation time. Submissions received outside that window remain immutable evidence in `NEEDS_REVIEW` rather than being automatically posted.

### Idempotent Sync

1. Require fresh online authentication before processing the queue.
2. Treat locally stored device, branch, and user values as untrusted assertions and recheck current authorization and activation epoch.
3. Enforce database uniqueness on `(deviceId, idempotencyKey)` and persist the server-computed canonical request hash, operation type, processing status, result, and resulting record IDs.
4. The same key/hash returns its stored result; the same key with a different hash is a hard conflict and never re-executes.
5. Commit SyncOperation intake/result and canonical business writes atomically in one transaction per operation while preserving order per client aggregate. Explicit aggregate IDs define dependencies so one invalid operation does not block unrelated work.
6. Return `ACCEPTED`, `ALREADY_ACCEPTED`, `RETRYABLE`, `REJECTED`, or `NEEDS_REVIEW` per operation.
7. Retain an accepted queue entry locally until its canonical response is durably recorded.

### Offline Sale Conflicts

An offline sale may represent goods already released with a handwritten receipt. The server must not silently reject or discard that physical event.

1. The device checks cached stock minus queued local sales and records IDs and amounts from immutable server-held price-version records downloaded in the snapshot. It calculates locally for display, but the server verifies those records and performs decimal/centavo arithmetic itself.
2. On sync, preserve every authenticated command as an immutable `OfflineSaleSubmission`.
3. Automatically create a canonical sale only when authorization, receipt uniqueness, payload, item/price version, and normal rules pass.
4. Duplicate receipts, invalid payloads, deactivated items, disallowed prices, or inactive device epochs remain `NEEDS_REVIEW` submissions and do not create duplicate/invalid sales.
5. If a genuine physical sale fails only because canonical stock is insufficient, post it once with `stockConflict=true`, allow the controlled negative book-balance exception, set available-to-sell to zero, and create a critical discrepancy.
6. Admin resolves the variance using a physical count or identified missing upstream movement; a generic adjustment must not merely hide the negative balance.

### Offline Transfer Reports

1. Offline mode records physical evidence only and does not transition the canonical transfer.
2. The report includes transfer and line versions plus an actual disposition for every dispatched line and any wrong/excess SKU lines.
3. On sync, automatically complete a matched receipt only when the transfer is still `IN_TRANSIT`, versions match, and no once-only receipt command was accepted.
4. If another report or state transition won first, preserve the later report and return `NEEDS_REVIEW`; never overwrite or discard it.
5. Final discrepancy resolution remains online-only and must clear the complete transit ledger.

### Realtime Notifications

1. Insert per-user notifications or a transactional outbox row that deterministically expands recipients at event time, in the same PostgreSQL transaction as the triggering business event; delivery begins only after commit.
2. Assign an immutable notification ID and database-generated monotonic sequence cursor. SSE sends cursor `id:` values, clients reconnect from their last cursor, and every listener catches up from the table before live fan-out.
3. Use authenticated same-origin SSE with secure cookies for live in-app delivery and periodic cursor-based polling as a correctness fallback. Delivery is at least once, so clients deduplicate by notification ID.
4. Track `createdAt`, user `readAt`, and channel delivery attempts separately; an SSE write does not prove the event was seen.
5. Browser push is optional best-effort prompting. Send minimal non-sensitive identifiers, fetch authorized details after activation, and never mark a notification read because a push provider accepted it.
6. Offline users receive no realtime stream but fetch all missed notifications after reconnecting.
7. Use PostgreSQL `LISTEN/NOTIFY` through one dedicated `node-postgres` listener connection per Node application instance as the live wake-up signal. Notification rows and cursor catch-up remain authoritative because `LISTEN/NOTIFY` alone is not durable.

## Why This Works with Cloud Hosting

The cloud database remains authoritative. Offline devices temporarily hold only branch-scoped snapshots and uncommitted commands. Synchronization turns those commands into server transactions when connectivity returns. Realtime channels accelerate delivery while connected, but durable database rows and polling guarantee that a disconnected or restarted client does not miss notifications.

## Consequences

### Positive

- Branches can continue recording physical sales during temporary outages.
- Manual receipt and sale records are not lost.
- Users receive live updates without refreshing while online.
- Durable notifications survive disconnects and server restarts.
- High-risk inventory actions remain centrally controlled.

### Negative

- Offline stock is a stale snapshot, not a global guarantee.
- The MVP permits one active logical offline-sales activation epoch per branch, operationally assigned to a primary device; emergency replacement and any future multi-device mode still require conflict handling.
- Service worker upgrades, queue migrations, device revocation, and conflict UX require dedicated testing.
- Browser storage can be cleared by the user or operating system, so manual receipts remain an important recovery source.
- Realtime SSE and service-worker behavior require proxy and browser compatibility testing.

## Rejected Alternatives

- **Require internet for every branch action:** does not satisfy outage continuity.
- **Make the whole application offline-first:** adds unnecessary conflict and security complexity for Admin and warehouse workflows.
- **Store pending actions only in React state/localStorage:** not durable or structured enough for transactional queues.
- **Use WebSocket events without a notification table:** events can be lost during disconnects and are not an auditable source of truth.
- **Reject conflicting offline sales:** hides a physical sale that already happened and breaks receipt/accounting reconciliation.

## Deferred Decisions

- Final offline authorization duration
- Whether multi-device offline support is worth its accepted overselling/reconciliation risk after the single-device pilot
- Browser push after the initial durable polling/SSE release
- Maximum queue age and manual recovery process
- Exact PWA/service-worker library after compatibility evaluation

## Implementation Reference

See [ADR 0007](0007-backend-services-and-realtime-delivery.md) for the accepted backend libraries, dedicated PostgreSQL listener, SSE endpoint behavior, and phased package additions.
