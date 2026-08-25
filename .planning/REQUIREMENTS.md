# Requirements: Chezcar Sales and Inventory

**Defined:** 2026-08-25
**Updated:** 2026-08-25 after owner process confirmation
**Core Value:** Admin can monitor current sales and inventory while Branch Staff, Stock Staff, and Accounting Staff complete simple, role-controlled workflows that remain auditable and usable during temporary outages.

## v1 Requirements

A checked item means durable, authorized, verified production behavior, not an existing prototype screen.

### Foundation and Access

- [ ] **REQ-data-onboarding**: The developer can profile `excel/REALTIME INVENTORY- NEW 3.xlsx`, preserve source traceability, resolve blocking workbook ambiguities, generate canonical products/prices/locations/opening balances, and reset/reload that dataset in development/test while production reset is blocked.
- [x] **REQ-role-authorization**: The server enforces four fixed roles (`ADMIN`, `STOCK_STAFF`, `BRANCH_STAFF`, `ACCOUNTING_STAFF`), active-account status, and persisted location scope on every sensitive page, read, and mutation. Stock Staff is fixed to `SR`, Branch Staff to exactly one branch, and Admin/Accounting are business-wide with no location assignment. Hidden navigation never substitutes for authorization.
- [x] **REQ-user-management**: The single owner Admin can create, view, update, deactivate, and initiate credential setup/reset for Stock Staff, Branch Staff, and Accounting Staff accounts. User Management cannot create another Admin. Stock Staff receives the fixed `SR` assignment, Branch Staff requires one assigned branch, and Accounting has no location assignment; delete means deactivate; deactivation or role/location change revokes sessions immediately.

### Sales and Accounting

- [ ] **REQ-sales-posting**: After issuing the handwritten receipt and releasing goods, assigned Branch Staff can encode one sale using branch + receipt series/booklet + number, items, quantities, prices, optional customer, optional discount, and payment. Successful posting atomically records the sale, deducts branch stock without going negative, creates movements, and updates monitoring immediately.
- [ ] **REQ-sales-reconciliation**: Accounting Staff can compare every sale's receipt identity, items, quantities, prices, discounts, payment, and total with the handwritten receipt, then mark it `VERIFIED` or submit a structured mismatch. Accounting cannot edit sales or stock; Admin resolves linked issues auditably.
- [ ] **REQ-dashboard-monitoring**: Admin can monitor current sales, stock by location, low-stock items, transfers, discrepancies, and reconciliation status; Branch Staff and Accounting receive only their role-scoped operational views.

### Stock Room and Transfers

- [ ] **REQ-stockroom-receiving**: Stock Staff can record stock arriving at `SR`; posting increases `SR` through immutable inventory movements with source/reference, actor, and time.
- [ ] **REQ-transfer-dispatch**: Stock Staff can finalize and dispatch a multi-item `SR`-to-branch transfer. Physical dispatch atomically deducts `SR`, adds equal in-transit quantities, records history, and notifies the destination branch.
- [ ] **REQ-transfer-receipt**: Assigned Branch Staff can compare every incoming line and confirm a complete match once. Confirmation clears transit, increases branch stock, marks the transfer `RECEIVED`, and notifies Stock Staff and Admin.
- [ ] **REQ-transfer-discrepancy**: If any item or quantity differs, Branch Staff can submit actual quantities, reason, notes, and conditionally required photos without editing stock. Stock Staff and Admin are notified; disputed quantities remain unavailable.
- [ ] **REQ-discrepancy-resolution**: Stock Staff can investigate a linked discrepancy and record findings; Admin alone posts the final accountable stock outcome. Every original dispatch, count, finding, actor, reason, correction, and movement remains auditable.

### Notifications and Offline Continuity

- [ ] **REQ-durable-notifications**: Business events create durable per-user notifications for actionable roles. Connected clients receive live updates; reconnecting clients catch up; every notification attempts browser push when permitted. Urgent events include low stock, discrepancies, failed/aged sync, and overdue unresolved cases.
- [ ] **REQ-offline-continuity**: Admin can enable one primary offline device per branch. For up to 24 hours after online authorization, Branch Staff can queue non-negative-stock sales and transfer receipt/discrepancy evidence as `Pending Sync`. Reconnect processing is authenticated, scoped, idempotent, and preserves unsafe or aged operations as `Needs Review` without forcing or discarding them.

### Operations

- [ ] **REQ-deployment-operations**: Operators can deploy the verified system through Coolify to Hetzner under HTTPS with managed secrets, committed migrations, health checks, useful logs, automated PostgreSQL backups, and a tested restore before go-live.

## Deferred

- Customer Orders, downpayments, Job Orders, advanced CRM
- Customer return, exchange, and refund workflow
- Branch-to-branch transfers and direct supplier-to-branch receiving
- Standalone cycle-count and general physical-stock discrepancy workflow
- Formal daily cash/collection closing
- Custom roles and granular permission editing
- Multiple simultaneous offline-operation devices per branch
- Fully offline Admin, Stock Room, Accounting correction, or final discrepancy resolution

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-data-onboarding | Phase 1 | Pending |
| REQ-role-authorization | Phase 1 | Complete |
| REQ-user-management | Phase 1 | Complete |
| REQ-sales-posting | Phase 2 | Pending |
| REQ-sales-reconciliation | Phase 2 | Pending |
| REQ-dashboard-monitoring | Phase 5 | Pending |
| REQ-durable-notifications | Phase 3 | Pending |
| REQ-stockroom-receiving | Phase 4 | Pending |
| REQ-transfer-dispatch | Phase 4 | Pending |
| REQ-transfer-receipt | Phase 5 | Pending |
| REQ-transfer-discrepancy | Phase 5 | Pending |
| REQ-discrepancy-resolution | Phase 5 | Pending |
| REQ-offline-continuity | Phase 6 | Pending |
| REQ-deployment-operations | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 14
- Mapped to phases: 14
- Unmapped: 0
- Duplicate mappings: 0
