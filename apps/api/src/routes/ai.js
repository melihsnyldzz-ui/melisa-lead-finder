import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getCompanyProfile } from '../services/companyProfileService.js';
import {
  buildFallbackInstagramSearchPlan,
  buildFallbackProcessStrategy,
  buildFallbackSearchPlan,
  createInstagramSearchPlanWithGemini,
  createProcessStrategyWithGemini,
  createSearchPlanWithGemini,
  getFriendlyGeminiError,
  testGeminiConnection,
} from '../services/geminiLeadAnalyzer.js';

const router = Router();

const profileSchema = z.object({
  companyName: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(1200).optional(),
  productCategories: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  targetCustomerTypes: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  excludedCustomerTypes: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  targetCountries: z.array(z.string().trim().min(1).max(120)).max(60).optional(),
  valueProposition: z.string().trim().min(1).max(1200).optional(),
  salesTone: z.string().trim().min(1).max(800).optional(),
  minimumOrderNote: z.string().trim().max(500).optional().nullable(),
  outreachLanguage: z.string().trim().min(2).max(12).optional(),
});

const searchPlanSchema = z.object({
  countryPreset: z.object({
    code: z.string().trim().min(1).max(20).optional(),
    name: z.string().trim().min(1).max(120),
    cities: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    queries: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  }).passthrough(),
  marketProfile: z.record(z.any()).optional().nullable(),
});

function scoreRunGroup(item) {
  const createdRate = item.foundCount > 0 ? item.createdCount / item.foundCount : 0;
  const duplicateRate = item.foundCount > 0 ? item.duplicateCount / item.foundCount : 0;
  const scoreSignal = item.averageScoreCount > 0 ? item.averageScoreSum / item.averageScoreCount : 0;
  return Math.round((createdRate * 70) + (scoreSignal * 0.25) - (duplicateRate * 20));
}

function summarizeRunPerformance(coverage) {
  const cityMap = new Map();
  const keywordMap = new Map();

  for (const run of coverage) {
    const cityKey = run.city || 'No city';
    const keywordKey = run.sourceKeyword || run.query;
    for (const [key, map] of [[cityKey, cityMap], [keywordKey, keywordMap]]) {
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          totalRuns: 0,
          completedRuns: 0,
          foundCount: 0,
          createdCount: 0,
          duplicateCount: 0,
          errorCount: 0,
          averageScoreSum: 0,
          averageScoreCount: 0,
          lastRunAt: run.ranAt,
        });
      }
      const item = map.get(key);
      item.totalRuns += 1;
      if (run.status === 'COMPLETED') item.completedRuns += 1;
      item.foundCount += run.foundCount;
      item.createdCount += run.createdCount;
      item.duplicateCount += run.duplicateCount;
      item.errorCount += run.errorCount;
      if (Number.isFinite(run.averageScore)) {
        item.averageScoreSum += run.averageScore;
        item.averageScoreCount += 1;
      }
      if (run.ranAt > item.lastRunAt) item.lastRunAt = run.ranAt;
    }
  }

  const compact = (item) => ({
    name: item.name,
    totalRuns: item.totalRuns,
    completedRuns: item.completedRuns,
    foundCount: item.foundCount,
    createdCount: item.createdCount,
    duplicateCount: item.duplicateCount,
    errorCount: item.errorCount,
    averageScore: item.averageScoreCount ? Math.round(item.averageScoreSum / item.averageScoreCount) : null,
    createdRate: item.foundCount ? Number((item.createdCount / item.foundCount).toFixed(2)) : 0,
    performanceScore: scoreRunGroup(item),
    lastRunAt: item.lastRunAt,
  });

  const cities = [...cityMap.values()].map(compact).sort((a, b) => b.performanceScore - a.performanceScore);
  const keywords = [...keywordMap.values()].map(compact).sort((a, b) => b.performanceScore - a.performanceScore);

  return {
    bestCities: cities.slice(0, 5),
    weakCities: cities.filter((item) => item.totalRuns > 0 && item.createdRate === 0).slice(-5),
    bestKeywords: keywords.slice(0, 8),
    weakKeywords: keywords.filter((item) => item.totalRuns > 0 && item.createdRate === 0).slice(-8),
  };
}

