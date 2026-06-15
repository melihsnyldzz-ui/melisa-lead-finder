-- CreateTable
CREATE TABLE "SearchRunHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "query" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "status" "SearchTaskStatus" NOT NULL,
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRunHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchRunHistory_country_city_query_sourceType_idx" ON "SearchRunHistory"("country", "city", "query", "sourceType");

-- CreateIndex
CREATE INDEX "SearchRunHistory_ranAt_idx" ON "SearchRunHistory"("ranAt");
