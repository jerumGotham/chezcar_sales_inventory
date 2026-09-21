-- Reports are granted one at a time now, so a role sees only the tabs it holds
-- and a grant covers both reading a report and exporting its PDF. A role that
-- could see reports before keeps every report, which is what it already had;
-- "reports:export" disappears because it no longer means anything on its own.
UPDATE "RoleDefinition"
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      array_remove(array_remove(permissions, 'reports:view'), 'reports:export')
      || ARRAY['reports:sales', 'reports:salesperson-sales', 'reports:inventory-summary', 'reports:stock-movement', 'reports:returns-warranty']
    )
  )
)
WHERE permissions && ARRAY['reports:view', 'reports:export'];

-- A role that only ever held the export grant without the view grant would be
-- left with a dangling permission, so drop it wherever it still appears.
UPDATE "RoleDefinition"
SET permissions = array_remove(array_remove(permissions, 'reports:view'), 'reports:export')
WHERE permissions && ARRAY['reports:view', 'reports:export'];
