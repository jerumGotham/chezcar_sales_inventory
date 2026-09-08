# Personnel Production Spec

**Status:** Maintenance, Sales/Order attribution, and Backjob Installer assignment implemented
**Last updated:** 2026-09-08
**Source:** Owner grill-with-docs decisions; ADR 0015

## Purpose

Maintain operational Salesperson and Installer identities independently from system login accounts. Personnel records support transaction attribution and assignment; they do not grant application access.

The Personnel master, lifecycle, location scope, permissions, APIs, and `/personnel` UI are implemented. Direct Sales and Customer Orders require an eligible branch Salesperson and store immutable name/branch snapshots separately from the authenticated encoder. Backjob Installer assignment is implemented.

## Personnel Record

Each record has:

- Stable internal ID and human-readable name.
- One home branch.
- Type: `SALESPERSON`, `INSTALLER`, or `BOTH`.
- Active/inactive status.
- Created/updated timestamps and actors.

A Personnel record does not require an email address, password, role, or User account. Deactivation prevents new selections but preserves historical attribution. Reassignment changes future selection only; posted transactions retain their original branch and personnel snapshots.

## Selection Rules

- Every Direct Sale and Customer Order requires an active `SALESPERSON` or `BOTH` from an active home branch within the acting user's personnel location scope before posting. `locations:all` actors (and owners) may select across all active branches; scoped actors may select across their authorized locations, independently of the transaction branch.
- A Backjob may be drafted before assignment but requires an active `INSTALLER` or `BOTH` Personnel record within the same actor-based personnel scope before scheduling. Scheduling, start, and completion hold a PostgreSQL `FOR SHARE` lock on the assigned Personnel row while validating eligibility and committing the workflow action, so concurrent deactivation, reassignment, or type changes cannot pass between validation and commit.
- A `BOTH` record may be selected for either function.
- Salesperson and encoder are separate identities. The selected Personnel record receives business attribution; the authenticated User remains the actor who encoded or posted the transaction.
- Existing pre-attribution sales/orders remain visible as `Not recorded (legacy)`; no Personnel identity is fabricated from an encoder.
- Open orders may replace Salesperson attribution through an audited narrow action. Every actual change appends an immutable previous/new Personnel and branch snapshot event with actor/time; selecting the current Salesperson adds no event. Release revalidates active/type/branch eligibility and copies the order snapshot to the posted Sale.
- Void-only actions preserve attribution. Void-and-replace copies the original Salesperson snapshot without requiring that Personnel to remain active or assigned to the historical branch.
- Cross-branch selection is allowed within the acting user's authorized personnel locations. This supersedes the previous same-branch restriction; it does not grant access to the transaction location or change the Personnel home branch. Temporary and multiple-branch personnel assignments remain deferred.
- Online selectors and offline snapshots use the same eligibility scope. Offline sync, order reassignment/release, and Backjob scheduling/start/completion revalidate against the current acting user's scope, status, and required Personnel type. A scoped actor cannot continue with an assignment outside their locations merely because an all-location actor previously selected it.

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
