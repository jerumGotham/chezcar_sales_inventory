ALTER TABLE "RoleDefinition"
ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_role_location_check";

UPDATE "RoleDefinition"
SET "isOwner" = true
WHERE "scope" = 'OWNER';

CREATE UNIQUE INDEX "RoleDefinition_single_owner_idx"
ON "RoleDefinition" ("isOwner")
WHERE "isOwner" = true;

CREATE UNIQUE INDEX "User_single_owner_role_key"
ON "User" ("roleDefinitionId")
WHERE "roleDefinitionId" = 'role-admin';

CREATE TABLE "UserLocation" (
  "userId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("userId", "locationId"),
  CONSTRAINT "UserLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserLocation_locationId_idx" ON "UserLocation"("locationId");

INSERT INTO "UserLocation" ("userId", "locationId")
SELECT "id", "locationId"
FROM "User"
WHERE "locationId" IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE "RoleDefinition"
SET "permissions" = array_append("permissions", 'locations:all'),
    "version" = "version" + 1
WHERE ("scope" IN ('OWNER', 'BUSINESS_WIDE') OR "isOwner" = true)
  AND NOT ('locations:all' = ANY("permissions"));
