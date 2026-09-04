# ADR 0008: Persistent Per-User Workflow Notifications

**Status:** Accepted
**Date:** 2026-08-26

## Context

The stock-transfer discrepancy flow is moving from prototype behavior toward production use. Users need an in-app notification inbox that survives refreshes, browser changes, and device changes. A computed browser-local inbox is not enough because read/unread state and notification accountability would be lost.

The transfer audit trail and inventory movements remain the authoritative business record. Notifications exist to alert responsible users and provide partial evidence that the system attempted to notify them.

## Decision

1. Persist notifications as one row per recipient user.
2. Resolve recipients from role and location at event time:
   - Admin users receive Admin action notifications.
   - Stock Staff assigned to Stock Room receive Stock Room action notifications.
   - Branch Staff assigned to the transfer destination receive branch receiving and resolved notifications.
3. Create a new notification for every real workflow event that requires action or communicates a final outcome. Do not collapse different events into one row.
4. Do not use notification rows as the primary audit source for stock or approval. Transfer timeline and inventory movements remain authoritative.
5. Treat notification creation as partial accountability evidence that the system attempted to notify the user. A populated read timestamp is evidence that the user opened the in-app notification.
6. Store related stock-transfer identifiers so the notification can link to the transfer context.
7. Users see only their own notifications. Admin sees only Admin's own notification inbox; cross-user notification audit is deferred.
8. Users can mark notifications read. Mark-unread is deferred.
9. Keep notifications indefinitely for now. Retention/archive policy is deferred.
10. Do not implement automatic time-based escalation yet.

## Initial Stock-Transfer Events

Persist notifications for:

1. Finalized transfer waiting for Stock Room dispatch.
2. Dispatched transfer waiting for destination branch receiving.
3. Exact receipt confirmed, notifying Stock Staff of the final outcome.
4. Discrepancy reported, notifying Stock Staff to investigate.
5. Investigation submitted, notifying Admin to approve final resolution.
6. Admin resolution posted, notifying Admin and destination Branch Staff of the final outcome.

Draft creation, including replacement drafts, is not a notification event. A draft remains private work-in-progress until it is finalized for dispatch.

## Consequences

### Positive

- Read/unread survives refreshes, devices, and browsers.
- Notifications are individually attributable to recipient users.
- Inboxes stay actionable instead of becoming full audit logs.
- Transfer audit remains cleanly separated from notification delivery.

### Negative

- More database rows are created because each recipient gets a row.
- Role/location membership changes after event time do not retroactively change old recipients.
- No automatic reminders exist until a scheduler/SLA decision is added.

## Rejected Alternatives

- **Browser-local read state:** not production-suitable because it disappears across devices and cannot support accountability.
- **One shared notification per role:** cannot support per-user read state.
- **Event table plus notification receipt table now:** more flexible, but unnecessarily complex for the first production implementation.
- **Notify every audit movement:** would turn the inbox into a noisy audit log; Admin transfer audit already covers movement detail.
