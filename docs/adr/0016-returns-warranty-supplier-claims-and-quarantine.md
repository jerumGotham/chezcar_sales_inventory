# ADR 0016: Returns, Warranty, Supplier Claims, and Quarantine

**Status:** Accepted
**Date:** 2026-09-07

## Context

The business needs Backjob, customer replacement, damaged supplier item, and supplier-resolution tracking. These workflows must not silently edit stock or make damaged items sellable. Customer service status and supplier recovery status can advance independently.

## Decision

1. Use three workflow records: Backjob, Customer Warranty, and Supplier Claim. Supplier Damage is an issue reason within Supplier Claim, not a fourth transaction type.
2. Represent quarantine as a quantity bucket per product/location, not a separate Location.
3. Calculate `available = onHand - reserved - quarantined`.
4. Status changes and approvals do not change inventory. Only confirmed physical actions post immutable movements.
5. Deduct Backjob parts when issued and record unused returns separately.
6. Permit an approved Customer Warranty replacement to use available branch stock immediately; supplier recovery remains a separate linked claim.
7. Create a Supplier Claim from a Customer Warranty only when supplier coverage is confirmed.
8. Permit branch locations to return claim stock directly to suppliers and receive supplier replacements at the claim location.
9. Require split receiving for sellable, quarantined, and missing supplier quantities.
10. Track supplier refunds and credit memos as claim resolutions without inventory or general-ledger effects in this scope.
11. Limit customer resolutions to repair and replacement; customer refunds/exchanges are deferred.
12. Require stable Supplier master data and capability-based, location-scoped authorization.
13. Require photo evidence for Customer Warranty and Supplier Claim damage/defect submissions; Backjob photos remain optional.
14. Require schedule/follow-up target dates for active case stages and preserve reasoned rescheduling history for overdue monitoring.

## Consequences

- On-hand remains the physical quantity while quarantine explicitly reduces sellable availability.
- Customer and supplier statuses remain understandable when company stock is released before supplier replacement arrives.
- Inventory remains auditable because case intent and physical movement are separate.
- Inventory balance, receiving, reports, notifications, permissions, and correction logic require coordinated changes.
- General accounting, purchase orders, customer refunds/exchanges, commission, and payroll remain out of scope.
