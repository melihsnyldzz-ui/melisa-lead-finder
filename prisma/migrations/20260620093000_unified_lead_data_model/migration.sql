-- Expand lead status and source enums without removing old values.
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CONTACT_READY';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CONTACTED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'REPLIED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CATALOG_SENT';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'OFFER_SENT';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'WON';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'LOST';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'NURTURE';

ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'INSTAGRAM_APIFY';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'WEBSITE_SCAN';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'CSV_IMPORT';

CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VIP');
CREATE TYPE "RiskLabel" AS ENUM ('REAL_STORE', 'WHOLESALER', 'ONLINE_SELLER', 'INFLUENCER', 'PERSONAL_ACCOUNT', 'IRRELEVANT_CATEGORY', 'INACTIVE', 'UNKNOWN');
CREATE TYPE "LeadActivityType" AS ENUM ('NOTE', 'STATUS_CHANGE', 'FEEDBACK', 'AI_ANALYSIS', 'SEARCH_DISCOVERY', 'CONTACT_ATTEMPT', 'CATALOG_SENT', 'OFFER_SENT', 'REPLY_RECEIVED', 'WON', 'LOST', 'REJECTED', 'NURTURE');

ALTER TABLE "Lead"
ADD COLUMN "category" TEXT,
ADD COLUMN "combinedScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "fitScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contactScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "activityScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "potentialScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "riskLabel" "RiskLabel" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "nextBestAction" TEXT,
ADD COLUMN "nextFollowUpDate" TIMESTAMP(3);

UPDATE "Lead"
SET "combinedScore" = "leadScore"
WHERE "combinedScore" = 0 AND "leadScore" > 0;

CREATE TABLE "LeadSource" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "sourceType" "SourceType" NOT NULL,
  "sourceName" TEXT,
  "sourceUrl" TEXT,
  "sourceQuery" TEXT,
  "rawPayload" JSONB,
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstagramProfile" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "username" TEXT,
  "profileName" TEXT,
  "profileUrl" TEXT,
  "bio" TEXT,
  "followerCount" INTEGER,
  "followingCount" INTEGER,
  "postCount" INTEGER,
  "lastPostDate" TIMESTAMP(3),
  "language" TEXT,
  "countrySignal" TEXT,
  "citySignal" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "website" TEXT,
  "riskLabel" "RiskLabel" NOT NULL DEFAULT 'UNKNOWN',
  "aiScore" INTEGER,
  "aiScoreReason" TEXT,
  "suggestedFirstMessage" TEXT,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InstagramProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadActivity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "activityType" "LeadActivityType" NOT NULL,
  "channel" TEXT,
  "content" TEXT,
  "result" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lead_priority_idx" ON "Lead"("priority");
CREATE INDEX "Lead_combinedScore_idx" ON "Lead"("combinedScore");
CREATE INDEX "LeadSource_leadId_idx" ON "LeadSource"("leadId");
CREATE INDEX "LeadSource_sourceType_idx" ON "LeadSource"("sourceType");
CREATE INDEX "LeadSource_sourceQuery_idx" ON "LeadSource"("sourceQuery");
CREATE INDEX "InstagramProfile_leadId_idx" ON "InstagramProfile"("leadId");
CREATE INDEX "InstagramProfile_username_idx" ON "InstagramProfile"("username");
CREATE INDEX "InstagramProfile_profileUrl_idx" ON "InstagramProfile"("profileUrl");
CREATE INDEX "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");
CREATE INDEX "LeadActivity_activityType_idx" ON "LeadActivity"("activityType");
CREATE INDEX "LeadActivity_createdAt_idx" ON "LeadActivity"("createdAt");

ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramProfile" ADD CONSTRAINT "InstagramProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "LeadSource" ("id", "leadId", "sourceType", "sourceName", "sourceUrl", "sourceQuery", "rawPayload", "confidenceScore", "createdAt")
SELECT
  'src_' || "id",
  "id",
  "sourceType",
  CASE
    WHEN "sourceType" = 'GOOGLE_PLACES' THEN 'Google Places'
    WHEN "sourceType" = 'INSTAGRAM' THEN 'Instagram'
    WHEN "sourceType" = 'APIFY' THEN 'Apify'
    ELSE 'Legacy Lead Source'
  END,
  COALESCE("instagram", "googleMapsUrl", "website"),
  "sourceQuery",
  "rawPayload",
  LEAST(GREATEST("leadScore", 0), 100),
  "createdAt"
FROM "Lead"
WHERE "sourceType" IS NOT NULL;

INSERT INTO "InstagramProfile" ("id", "leadId", "username", "profileName", "profileUrl", "bio", "followerCount", "phone", "whatsapp", "email", "website", "rawPayload", "createdAt", "updatedAt")
SELECT
  'ig_' || "id",
  "id",
  NULLIF(REPLACE(COALESCE("displayName", ''), '@', ''), ''),
  COALESCE("displayName", "companyName"),
  "instagram",
  "rawPayload"->>'bio',
  CASE
    WHEN COALESCE("rawPayload"->>'followers', '') ~ '^[0-9]+$' THEN ("rawPayload"->>'followers')::INTEGER
    ELSE NULL
  END,
  "phone",
  "whatsapp",
  "email",
  "website",
  "rawPayload",
  "createdAt",
  "updatedAt"
FROM "Lead"
WHERE "instagram" IS NOT NULL OR "sourceType" IN ('INSTAGRAM', 'APIFY');
