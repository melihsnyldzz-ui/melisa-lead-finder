-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "aiAnalysis" JSONB,
ADD COLUMN     "aiAnalyzedAt" TIMESTAMP(3);
