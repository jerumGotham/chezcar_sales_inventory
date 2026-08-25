# Roadmap: Chezcar Sales and Inventory

## Overview

This roadmap implements the confirmed simple process in dependency order. Existing UI routes are prototypes and starting points only. A phase is complete only when its workflow persists, survives reload/retry, enforces role/location access on the server, preserves audit history, and passes its verification criteria.

## Phases

- [ ] **Phase 1: Trusted Foundation and Data Onboarding** - Canonical workbook-derived data, four fixed roles, and Admin User Management establish trustworthy access and inventory foundations.
- [ ] **Phase 2: Receipt Sales and Accounting Verification** - Branch Staff encodes handwritten-receipt sales with immediate stock deduction, and Accounting verifies each receipt-linked sale.
- [ ] **Phase 3: Durable Realtime Notifications** - Actionable users receive durable live, push, low-stock, and exception notifications before transfer workflows depend on them.
- [ ] **Phase 4: Stock Room Receiving and Transfer Dispatch** - Stock Staff receives into `SR` and dispatches auditable `SR`-to-branch transfers.
- [ ] **Phase 5: Branch Receipt, Discrepancy Resolution, and Monitoring** - Branch Staff confirms matched stock or sends a discrepancy form; Stock Staff investigates, Admin resolves, and the complete operational dashboard becomes available.
- [ ] **Phase 6: Offline Branch Continuity** - Enabled branches can queue sales and transfer receipt/discrepancy evidence during temporary outages and synchronize safely.
- [ ] **Phase 7: Production Deployment and Recovery** - Operators deploy, observe, back up, and restore the verified MVP.

## Phase Details

### Phase 1: Trusted Foundation and Data Onboarding

**Goal**: Users can rely on canonical catalog/opening inventory, individual accounts, and server-enforced role/location access before business mutations begin.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-data-onboarding, REQ-role-authorization, REQ-user-management
**Success Criteria**:

  1. The workbook is profiled with source traceability, blocking identity/location/quantity/price ambiguities are reported, and an owner-reviewed canonical seed dataset can reset/reload development or test without exposing a production reset path.
  2. `SR`, `QC`, `BL`, `LU`, `VC`, and `SP` exist with the confirmed Stock Room/branch meaning and canonical seeded products, prices, and opening balances.
  3. Every fixed role can request only its permitted pages/data/actions, and manipulated branch parameters cannot escape persisted scope.
  4. The single owner Admin can create, update, deactivate, and reset credentials for non-Admin users; another Admin cannot be created; Stock Staff is fixed to `SR`, Branch Staff requires one branch, Accounting has no location assignment, and access changes revoke sessions.

**Plans**: 11/17 plans executed
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Verify the Vitest package before installation

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Prove read-only workbook profiling and test infrastructure

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Produce the complete owner-review evidence package
- [x] 01-13-PLAN.md — Establish disposable database and direct-request test helpers

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — Resolve every blocking workbook decision with the owner

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05-PLAN.md — Generate deterministic reviewed canonical fixtures

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-06-PLAN.md — Apply the additive schema and safe transactional reload

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-07-PLAN.md — Close persisted role and location authorization

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-08-PLAN.md — Deliver the server-derived global shell scope contract
- [x] 01-14-PLAN.md — Close hostile Inventory API and persisted data scope
- [x] 01-15-PLAN.md — Add safe page denial routing and presentation
- [ ] 01-17-PLAN.md — Prove the unmounted Better Auth credential mechanism

**Wave 9** *(blocked on Wave 8 completion)*

- [ ] 01-09-PLAN.md — Deliver owner-Admin user lifecycle APIs
- [ ] 01-16-PLAN.md — Add capability-gated Inventory scope controls

**Wave 10** *(blocked on Wave 9 completion)*

- [ ] 01-10-PLAN.md — Complete the temporary-credential prompt flow

**Wave 11** *(blocked on Wave 10 completion)*

- [ ] 01-11-PLAN.md — Replace the mock User Management UI

**Wave 12** *(blocked on Wave 11 completion)*

- [ ] 01-12-PLAN.md — Synchronize docs and run the phase evidence gate

**UI hint**: yes - improve the current Chezcar style

### Phase 2: Receipt Sales and Accounting Verification

**Goal**: Released handwritten-receipt sales become durable stock deductions and Accounting can verify them without editing sales or stock.
**Depends on**: Phase 1
**Requirements**: REQ-sales-posting, REQ-sales-reconciliation
**Success Criteria**:

  1. Assigned Branch Staff can post one sale per unique branch/series/number receipt, and the sale, lines, actor/time, stock deduction, and movements survive reload.
  2. Posting never drives stock negative; duplicate/reused receipt identity and insufficient stock are blocked.
  3. Accounting can compare full receipt details and mark Verified or submit a structured mismatch.
  4. Admin can resolve a mismatch through a linked auditable correction; posted sales are not silently edited or hard-deleted.
  5. Admin sales totals, branch stock, low-stock state, and Accounting's queue reflect the committed sale without an end-of-day batch.

