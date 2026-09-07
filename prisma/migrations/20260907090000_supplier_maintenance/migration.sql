CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "contactNumber" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "updatedById" TEXT,
    "deactivatedById" TEXT,
    "reactivatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Supplier_name_nonblank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "Supplier_code_nonblank" CHECK ("code" IS NULL OR length(btrim("code")) > 0)
);

CREATE UNIQUE INDEX "Supplier_name_normalized_key" ON "Supplier" (lower(btrim("name")));
CREATE UNIQUE INDEX "Supplier_code_normalized_key" ON "Supplier" (lower(btrim("code"))) WHERE "code" IS NOT NULL;
CREATE INDEX "Supplier_status_name_idx" ON "Supplier"("status", "name");
CREATE INDEX "Supplier_createdById_idx" ON "Supplier"("createdById");
CREATE INDEX "Supplier_updatedById_idx" ON "Supplier"("updatedById");
CREATE INDEX "Supplier_deactivatedById_idx" ON "Supplier"("deactivatedById");
CREATE INDEX "Supplier_reactivatedById_idx" ON "Supplier"("reactivatedById");

ALTER TABLE "StockReceipt" ADD COLUMN "supplierId" TEXT;

INSERT INTO "Supplier" ("id", "name", "status", "createdAt", "updatedAt")
SELECT
    'supplier_migrated_' || md5(lower(btrim("supplier"))),
    min(btrim("supplier")),
    'ACTIVE'::"SupplierStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "StockReceipt"
GROUP BY lower(btrim("supplier"));

UPDATE "StockReceipt" receipt
SET "supplierId" = supplier."id"
FROM "Supplier" supplier
WHERE lower(btrim(receipt."supplier")) = lower(btrim(supplier."name"));

ALTER TABLE "StockReceipt" ALTER COLUMN "supplierId" SET NOT NULL;
CREATE INDEX "StockReceipt_supplierId_idx" ON "StockReceipt"("supplierId");

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_reactivatedById_fkey" FOREIGN KEY ("reactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "RoleDefinition"
SET "permissions" = ARRAY(
    SELECT DISTINCT permission
    FROM unnest("permissions" || ARRAY[
        'suppliers:view',
        'suppliers:create',
        'suppliers:update',
        'suppliers:deactivate'
    ]::TEXT[]) AS grants(permission)
)
WHERE "isOwner" = true;
