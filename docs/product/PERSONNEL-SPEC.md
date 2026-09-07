# Personnel Production Spec

**Status:** Maintenance, Sales/Order attribution, and Backjob Installer assignment implemented
**Last updated:** 2026-09-07
**Source:** Owner grill-with-docs decisions; ADR 0015

## Purpose

Maintain operational Salesperson and Installer identities independently from system login accounts. Personnel records support transaction attribution and assignment; they do not grant application access.

The Personnel master, lifecycle, location scope, permissions, APIs, and `/personnel` UI are implemented. Direct Sales and Customer Orders require an eligible branch Salesperson and store immutable name/branch snapshots separately from the authenticated encoder. Backjob Installer assignment remains pending.

## Personnel Record

Each record has:

- Stable internal ID and human-readable name.
- One home branch.
- Type: `SALESPERSON`, `INSTALLER`, or `BOTH`.
- Active/inactive status.
- Created/updated timestamps and actors.

A Personnel record does not require an email address, password, role, or User account. Deactivation prevents new selections but preserves historical attribution. Reassignment changes future selection only; posted transactions retain their original branch and personnel snapshots.

## Selection Rules

- Every Direct Sale and Customer Order requires an active Salesperson from the transaction branch before it can be posted.
- A Backjob may be drafted before assignment but requires an active Installer from the case branch before scheduling or work completion.
- A `BOTH` record may be selected for either function.
- Salesperson and encoder are separate identities. The selected Personnel record receives business attribution; the authenticated User remains the actor who encoded or posted the transaction.
- Existing pre-attribution sales/orders remain visible as `Not recorded (legacy)`; no Personnel identity is fabricated from an encoder.
- Open orders may replace Salesperson attribution through an audited narrow action. Release revalidates active/type/branch eligibility and copies the order snapshot to the posted Sale.
- Void-only actions preserve attribution. Void-and-replace copies the original Salesperson snapshot without requiring that Personnel to remain active or assigned to the historical branch.
- Cross-branch selection is not allowed. Temporary and multiple-branch personnel assignments are deferred.

## Access

Personnel maintenance uses action capabilities rather than built-in role names:

- `personnel:view`
- `personnel:create`
- `personnel:update`
- `personnel:deactivate`

Users who can create a sale, order, or Backjob may receive the minimal branch-scoped active-personnel lookup needed by that workflow without receiving Personnel maintenance access.

## Deferred

- System login linkage.
- Multiple or temporary branch assignments.
- Commission calculation, approval, statements, and payment tracking.
- Payroll, attendance, wages, deductions, and statutory processing.
- Salesperson ranking or performance scoring.

Sales reports may filter and group verified sales by Salesperson, but this is attribution reporting, not commission or performance ranking.

## Acceptance Criteria

1. Personnel can exist without a User account.
2. Each Personnel record has exactly one active home branch and at least one operational type.
3. Direct Sales and Customer Orders cannot post without a valid branch Salesperson.
4. Backjobs cannot be scheduled or completed without a valid branch Installer.
5. Deactivated Personnel cannot be selected for new transactions but remain visible in history.
6. Every attributed transaction separately records the Personnel identity and authenticated User actor.
7. Personnel maintenance and branch-scoped selection are server-authorized independently.
