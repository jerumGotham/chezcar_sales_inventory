# Roadmap: Chezcar Sales & Inventory

## Overview

This roadmap converts the current hybrid UI prototype into an operational internal sales and inventory MVP through vertical, verifiable capabilities. It first establishes canonical onboarding and complete server policy, then makes sales, reconciliation, warehouse intake, dispatch, notifications, dashboards, transfer receipt/discrepancy resolution, limited offline branch work, and production operations durable. Existing screens are starting points only; no phase is complete until its stated behavior persists, survives reload/retry, enforces authorization at the server, and meets its observable criteria.

**Granularity:** Standard (default; no `.planning/config.json` was present). Seven phases are retained because offline continuity and production operations are distinct delivery boundaries rather than thin internal-quality phases.

## Phases

- [ ] **Phase 1: Trusted Foundation and Data Onboarding** - Users operate within server-enforced role/location boundaries and Admin can onboard reviewed canonical catalog/opening-stock data.
- [ ] **Phase 2: Durable Sales and Accounting Reconciliation** - Branch sales affect stock durably and Accounting/Admin can reconcile them without silent edits.
- [ ] **Phase 3: Warehouse Receiving and Transfer Dispatch** - Authorized central staff can receive stock and dispatch conserved warehouse-to-branch transfers.
- [ ] **Phase 4: Durable Notifications and Operational Views** - Each role sees canonical operational information and cannot miss durable event notifications.
- [ ] **Phase 5: Transfer Receipt and Discrepancy Resolution** - Branch, Stock Staff, and Admin can complete matched and discrepant stock workflows with full audit integrity.
- [ ] **Phase 6: Offline Branch Continuity** - Branch users can queue limited physical operations offline and reconcile them safely with the cloud record.
- [ ] **Phase 7: Production Deployment and Recovery** - Operators can deploy, observe, back up, and restore the production system before go-live.

## Phase Details

### Phase 1: Trusted Foundation and Data Onboarding
**Goal**: Users can rely on canonical product/opening-stock data and server-enforced role/location boundaries before transactional workflows are introduced.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-role-authorization, REQ-excel-import
**Success Criteria** (what must be TRUE):
  1. Each active role can directly request only the pages, reads, and actions allowed for that role, and Branch Staff sees only its persisted assigned location even when request parameters are manipulated.
  2. Branch Staff cannot directly change stock or approve its own discrepancy, and Accounting Staff cannot change sales or stock; denied direct HTTP requests return an authorization failure rather than relying on hidden controls.
  3. Admin can upload the supplied spreadsheet, review detected duplicates, missing identifiers, invalid/negative values, terminology, locations, and proposed mappings before any import is committed.
  4. Admin can import approved canonical products, prices, locations, and opening balances with a repeatable result and review what was accepted or rejected; raw spreadsheet structure does not become the database model.
**Plans**: TBD
**UI hint**: yes

### Phase 2: Durable Sales and Accounting Reconciliation
**Goal**: Branch sales and their handwritten-receipt reconciliation become durable, stock-affecting, controlled records.
**Depends on**: Phase 1
**Requirements**: REQ-sales-posting, REQ-sales-reconciliation
**Success Criteria** (what must be TRUE):
  1. Branch Staff can submit a sale form tied to one required handwritten receipt, and after reload the sale, server-calculated total, lines, actor/time, branch stock deduction, and linked movements remain present.
  2. A posted sale cannot be directly edited or deleted; an authorized correction produces an explicit linked reversal/replacement or correction with a reason and correct stock effect.
  3. Accounting Staff can view sales by receipt and mark one verified or report expected-versus-actual mismatch details, but direct attempts to modify the sale or inventory are denied.
  4. Admin can resolve a reconciliation issue by confirming the record or applying an explicit linked correction, and users can inspect reporter, resolver, notes, timestamps, and resulting records.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Warehouse Receiving and Transfer Dispatch
**Goal**: Central stock enters the ledger through receiving and leaves for branches through durable, conserved in-transit transfers.
**Depends on**: Phase 2
**Requirements**: REQ-warehouse-receiving, REQ-transfer-dispatch
**Success Criteria** (what must be TRUE):
  1. Admin or Stock Staff can post a warehouse receiving form and see warehouse balances increase by exactly the posted quantities with source/reference, immutable movements, actor, and timestamps after reload.
  2. Stock Staff can dispatch a multi-item warehouse-to-branch transfer and see each quantity move from warehouse stock to in-transit stock without changing total accountable quantity.
  3. Users can view the original dispatched lines, source, destination, status, actors, and history after reload; dispatched quantities cannot be silently rewritten or hard-deleted.
  4. Unauthorized roles and out-of-scope locations cannot receive or dispatch stock through either the interface or direct API requests.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Durable Notifications and Operational Views
**Goal**: Users can monitor canonical role-scoped operations and reliably receive the events that require their attention.
**Depends on**: Phase 3
**Requirements**: REQ-durable-notifications, REQ-dashboard-views
**Success Criteria** (what must be TRUE):
  1. Admin can view current all-branch sales, receipt references, transaction counts, stock/low-stock, transfer, open discrepancy, and reconciliation information derived from durable records rather than fixtures.
  2. Branch Staff can view only assigned-branch stock, incoming transfers, today's branch sales, notifications, and discrepancy status; Accounting can view sales and reconciliation totals by permitted date/branch scope.
  3. A committed business event creates a durable notification for each intended user, and connected users see it arrive through the authenticated live stream without a page refresh.
  4. After disconnecting or missing live delivery, a user can reconnect/poll from the last cursor and receive every missed notification once in sequence; notification delivery does not grant access to the linked resource.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Transfer Receipt and Discrepancy Resolution
