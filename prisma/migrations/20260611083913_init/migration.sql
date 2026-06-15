-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'REVIEW', 'QUALIFIED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('DEMO', 'GOOGLE_PLACES', 'APIFY', 'WEBSITE', 'INSTAGRAM', 'MANUAL');

-- CreateEnum
CREATE TYPE "SearchTaskStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "displayName" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "googleMapsUrl" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'DEMO',
    "sourceQuery" TEXT,
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "scoreReason" TEXT,
    "categoryGuess" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "notes" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "query" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL DEFAULT 'DEMO',
    "maxResults" INTEGER NOT NULL DEFAULT 50,
    "status" "SearchTaskStatus" NOT NULL DEFAULT 'DRAFT',
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_country_idx" ON "Lead"("country");

-- CreateIndex
CREATE INDEX "Lead_city_idx" ON "Lead"("city");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_leadScore_idx" ON "Lead"("leadScore");
