CREATE TYPE "PersonnelType" AS ENUM ('SALESPERSON', 'INSTALLER', 'BOTH');
CREATE TYPE "PersonnelStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "Personnel" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "PersonnelType" NOT NULL,
    "status" "PersonnelStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "updatedById" TEXT,
    "deactivatedById" TEXT,
    "reactivatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Personnel_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Personnel_fullName_nonblank" CHECK (length(btrim("fullName")) > 0)
);

CREATE INDEX "Personnel_locationId_status_fullName_idx" ON "Personnel"("locationId", "status", "fullName");
CREATE INDEX "Personnel_createdById_idx" ON "Personnel"("createdById");
CREATE INDEX "Personnel_updatedById_idx" ON "Personnel"("updatedById");
CREATE INDEX "Personnel_deactivatedById_idx" ON "Personnel"("deactivatedById");
CREATE INDEX "Personnel_reactivatedById_idx" ON "Personnel"("reactivatedById");

ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_reactivatedById_fkey" FOREIGN KEY ("reactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "RoleDefinition"
SET "permissions" = ARRAY(
    SELECT DISTINCT permission
    FROM unnest("permissions" || ARRAY[
        'personnel:view',
        'personnel:create',
        'personnel:update',
        'personnel:deactivate'
    ]::TEXT[]) AS grants(permission)
)
WHERE "isOwner" = true;
