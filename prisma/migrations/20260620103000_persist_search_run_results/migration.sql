ALTER TABLE "SearchRunHistory" ADD COLUMN "targetFilteredCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SearchRunHistory" ADD COLUMN "bestLeads" JSONB;
ALTER TABLE "SearchRunHistory" ADD COLUMN "searchedResults" JSONB;
ALTER TABLE "SearchRunHistory" ADD COLUMN "aiReport" JSONB;
ALTER TABLE "SearchRunHistory" ADD COLUMN "usage" JSONB;
