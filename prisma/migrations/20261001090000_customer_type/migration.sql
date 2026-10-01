-- A customer is not always a person. A company, a government office, and a
-- parish each buy as one named body, so the party's kind is recorded beside
-- its single name. Existing rows were all captured as people, which is what
-- the default states; the column is additive and nothing is rewritten.

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'GOVERNMENT', 'RELIGIOUS_ORGANIZATION');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL';
