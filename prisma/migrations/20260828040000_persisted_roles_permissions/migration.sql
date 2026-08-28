CREATE TYPE "RoleScope" AS ENUM ('OWNER', 'BRANCH', 'STOCK_ROOM', 'BUSINESS_WIDE');

CREATE TABLE "RoleDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoleDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoleDefinition_key_key" ON "RoleDefinition"("key");
CREATE UNIQUE INDEX "RoleDefinition_name_ci_key" ON "RoleDefinition" (LOWER("name"));
CREATE UNIQUE INDEX "RoleDefinition_single_owner_key" ON "RoleDefinition" ((1)) WHERE "scope" = 'OWNER';
CREATE INDEX "RoleDefinition_scope_idx" ON "RoleDefinition"("scope");

INSERT INTO "RoleDefinition" (
    "id", "key", "name", "description", "scope", "permissions", "isSystem", "updatedAt"
) VALUES
    (
      'role-admin', 'admin', 'Admin', 'Immutable owner role with full application access.', 'OWNER',
      ARRAY[
        'dashboard:view', 'customers:view', 'customer-orders:view', 'sales:post',
        'sales:verify:view', 'sales:verify', 'sales:resolve', 'sales:mismatch:respond',
        'products:view', 'inventory:view', 'inventory-receiving:create', 'reports:view',
        'users:manage', 'branches:manage', 'roles:manage', 'stock-transfers:view'
      ], true, CURRENT_TIMESTAMP
    ),
    (
      'role-stock-staff', 'stock-staff', 'Stock Staff', 'Built-in Stock Room operational role.', 'STOCK_ROOM',
      ARRAY[
        'dashboard:view', 'customers:view', 'customer-orders:view', 'products:view',
        'inventory:view', 'inventory-receiving:create', 'stock-transfers:view'
      ], true, CURRENT_TIMESTAMP
    ),
    (
      'role-branch-staff', 'branch-staff', 'Branch Staff', 'Built-in branch operational role.', 'BRANCH',
      ARRAY[
        'dashboard:view', 'customers:view', 'customer-orders:view', 'sales:post',
        'sales:verify:view', 'sales:mismatch:respond', 'inventory:view', 'stock-transfers:view'
      ], true, CURRENT_TIMESTAMP
    ),
    (
      'role-accounting-staff', 'accounting-staff', 'Accounting Staff', 'Built-in business-wide accounting role.', 'BUSINESS_WIDE',
      ARRAY[
        'dashboard:view', 'customers:view', 'customer-orders:view', 'sales:verify',
        'sales:verify:view', 'sales:resolve', 'reports:view'
      ], true, CURRENT_TIMESTAMP
    );

ALTER TABLE "User" ADD COLUMN "roleDefinitionId" TEXT;

UPDATE "User"
SET "roleDefinitionId" = CASE "role"
  WHEN 'ADMIN' THEN 'role-admin'
  WHEN 'STOCK_STAFF' THEN 'role-stock-staff'
  WHEN 'BRANCH_STAFF' THEN 'role-branch-staff'
  WHEN 'ACCOUNTING_STAFF' THEN 'role-accounting-staff'
END;

ALTER TABLE "User" ALTER COLUMN "roleDefinitionId" SET NOT NULL;
CREATE INDEX "User_roleDefinitionId_idx" ON "User"("roleDefinitionId");
ALTER TABLE "User" ADD CONSTRAINT "User_roleDefinitionId_fkey"
  FOREIGN KEY ("roleDefinitionId") REFERENCES "RoleDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
