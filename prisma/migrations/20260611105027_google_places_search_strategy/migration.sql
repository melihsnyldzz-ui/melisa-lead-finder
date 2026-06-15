-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'HOT';
ALTER TYPE "LeadStatus" ADD VALUE 'LOW_QUALITY';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "businessStatus" TEXT,
ADD COLUMN     "googlePlaceId" TEXT,
ADD COLUMN     "internationalPhoneNumber" TEXT,
ADD COLUMN     "openingHours" JSONB,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "sourceCity" TEXT,
ADD COLUMN     "sourceCountry" TEXT,
ADD COLUMN     "sourceKeyword" TEXT,
ADD COLUMN     "types" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "userRatingsTotal" INTEGER;

-- AlterTable
ALTER TABLE "SearchRunHistory" ADD COLUMN     "averageScore" DOUBLE PRECISION,
ADD COLUMN     "duplicateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "keywordGroup" TEXT,
ADD COLUMN     "sourceKeyword" TEXT;

-- AlterTable
ALTER TABLE "SearchTask" ADD COLUMN     "averageScore" DOUBLE PRECISION,
ADD COLUMN     "duplicateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "insertedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "keywordGroup" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "sourceKeyword" TEXT;

-- CreateIndex
CREATE INDEX "Lead_googlePlaceId_idx" ON "Lead"("googlePlaceId");
