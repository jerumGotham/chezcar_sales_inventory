# Requirements: Chezcar Sales & Inventory

**Defined:** 2026-08-25
**Core Value:** Core production MVP workflows for sales, warehouse receiving, stock transfers, discrepancy resolution, and accounting reconciliation are durable, server-authorized, auditable, and tested.

## v1 Requirements

These 20 requirements preserve the ingested product flows. A checked item means implemented and verified production behavior, not merely an existing prototype screen.

### Sales and Accounting

- [ ] **REQ-sales-posting**: Branch Staff can post one sale with branch, required manual receipt identity, items, quantities, prices, and monitoring payment data. The server enforces the confirmed receipt uniqueness scope, calculates totals, atomically persists sale/lines and stock movements, records actor/time, and permits correction only through an explicit reasoned void/replacement or correction flow.
- [ ] **REQ-sales-reconciliation**: Accounting Staff can compare each system sale with its handwritten receipt and either mark it `VERIFIED` or report a mismatch with reason, expected/actual values, and notes. Accounting cannot alter sales or stock; Admin resolution is explicit, linked, and preserves every actor and timestamp.

### Warehouse and Transfers

- [ ] **REQ-warehouse-receiving**: Admin or Stock Staff can post a warehouse receipt with source/reference and item quantities; it durably increases warehouse inventory through movement records and records receiver, poster, and timestamps.
- [ ] **REQ-transfer-dispatch**: Stock Staff can dispatch a multi-item warehouse-to-branch transfer. Dispatch preserves what was sent, deducts each quantity from source stock, adds the same quantity to in-transit inventory, and records the durable transfer lifecycle.
- [ ] **REQ-transfer-matched-receipt**: Branch Staff can compare every delivered transfer line and confirm a complete match. The server posts destination stock, clears in-transit quantities, marks the transfer `RECEIVED`, notifies Admin and Stock Staff, and prevents duplicate completion.
- [ ] **REQ-transfer-discrepancy**: Branch Staff can report actual disposition for every dispatched line, reasons for every mismatch, and additional wrong/excess SKU lines. The immutable dispatch remains unchanged; the report enters `DISCREPANCY_REPORTED`, notifies Admin/Stock Staff, and final resolution explicitly clears all original transit and allocates every difference.
- [ ] **REQ-admin-discrepancy-approval**: Admin can review original dispatch, branch evidence/count, findings, and an immutable movement proposal, then choose `Approve Resolution`, `Return for Recount`, or `Resolve as Matched`. Approval revalidates proposal hash/version, transfer version, and ledger state transactionally and records proposer, approver, notes, times, and movements.
- [ ] **REQ-general-stock-discrepancy**: Branch Staff can report a non-transfer discrepancy without changing inventory; Stock Staff can investigate and recommend; Admin can reject or post a reasoned, linked adjustment; and the reporting branch is notified of the result.
- [ ] **REQ-mvp-transfer-definition-of-done**: Transfer operations are not considered complete until warehouse receiving, multi-item dispatch, in-transit movements, branch notification, matched/discrepant receipt, Stock Staff investigation, Admin resolution, complete transit clearing, role-scoped history/status, persistence, authorization, audit history, and transaction tests all work together.

### Access, Audit, and Oversight

- [ ] **REQ-role-authorization**: Server policy prevents Branch Staff from direct stock changes, self-approval, and unauthorized branch access, and prevents Accounting Staff from changing sales or inventory. Every action independently enforces active user, fixed role, and persisted location scope; UI visibility and notifications never substitute for authorization.
- [ ] **REQ-audit-integrity**: Every stock change has an immutable inventory movement; posted sales and dispatched/completed transfers cannot be hard-deleted; corrections/reversals link to originals with reasons; transfer receipt and resolution are idempotent; and coupled source/destination changes commit atomically.
- [ ] **REQ-dashboard-views**: Admin can view canonical all-branch sales, transaction, stock, low-stock, transfer, discrepancy, and reconciliation information; Branch Staff can view assigned-branch stock, incoming transfers, notifications, today's sales, and discrepancy status; Accounting can view sales and reconciliation counts/totals by date and branch.
- [ ] **REQ-durable-notifications**: Business events create durable per-user notification/outbox records in the same PostgreSQL transaction, with immutable IDs and monotonic cursors. Authenticated clients receive live same-origin SSE updates and use cursor polling/reconnect catch-up so missed events remain recoverable.

### Offline Branch Continuity

