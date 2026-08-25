---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 0
total_count: 4
last_updated: 2026-08-25T06:51:14.216Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | stub | package.json | 15 | data:generate targets the Plan 01-05 executable, which is intentionally not created in Plan 01-02. | open |  | 2026-08-25T06:32:02.409Z |  |
| 2 | 01 | stub | scripts/data-onboarding/resolutions.json | 8 | All 855 resolution records remain intentionally unresolved for the Plan 01-04 owner checkpoint | open |  | 2026-08-25T06:51:13.261Z |  |
| 3 | 01 | deviation | scripts/data-onboarding/canonicalize.mjs |  | Formula-only identity-empty rows and accessory labels required classification correction during real-workbook profiling | open |  | 2026-08-25T06:51:13.725Z |  |
| 4 | 01 | deviation | scripts/data-onboarding/workbook-profile.d.mts |  | Existing strict profiler declaration required review-package API exports omitted from the task file list | open |  | 2026-08-25T06:51:14.216Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "01",
    "file": "package.json",
    "line": 15,
    "description": "data:generate targets the Plan 01-05 executable, which is intentionally not created in Plan 01-02.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T06:32:02.409Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "stub",
    "phase": "01",
    "file": "scripts/data-onboarding/resolutions.json",
    "line": 8,
    "description": "All 855 resolution records remain intentionally unresolved for the Plan 01-04 owner checkpoint",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T06:51:13.261Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "01",
    "file": "scripts/data-onboarding/canonicalize.mjs",
    "line": null,
    "description": "Formula-only identity-empty rows and accessory labels required classification correction during real-workbook profiling",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T06:51:13.725Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "01",
    "file": "scripts/data-onboarding/workbook-profile.d.mts",
    "line": null,
    "description": "Existing strict profiler declaration required review-package API exports omitted from the task file list",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T06:51:14.216Z",
    "resolved_at": null
  }
]
````