async function summarizeLeadFeedback(country) {
  const feedbackLeads = await prisma.lead.findMany({
    where: {
      ...(country ? { country: { equals: country, mode: 'insensitive' } } : {}),
      userFeedback: { in: ['LIKED', 'DISLIKED'] },
    },
    orderBy: { userFeedbackAt: 'desc' },
    take: 200,
    select: {
      companyName: true,
      city: true,
      sourceKeyword: true,
      sourceQuery: true,
      leadScore: true,
      userFeedback: true,
      userFeedbackAt: true,
    },
  });

  const grouped = feedbackLeads.reduce((acc, lead) => {
    const key = `${lead.city || 'No city'}|${lead.sourceKeyword || lead.sourceQuery || 'No keyword'}`;
    if (!acc.has(key)) {
      acc.set(key, {
        city: lead.city,
        keyword: lead.sourceKeyword || lead.sourceQuery,
        liked: 0,
        disliked: 0,
        averageScoreSum: 0,
        averageScoreCount: 0,
        examples: [],
      });
    }
    const item = acc.get(key);
    if (lead.userFeedback === 'LIKED') item.liked += 1;
    if (lead.userFeedback === 'DISLIKED') item.disliked += 1;
    if (Number.isFinite(lead.leadScore)) {
      item.averageScoreSum += lead.leadScore;
      item.averageScoreCount += 1;
    }
    if (item.examples.length < 3) item.examples.push(lead.companyName);
    return acc;
  }, new Map());

  const patterns = [...grouped.values()].map((item) => ({
    city: item.city,
    keyword: item.keyword,
    liked: item.liked,
    disliked: item.disliked,
    preferenceScore: item.liked - item.disliked,
    averageScore: item.averageScoreCount ? Math.round(item.averageScoreSum / item.averageScoreCount) : null,
    examples: item.examples,
  })).sort((a, b) => b.preferenceScore - a.preferenceScore);

  return {
    totalFeedback: feedbackLeads.length,
    likedPatterns: patterns.filter((item) => item.preferenceScore > 0).slice(0, 8),
    dislikedPatterns: patterns.filter((item) => item.preferenceScore < 0).reverse().slice(0, 8),
  };
}

router.get('/company-profile', async (_req, res, next) => {
  try {
    res.json(await getCompanyProfile(prisma));
  } catch (err) {
    next(err);
  }
});

