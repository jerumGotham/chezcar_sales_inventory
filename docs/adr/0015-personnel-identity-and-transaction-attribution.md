# ADR 0015: Personnel Identity and Transaction Attribution

**Status:** Accepted
**Date:** 2026-09-07

## Context

Salespersons and Installers must be selectable in operational transactions, but many do not need system access. Reusing authenticated User accounts would incorrectly couple employment/attribution records to authorization and would confuse the person credited or assigned with the user who encoded an action.

## Decision

1. Introduce Personnel as master data separate from User accounts.
2. A Personnel record has one home branch, type `SALESPERSON`, `INSTALLER`, or `BOTH`, and active/inactive status.
3. Direct Sales and Customer Orders require an active branch Salesperson before posting.
4. Backjobs require an active branch Installer before scheduling or completion.
5. Transactions preserve both the selected Personnel attribution and authenticated User actor.
6. Deactivation or branch reassignment affects future selection only and never rewrites history.
7. Personnel maintenance uses dedicated action capabilities; workflow lookup does not grant maintenance access.
8. Commission and Payroll are deferred. Salesperson totals are attribution reporting only.

## Consequences

- Non-login Salespersons and Installers can participate in workflows without shared or artificial accounts.
- Audit identity remains accurate because encoder and attributed personnel are separate.
- Personnel branch changes require historical snapshots or immutable transaction references.
- Commission cannot be inferred safely until its own calculation and reversal rules are approved.
