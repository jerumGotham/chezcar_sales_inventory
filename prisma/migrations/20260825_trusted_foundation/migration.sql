-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "price" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "banExpires" TIMESTAMP(3),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "credentialSetupRequired" BOOLEAN NOT NULL DEFAULT false;

-- User.status remains the sole application active/inactive authority. The
-- Better Auth Admin-plugin ban columns are compatibility storage only.

-- Enforce the fixed role/location nullability matrix at the database boundary.
ALTER TABLE "User" ADD CONSTRAINT "User_role_location_check" CHECK (
  ("role" IN ('ADMIN', 'ACCOUNTING_STAFF') AND "locationId" IS NULL)
  OR
  ("role" IN ('STOCK_STAFF', 'BRANCH_STAFF') AND "locationId" IS NOT NULL)
);

-- The application has one owner Admin. Staff-management workflows cannot add another.
CREATE UNIQUE INDEX "User_single_admin_key"
ON "User" ((1))
WHERE "role" = 'ADMIN';