router.patch('/company-profile', async (req, res, next) => {
  try {
    await getCompanyProfile(prisma);
    const input = profileSchema.parse(req.body);
    const profile = await prisma.companyProfile.update({
      where: { id: 'default' },
      data: input,
    });
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

router.post('/gemini/test', async (_req, res) => {
  try {
    const result = await testGeminiConnection();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 502).json({
      ok: false,
      error: getFriendlyGeminiError(err),
    });
  }
});

function compactRunForStrategy(run) {
  return {
    country: run.country,
    city: run.city,
    sourceType: run.sourceType,
    query: run.query,
    sourceKeyword: run.sourceKeyword,
    status: run.status,
    foundCount: run.foundCount,
    createdCount: run.createdCount,
    duplicateCount: run.duplicateCount,
    errorCount: run.errorCount,
    averageScore: run.averageScore,
    ranAt: run.ranAt,
  };
}

router.post('/process-strategy', async (_req, res, next) => {
  try {
    const companyProfile = await getCompanyProfile(prisma);
    const [
      totalLeads,
      hotLeads,
      reviewLeads,
      likedLeads,
      dislikedLeads,
      googleCoverage,
      instagramCoverage,
      recentRuns,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: 'HOT' } }),
      prisma.lead.count({ where: { status: 'REVIEW' } }),
      prisma.lead.count({ where: { userFeedback: 'LIKED' } }),
      prisma.lead.count({ where: { userFeedback: 'DISLIKED' } }),
      prisma.searchRunHistory.findMany({
        where: { sourceType: 'GOOGLE_PLACES' },
        orderBy: { ranAt: 'desc' },
        take: 120,
      }),
      prisma.searchRunHistory.findMany({
        where: { sourceType: 'INSTAGRAM' },
        orderBy: { ranAt: 'desc' },
        take: 120,
      }),
      prisma.searchRunHistory.findMany({
        orderBy: { ranAt: 'desc' },
        take: 20,
      }),
    ]);

    const payload = {
      companyProfile,
      stats: {
        total: totalLeads,
        hot: hotLeads,
        review: reviewLeads,
        liked: likedLeads,
        disliked: dislikedLeads,
      },
      googleCoverage: summarizeRunPerformance(googleCoverage),
      instagramCoverage: summarizeRunPerformance(instagramCoverage),
      feedback: await summarizeLeadFeedback(),
      recentRuns: recentRuns.map(compactRunForStrategy),
    };

    try {
      const strategy = await createProcessStrategyWithGemini(payload);
      res.json(strategy);
    } catch (strategyError) {
      res.json({
        ...buildFallbackProcessStrategy(payload),
        aiError: getFriendlyGeminiError(strategyError),
      });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/search-plan', async (req, res, next) => {
  try {
    const input = searchPlanSchema.parse(req.body);
    const companyProfile = await getCompanyProfile(prisma);
    const coverage = await prisma.searchRunHistory.findMany({
      where: {
        country: { equals: input.countryPreset.name, mode: 'insensitive' },
        sourceType: 'GOOGLE_PLACES',
      },
      orderBy: { ranAt: 'desc' },
      take: 100,
    });
    const coverageByCity = coverage.reduce((acc, run) => {
      const city = run.city || 'No city';
      if (!acc.has(city)) {
        acc.set(city, {
          city: run.city,
          totalRuns: 0,
          completedRuns: 0,
          foundCount: 0,
          createdCount: 0,
          duplicateCount: 0,
          lastRunAt: run.ranAt,
        });
      }
      const item = acc.get(city);
      item.totalRuns += 1;
      if (run.status === 'COMPLETED') item.completedRuns += 1;
      item.foundCount += run.foundCount;
      item.createdCount += run.createdCount;
      item.duplicateCount += run.duplicateCount;
      return acc;
    }, new Map());
    const compactCoverage = {
      country: input.countryPreset.name,
      totalRuns: coverage.length,
      cities: [...coverageByCity.values()],
      performance: summarizeRunPerformance(coverage),
      userFeedback: await summarizeLeadFeedback(input.countryPreset.name),
    };

    try {
      const plan = await createSearchPlanWithGemini({
        countryPreset: input.countryPreset,
        marketProfile: input.marketProfile,
        coverage: compactCoverage,
        companyProfile,
      });
      res.json(plan);
    } catch (planError) {
      const fallbackPlan = buildFallbackSearchPlan({
        countryPreset: input.countryPreset,
        marketProfile: input.marketProfile,
        coverage: compactCoverage,
      });
      res.json({
        ...fallbackPlan,
        aiError: getFriendlyGeminiError(planError),
      });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/instagram-search-plan', async (req, res, next) => {
  try {
    const input = searchPlanSchema.parse(req.body);
    const companyProfile = await getCompanyProfile(prisma);
    const coverage = await prisma.searchRunHistory.findMany({
      where: {
        country: { equals: input.countryPreset.name, mode: 'insensitive' },
        sourceType: 'INSTAGRAM',
      },
      orderBy: { ranAt: 'desc' },
      take: 100,
    });
    const coverageByCity = coverage.reduce((acc, run) => {
      const city = run.city || 'No city';
      if (!acc.has(city)) {
        acc.set(city, {
          city: run.city,
          totalRuns: 0,
          completedRuns: 0,
          foundCount: 0,
          createdCount: 0,
          duplicateCount: 0,
          lastRunAt: run.ranAt,
        });
      }
      const item = acc.get(city);
      item.totalRuns += 1;
      if (run.status === 'COMPLETED') item.completedRuns += 1;
      item.foundCount += run.foundCount;
      item.createdCount += run.createdCount;
      item.duplicateCount += run.duplicateCount;
      return acc;
    }, new Map());
    const compactCoverage = {
      country: input.countryPreset.name,
      totalRuns: coverage.length,
      cities: [...coverageByCity.values()],
      performance: summarizeRunPerformance(coverage),
      userFeedback: await summarizeLeadFeedback(input.countryPreset.name),
    };

    try {
      const plan = await createInstagramSearchPlanWithGemini({
        countryPreset: input.countryPreset,
        marketProfile: input.marketProfile,
        coverage: compactCoverage,
        companyProfile,
      });
      res.json(plan);
    } catch (planError) {
      const fallbackPlan = buildFallbackInstagramSearchPlan({
        countryPreset: input.countryPreset,
        marketProfile: input.marketProfile,
        coverage: compactCoverage,
      });
      res.json({
        ...fallbackPlan,
        aiError: getFriendlyGeminiError(planError),
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
