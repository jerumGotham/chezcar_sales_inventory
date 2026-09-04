CREATE TYPE "SaleCorrectionRequestStatus" AS ENUM ('PENDING', 'RESOLVED');
CREATE TYPE "SaleCorrectionRequestReason" AS ENUM ('ACCIDENTAL_SUBMISSION', 'DUPLICATE_SUBMISSION', 'WRONG_INFORMATION', 'SALE_DID_NOT_HAPPEN', 'OTHER');
CREATE TYPE "SaleCorrectionRequestResolution" AS ENUM ('KEPT', 'VOIDED');

CREATE TABLE "SaleCorrectionRequest" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "reason" "SaleCorrectionRequestReason" NOT NULL,
  "note" TEXT NOT NULL,
  "status" "SaleCorrectionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "resolution" "SaleCorrectionRequestResolution",
  "resolutionNote" TEXT,
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SaleCorrectionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaleCorrectionRequest_resolution_check" CHECK (
    ("status" = 'PENDING' AND "resolution" IS NULL AND "resolutionNote" IS NULL AND "resolvedById" IS NULL AND "resolvedAt" IS NULL)
    OR
    ("status" = 'RESOLVED' AND "resolution" IS NOT NULL AND NULLIF(BTRIM("resolutionNote"), '') IS NOT NULL AND "resolvedById" IS NOT NULL AND "resolvedAt" IS NOT NULL)
  )
);

CREATE INDEX "SaleCorrectionRequest_saleId_status_idx" ON "SaleCorrectionRequest"("saleId", "status");
CREATE INDEX "SaleCorrectionRequest_requestedById_idx" ON "SaleCorrectionRequest"("requestedById");
CREATE INDEX "SaleCorrectionRequest_resolvedById_idx" ON "SaleCorrectionRequest"("resolvedById");
CREATE UNIQUE INDEX "SaleCorrectionRequest_one_pending_per_sale_key" ON "SaleCorrectionRequest"("saleId") WHERE "status" = 'PENDING';

ALTER TABLE "SaleCorrectionRequest"
  ADD CONSTRAINT "SaleCorrectionRequest_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleCorrectionRequest"
  ADD CONSTRAINT "SaleCorrectionRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleCorrectionRequest"
  ADD CONSTRAINT "SaleCorrectionRequest_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "RoleDefinition"
SET permissions = ARRAY(
  SELECT DISTINCT permission
  FROM unnest(permissions || ARRAY['sales:correction:request']::TEXT[]) AS permission
),
version = version + 1,
"updatedAt" = CURRENT_TIMESTAMP
WHERE key IN ('admin', 'branch-staff')
  AND NOT ('sales:correction:request' = ANY(permissions));
