# Phase 1: Trusted Foundation and Data Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 1-Trusted Foundation and Data Onboarding
**Areas discussed:** Import review flow, invalid and duplicate rows, opening stock confirmation, role and branch experience, minimal User Management

---

## Import Review Flow

| Option | Description | Selected |
|--------|-------------|----------|
| One-time project input | Profile the workbook for canonical design and initial seeding without an app upload feature | Yes |
| Reference only | Use it only for terminology and encode initial data separately | |
| Admin import feature | Build upload, preview, mapping, approval, and recurring import UI | |

**User's choice:** One-time project input.
**Notes:** The owner clarified that Excel is the basis for both the seeder and column/database design. Earlier answers about an Admin validation-preview UI were superseded.

---

## Invalid and Duplicate Rows

| Decision | Alternatives considered | Selected behavior |
|----------|-------------------------|-------------------|
| Duplicate items | Auto-merge; keep every row | Flag for owner review |
| Missing item code | Require owner code; use product name | Generate temporary code |
| Invalid quantity | Coerce to zero; ignore until physical count | Block affected row for review |
| Conflicting price | Last row wins; highest price wins | Owner confirms each conflict |

**User's choice:** Conservative review for duplicates, quantities, and prices, with generated temporary codes for missing identifiers.
**Notes:** Cleanup occurs as part of project profiling and seed preparation, not in an application import screen.

---

## Opening Stock Confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Seed Excel values directly | Use workbook quantities per location as initial development/test balances | Yes |
| Verify counts before seed | Replace workbook values with confirmed physical counts first | |
| Seed then approve in app | Load pending balances for Admin approval | |

**User's choice:** Seed Excel values directly.
**Notes:** `SR` is Stock Room; `QC`, `BL`, `LU`, `VC`, and `SP` are branches. Seeder behavior is reset-and-reload in development/test only; production reset is blocked.

---

## Role and Branch Experience

| Decision | Alternatives considered | Selected behavior |
|----------|-------------------------|-------------------|
| Unauthorized navigation | Disabled entries; show then deny | Hide entries |
| Direct unauthorized URL | Silent redirect; generic not-found | Dedicated access-denied page |
| Location selection | Everyone selects; no selector | Admin selects, staff location is fixed |
| Missing Branch Staff assignment | Empty dashboard; automatic branch | Prevent activation without mandatory branch |

**User's choice:** Role-aware presentation backed by strict server policy and mandatory persisted branch assignment.
**Notes:** Stock Staff defaults to `SR`; Admin can select all or one location.

---

## Minimal User Management

| Decision | Alternatives considered | Selected behavior |
|----------|-------------------------|-------------------|
| Phase scope | Assignment only; developer provisioning | Minimal Admin-only management |
| Initial credentials | Email setup link; developer-created credentials | Admin-set temporary password |
| First login | Forced change; no special handling | Prompt change but allow skip |
| Deactivation | Let sessions expire; Admin chooses | Revoke sessions immediately |
| Role/branch change | Apply after normal re-login; Admin chooses | Revoke sessions and require re-login |

**User's choice:** Include the minimum account lifecycle needed for fixed roles and valid location assignments.
**Notes:** Custom permission editing is not included.

---

## Agent Discretion

- Temporary item-code format and collision handling.
- Seed report and source-column mapping format.
- Detailed layout of access-denied and User Management screens.

## Deferred Ideas

- Custom permission management.
- Recurring in-app spreadsheet imports.
- Physical discrepancy resolution, which belongs to a later phase.
