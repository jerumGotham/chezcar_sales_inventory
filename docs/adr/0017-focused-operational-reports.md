# ADR 0017: Focused Operational Reports

**Status:** Accepted; supersedes ADR 0013
**Date:** 2026-09-07

**Revision, 2026-09-08:** The owner narrowed the current Reports surface to Sales, branch-only available Inventory Summary, and Returns & Warranty. Inventory Movements and Low Stock are deferred from Reports, leaving operational inventory history intact. This revision replaces the original report set and month-to-date defaults below: dated reports now default through the last day of the selected/default Manila month; filter edits remain pending until Apply Filters; PDFs use readable grouped columns with Sales branch subtotals and an overall total, without a literal logo placeholder. See `../product/REPORTS-SPEC.md` for current behavior and source-only verification limits. The original decision is retained below as history.

## Context

The combined Reports summary currently duplicates operational Accounting and Orders queues and cannot provide a reliable monthly total because its query is unfiltered and row-limited. The business needs a concise branch-comparison Sales Report and focused inventory and warranty reports.

## Decision

1. Reports access is capability-based and location-scoped. Users with company-wide report and location access may see consolidated branch totals; restricted users see only authorized locations.
2. Provide five reports: Sales, Inventory Summary, Inventory Movements, Returns & Warranty, and Low Stock.
3. Remove Accounting Queue, Open Orders, mismatch lists, and order lists from the Reports page. Their operational modules remain authoritative.
4. The Sales Report defaults from the first day of the current month through today, with all authorized branches selected.
5. Official Sales totals include only verified, non-voided sales and group them by system verification date. Pending/unverified sales are excluded.
6. Sales filters include date range, authorized branch, Salesperson, source, and payment method. Output includes branch totals and a grand total.
7. Inventory Summary and Low Stock are current snapshots and do not use historical date ranges.
8. Inventory Movements and Returns & Warranty support date-range and relevant entity/status filters.
9. PDF exports use the selected report, filters, effective location scope, and complete aggregate query. Display pagination or row limits must never truncate totals.
10. Commission, staff ranking, and payroll reports remain deferred.

## Consequences

- The default Sales Report is a monthly view but supports arbitrary date ranges without a separate Monthly Sales menu.
- Official sales totals lag until Accounting verification, intentionally matching the chosen business definition.
- Reports no longer serve as duplicate work queues.
- Existing Reports UI, API, authorization, aggregation, and PDF generation require replacement rather than incremental labels alone.