**Goal**: Users can close matched transfers and resolve transfer or general stock discrepancies without losing stock accountability or audit evidence.
**Depends on**: Phase 4
**Requirements**: REQ-transfer-matched-receipt, REQ-transfer-discrepancy, REQ-admin-discrepancy-approval, REQ-general-stock-discrepancy, REQ-audit-integrity, REQ-mvp-transfer-definition-of-done
**Success Criteria** (what must be TRUE):
  1. Branch Staff can confirm every line of an unchanged in-transit transfer as matched exactly once; destination stock increases, the complete transit quantity clears, status becomes `RECEIVED`, and Admin/Stock Staff are notified.
  2. Branch Staff can instead report every line's actual disposition, required reasons, and wrong/excess items; the original dispatch stays unchanged, no direct stock edit occurs, and the case enters a visible investigation state.
  3. Stock Staff can record findings and submit a versioned movement proposal, while Admin can review exact ledger effects and approve, return for recount, or resolve as matched; stale proposal, transfer, or ledger versions cannot post.
  4. Users can report non-transfer physical discrepancies without changing stock, and only Admin can reject them or post a linked, reasoned adjustment after Stock Staff investigation.
  5. For matched, discrepant, correction, retry, and concurrent cases, users can inspect a role-scoped immutable history that accounts for every source, transit, destination, restoration, loss, return, damage, or supplemental quantity with no unexplained transit remainder.
**Plans**: TBD
**UI hint**: yes

### Phase 6: Offline Branch Continuity
**Goal**: Branch Staff can capture limited sales and transfer receipt evidence without connectivity and synchronize without disguising pending or conflicting work as complete.
**Depends on**: Phase 5
**Requirements**: REQ-offline-pwa, REQ-offline-storage, REQ-sync-protocol, REQ-offline-sale-conflicts, REQ-offline-transfer-report
**Success Criteria** (what must be TRUE):
  1. Branch Staff can install and reopen the PWA offline, see a timestamped assigned-branch snapshot, queue a sale with a local stock effect, and record complete transfer receipt evidence while every operation visibly remains `Pending Sync`.
  2. Inspection of offline storage shows only minimum branch product/price/stock snapshots and operation metadata—never passwords, reusable bearer tokens, customer PII, Admin data, or other branches' data.
  3. After fresh authentication returns, queued operations synchronize with stable per-operation results; identical retries do not duplicate work, while reused keys with changed payloads and stale device/schema/reference versions produce visible conflicts.
  4. A genuine already-fulfilled offline sale with insufficient canonical stock remains preserved and enters the controlled stock-conflict path; other invalid/duplicate submissions remain immutable `NEEDS_REVIEW` evidence rather than disappearing.
  5. A valid matched offline transfer report completes an unchanged in-transit transfer once, while stale, duplicate, or conflicting reports remain reviewable evidence and cannot double-post destination stock.
**Plans**: TBD
**UI hint**: yes

### Phase 7: Production Deployment and Recovery
**Goal**: Operators can run the verified MVP on the owner's infrastructure and recover its authoritative data before operational use begins.
**Depends on**: Phase 6
**Requirements**: REQ-deployment-operations
**Success Criteria** (what must be TRUE):
  1. An authorized user can reach the production application on its dedicated HTTPS domain and sign in against the deployed PostgreSQL-backed system.
  2. A deployment applies committed migrations using deployment-managed secrets and reports application/database health without exposing credential values.
  3. Operators can inspect useful application logs and health checks for a failed request or unhealthy dependency.
  4. Automated PostgreSQL backups run on schedule, and operators can restore a backup into a verified environment and demonstrate that durable business records and audit history are recoverable before go-live.
**Plans**: TBD

## Coverage

| Requirement | Phase |
|-------------|-------|
| REQ-role-authorization | Phase 1 |
| REQ-excel-import | Phase 1 |
| REQ-sales-posting | Phase 2 |
| REQ-sales-reconciliation | Phase 2 |
| REQ-warehouse-receiving | Phase 3 |
| REQ-transfer-dispatch | Phase 3 |
| REQ-durable-notifications | Phase 4 |
| REQ-dashboard-views | Phase 4 |
| REQ-transfer-matched-receipt | Phase 5 |
| REQ-transfer-discrepancy | Phase 5 |
| REQ-admin-discrepancy-approval | Phase 5 |
| REQ-general-stock-discrepancy | Phase 5 |
| REQ-audit-integrity | Phase 5 |
| REQ-mvp-transfer-definition-of-done | Phase 5 |
| REQ-offline-pwa | Phase 6 |
| REQ-offline-storage | Phase 6 |
| REQ-sync-protocol | Phase 6 |
| REQ-offline-sale-conflicts | Phase 6 |
| REQ-offline-transfer-report | Phase 6 |
| REQ-deployment-operations | Phase 7 |

**Coverage:** 20/20 v1 requirements mapped exactly once; no orphans or duplicate mappings.

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Trusted Foundation and Data Onboarding | 0/TBD | Not started | - |
| 2. Durable Sales and Accounting Reconciliation | 0/TBD | Not started | - |
| 3. Warehouse Receiving and Transfer Dispatch | 0/TBD | Not started | - |
| 4. Durable Notifications and Operational Views | 0/TBD | Not started | - |
| 5. Transfer Receipt and Discrepancy Resolution | 0/TBD | Not started | - |
| 6. Offline Branch Continuity | 0/TBD | Not started | - |
| 7. Production Deployment and Recovery | 0/TBD | Not started | - |
