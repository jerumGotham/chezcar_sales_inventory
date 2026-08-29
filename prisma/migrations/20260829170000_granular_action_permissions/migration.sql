-- Replace broad module grants with explicit action grants. RoleScope preserves
-- the operational intent of existing custom roles during the transition.
UPDATE "RoleDefinition"
SET permissions = ARRAY(
  SELECT DISTINCT permission
  FROM unnest(
    permissions ||
    CASE WHEN 'dashboard:view' = ANY(permissions) THEN ARRAY[
      'notifications:view', 'notifications:mark-read', 'notifications:push'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'customers:view' = ANY(permissions) AND scope IN ('OWNER', 'BRANCH') THEN ARRAY[
      'customers:create', 'customers:update', 'customers:deactivate'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'customer-orders:view' = ANY(permissions) AND scope IN ('OWNER', 'BRANCH') THEN ARRAY[
      'customer-orders:create', 'customer-orders:reserve',
      'customer-orders:record-payment', 'customer-orders:release',
      'customer-orders:cancel'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'customer-orders:view' = ANY(permissions) AND scope <> 'STOCK_ROOM' THEN ARRAY['sales:view']::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN scope = 'OWNER' AND 'customer-orders:view' = ANY(permissions) THEN ARRAY[
      'customer-orders:cancel-paid'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'sales:post' = ANY(permissions) THEN ARRAY['sales:view']::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'sales:verify:view' = ANY(permissions) THEN ARRAY['sales:evidence:view']::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'sales:verify' = ANY(permissions) THEN ARRAY['sales:evidence:upload']::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN scope = 'OWNER' AND 'sales:resolve' = ANY(permissions) THEN ARRAY['sales:void-replace']::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'products:view' = ANY(permissions) AND scope = 'OWNER' THEN ARRAY[
      'products:create', 'products:update', 'products:delete', 'products:image:update'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'inventory:view' = ANY(permissions) THEN ARRAY['inventory-availability:view']::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'inventory:view' = ANY(permissions) THEN ARRAY[
      'inventory-movements:view'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'inventory:view' = ANY(permissions) AND scope = 'OWNER' THEN ARRAY[
      'inventory:adjust', 'inventory:cost:update'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'inventory-receiving:create' = ANY(permissions) THEN ARRAY[
      'stock-receipts:view', 'inventory-movements:view'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'stock-transfers:view' = ANY(permissions) AND scope IN ('OWNER', 'STOCK_ROOM') THEN ARRAY[
      'stock-transfers:audit:view', 'stock-transfers:create',
      'stock-transfers:update', 'stock-transfers:delete',
      'stock-transfers:finalize', 'stock-transfers:dispatch',
      'stock-transfers:investigate'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'stock-transfers:view' = ANY(permissions) AND scope = 'BRANCH' THEN ARRAY[
      'stock-transfers:receive', 'stock-transfers:report-discrepancy'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'stock-transfers:view' = ANY(permissions) AND scope = 'OWNER' THEN ARRAY[
      'stock-transfers:resolve'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'reports:view' = ANY(permissions) THEN ARRAY['reports:export']::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN scope = 'BRANCH' AND 'sales:post' = ANY(permissions) THEN ARRAY[
      'offline-sales:snapshot', 'offline-sales:sync'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'users:manage' = ANY(permissions) THEN ARRAY[
      'users:view', 'users:create', 'users:update', 'users:set-status',
      'users:reset-password', 'offline-sales:activate-device'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'branches:manage' = ANY(permissions) THEN ARRAY[
      'branches:view', 'branches:create', 'branches:update'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END ||
    CASE WHEN 'roles:manage' = ANY(permissions) THEN ARRAY[
      'roles:view', 'roles:create', 'roles:update'
    ]::TEXT[] ELSE ARRAY[]::TEXT[] END
  ) AS permission
  WHERE permission NOT IN ('users:manage', 'branches:manage', 'roles:manage')
),
version = version + 1,
"updatedAt" = CURRENT_TIMESTAMP;