- [ ] **REQ-offline-pwa**: Branch Staff can install the PWA, open a cached shell, view timestamped branch-scoped snapshots, queue a branch sale with a local stock effect, record transfer receipt evidence as `Pending Sync`, and inspect queued/conflicted actions. Administrative, warehouse, correction, final-resolution, adjustment, and cross-branch work stays online-only.
- [ ] **REQ-offline-storage**: IndexedDB stores only minimum branch product/price/stock snapshots and queued operations—never passwords, reusable bearer tokens, Admin/cross-branch data, or customer PII. Each operation carries aggregate/idempotency/device/branch/user/version/time metadata and always displays its sync state.
- [ ] **REQ-sync-protocol**: After fresh online authentication, a device can submit queued operations to an endpoint that validates authorization, scope, device epoch, operation/schema type, product/price/receipt versions, and payload. `(deviceId, idempotencyKey)` is unique; matching retries return the stored result, hash mismatches hard-conflict, and sync intake/result plus canonical writes commit atomically.
- [ ] **REQ-offline-sale-conflicts**: Every authenticated offline sale submission is retained immutably. Invalid/duplicate submissions enter `NEEDS_REVIEW`; a genuine physical sale blocked only by canonical stock can use the controlled exception, mark `stockConflict=true`, allow negative book on-hand only there, clamp available-to-sell to zero, and open a critical discrepancy.
- [ ] **REQ-offline-transfer-report**: Offline Branch Staff can record complete physical transfer evidence with transfer/line versions and occurrence time. A matched report auto-completes only an unchanged `IN_TRANSIT` transfer with no accepted report; a once-only receipt command prevents duplication, and later conflicts remain preserved as `NEEDS_REVIEW` evidence.

### Data Onboarding and Operations

- [ ] **REQ-excel-import**: When the stakeholder spreadsheet is supplied, Admin can profile codes/duplicates, names, categories, prices, units, locations, quantities, negatives, statuses, and missing IDs; review an explicit mapping into canonical tables rather than a copied spreadsheet schema; and establish opening stock preferably against a physical count.
- [ ] **REQ-deployment-operations**: Operators can deploy the application through Coolify to the owner's Hetzner infrastructure on a dedicated HTTPS domain, with managed secrets, committed migration deployment, health checks, application logs, automated PostgreSQL backups, and a successfully tested restore before go-live.

## v2 Requirements

No synthesized requirements are deferred: all 20 are committed to this roadmap. New scope requires an explicit requirements and roadmap update.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Customer-facing POS or official receipt/invoice printing | Handwritten receipts remain customer-facing; this system records internal sales. |
| Daily closing and cash/collection reconciliation | Deferred until payment and closing requirements are confirmed. |
| Offline central/administrative workflows | The proposed PWA deliberately limits offline writes to branch sales and transfer receipt evidence. |
| Redis or a general job queue initially | Locked architecture uses PostgreSQL durability and `LISTEN/NOTIFY` wake-ups. |
| Public registration | Internal account provisioning is required; current public sign-up is disabled. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-role-authorization | Phase 1 | Pending |
| REQ-excel-import | Phase 1 | Pending |
| REQ-sales-posting | Phase 2 | Pending |
| REQ-sales-reconciliation | Phase 2 | Pending |
| REQ-warehouse-receiving | Phase 3 | Pending |
| REQ-transfer-dispatch | Phase 3 | Pending |
| REQ-durable-notifications | Phase 4 | Pending |
| REQ-dashboard-views | Phase 4 | Pending |
| REQ-transfer-matched-receipt | Phase 5 | Pending |
| REQ-transfer-discrepancy | Phase 5 | Pending |
| REQ-admin-discrepancy-approval | Phase 5 | Pending |
| REQ-general-stock-discrepancy | Phase 5 | Pending |
| REQ-audit-integrity | Phase 5 | Pending |
| REQ-mvp-transfer-definition-of-done | Phase 5 | Pending |
| REQ-offline-pwa | Phase 6 | Pending |
| REQ-offline-storage | Phase 6 | Pending |
| REQ-sync-protocol | Phase 6 | Pending |
| REQ-offline-sale-conflicts | Phase 6 | Pending |
| REQ-offline-transfer-report | Phase 6 | Pending |
| REQ-deployment-operations | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓
- Duplicate mappings: 0 ✓

---
*Requirements defined: 2026-08-25*
*Last updated: 2026-08-25 after initial brownfield roadmap creation*
