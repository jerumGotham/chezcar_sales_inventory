---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-08-25T06:32:02.409Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | stub | package.json | 15 | data:generate targets the Plan 01-05 executable, which is intentionally not created in Plan 01-02. | open |  | 2026-08-25T06:32:02.409Z |  |

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
  }
]
````