**Plans**: TBD
**UI hint**: yes - improve the current Chezcar style

### Phase 3: Durable Realtime Notifications

**Goal**: Actionable users receive durable low-stock and workflow notifications through live, reconnect, polling, and browser-push delivery before transfer workflows depend on them.
**Depends on**: Phase 2
**Requirements**: REQ-durable-notifications
**Success Criteria**:

  1. A committed business event creates durable notifications for only actionable users and connected clients receive them without refresh.
  2. Reconnect and polling return missed notifications in order without duplicate user-visible events.
  3. Every notification attempts browser push when permission and delivery are available without making push the source of truth.
  4. Notification history and linked records independently enforce user role/location authorization.

**Plans**: TBD
**UI hint**: yes - improve the current Chezcar style

### Phase 4: Stock Room Receiving and Transfer Dispatch

**Goal**: Stock Staff can receive into `SR` and dispatch conserved, auditable stock to a destination branch.
**Depends on**: Phase 3
**Requirements**: REQ-stockroom-receiving, REQ-transfer-dispatch
**Success Criteria**:

  1. Stock Staff can post an `SR` receipt and see exact immutable stock movements after reload.
  2. Stock Staff can finalize and physically dispatch a multi-item `SR`-to-branch transfer.
  3. Dispatch deducts `SR`, adds equal in-transit quantities, marks `IN_TRANSIT`, records history, and notifies the destination branch.
  4. Unauthorized roles cannot receive or dispatch stock through UI or direct requests.

**Plans**: TBD
**UI hint**: yes - improve the current Chezcar style

### Phase 5: Branch Receipt, Discrepancy Resolution, and Monitoring

**Goal**: Branch Staff can complete a matched transfer or send a simple discrepancy form without directly adjusting stock, and Admin can monitor the complete durable MVP workflow.
**Depends on**: Phase 4
**Requirements**: REQ-transfer-receipt, REQ-transfer-discrepancy, REQ-discrepancy-resolution, REQ-dashboard-monitoring
**Success Criteria**:

  1. Assigned Branch Staff can confirm every line matches exactly once; transit clears, branch stock increases, and status becomes `RECEIVED`.
  2. Any mismatch produces a form with complete actual quantities, reason, notes, and required evidence; disputed stock remains unavailable.
  3. Stock Staff can investigate and record findings, while Admin alone posts the final linked correction.
  4. Original dispatch, report, findings, resolution, notifications, and all movements remain auditable with no unexplained transit remainder.
  5. Admin dashboard shows current sales, stock by location, low-stock items, transfers, discrepancies, and reconciliation status; Branch Staff and Accounting see only their authorized operational views.

**Plans**: TBD
**UI hint**: yes - improve the current Chezcar style

### Phase 6: Offline Branch Continuity

**Goal**: Branch Staff can continue the same simple sales and transfer-receipt work during temporary outages without hiding pending or conflicting operations.
**Depends on**: Phase 5
**Requirements**: REQ-offline-continuity
**Success Criteria**:

  1. An Admin-enabled primary branch device can reopen a cached shell and timestamped assigned-branch snapshot offline.
  2. Branch Staff can queue a non-negative-stock sale and transfer confirmation/discrepancy as visibly `Pending Sync`.
  3. Reconnect processing is authenticated, branch-scoped, idempotent, and posts each accepted action once.
  4. Aged, stale, conflicting, or insufficient-stock operations remain visible as `Needs Review`; none are discarded, forced through, or allowed to create negative stock.

**Plans**: TBD
**UI hint**: yes - improve the current Chezcar style

### Phase 7: Production Deployment and Recovery

**Goal**: Operators can run and recover the verified MVP on the owner's infrastructure.
**Depends on**: Phase 6
**Requirements**: REQ-deployment-operations
**Success Criteria**:

  1. Authorized users can reach the HTTPS production domain and sign in against deployed PostgreSQL.
  2. Deployment applies committed migrations with managed secrets and useful health checks/logs.
  3. Automated PostgreSQL backups run on schedule.
  4. Operators restore a backup into a verified environment and demonstrate recoverable business/audit records before go-live.

**Plans**: TBD

## Progress

**Execution Order:** Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Trusted Foundation and Data Onboarding | 11/17 | In Progress|  |
| 2. Receipt Sales and Accounting Verification | 0/TBD | Not started | - |
| 3. Durable Realtime Notifications | 0/TBD | Not started | - |
| 4. Stock Room Receiving and Transfer Dispatch | 0/TBD | Not started | - |
| 5. Branch Receipt, Discrepancy Resolution, and Monitoring | 0/TBD | Not started | - |
| 6. Offline Branch Continuity | 0/TBD | Not started | - |
| 7. Production Deployment and Recovery | 0/TBD | Not started | - |
