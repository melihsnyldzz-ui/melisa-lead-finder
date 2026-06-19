import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../httpErrors.js';
import { getSearchProvider, listProviderStatuses } from '../providers/index.js';
import { createLeadIfNew } from '../services/leadDeduplication.js';
import { getCompanyProfile } from '../services/companyProfileService.js';
import { analyzeSearchRunWithGemini } from '../services/geminiLeadAnalyzer.js';
import { isBabyKidsClothingLead } from '../services/leadScoring.js';

const router = Router();

const sourceTypeSchema = z.enum(['DEMO', 'GOOGLE_PLACES', 'APIFY', 'INSTAGRAM_APIFY', 'WEBSITE', 'WEBSITE_SCAN', 'CSV_IMPORT', 'INSTAGRAM', 'MANUAL']);

const createSearchTaskSchema = z.object({
  name: z.string().trim().min(1),
  country: z.string().trim().min(1),
  city: z.string().trim().optional().nullable(),
  language: z.string().trim().optional().nullable(),
  keywordGroup: z.string().trim().optional().nullable(),
  sourceKeyword: z.string().trim().optional().nullable(),
  query: z.string().trim().min(1),
  sourceType: sourceTypeSchema.optional(),
  maxResults: z.number().int().min(1).max(50).optional(),
  allowDuplicate: z.boolean().optional(),
});

const searchHistoryQuerySchema = z.object({
  country: z.string().trim().min(1),
  city: z.string().trim().optional(),
  query: z.string().trim().min(1),
  sourceType: sourceTypeSchema.optional(),
});

const listHistoryQuerySchema = z.object({
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  sourceType: sourceTypeSchema.optional(),
  status: z.enum(['DRAFT', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

const coverageQuerySchema = z.object({
  country: z.string().trim().optional(),
  sourceType: sourceTypeSchema.optional(),
});

const keywordGroups = {
  'baby/kids retail': [
    'baby clothing store',
    'kids clothing store',
    "children's clothing store",
    'baby clothes store',
    'kids clothes store',
    "children's wear store",
    'kids fashion store',
    'baby kids clothing store',
    'baby clothing boutique',
    "children's clothing boutique",
  ],
};

const normalizedLocalKeywordsByCountry = {
  Romania: ['haine copii', 'magazin haine copii', 'magazin haine bebe'],
  Bulgaria: ['детски дрехи магазин', 'бебешки дрехи магазин'],
  Germany: ['Kinderbekleidung', 'Babygeschäft', 'Kindermode'],
  Ukraine: ['дитячий одяг магазин', 'одяг для немовлят магазин'],
  Russia: ['магазин детской одежды', 'магазин одежды для малышей'],
  Moldova: ['magazin haine copii', 'haine pentru bebelusi'],
  Poland: ['sklep z odzieżą dziecięcą', 'ubranka dla niemowląt sklep'],
  Belarus: ['магазин детской одежды', 'адзенне для дзяцей крама'],
  Georgia: ['ბავშვის ტანსაცმლის მაღაზია', 'საბავშვო ტანსაცმელი'],
  Armenia: ['մանկական հագուստի խանութ', 'երեխաների հագուստ'],
  Azerbaijan: ['uşaq geyim mağazası', 'körpə geyim mağazası'],
  Kazakhstan: ['магазин детской одежды', 'балалар киімі дүкені'],
  Uzbekistan: ['bolalar kiyim doʻkoni', 'chaqaloq kiyim doʻkoni'],
  Kyrgyzstan: ['магазин детской одежды', 'балдар кийим дүкөнү'],
  Tajikistan: ['магазин детской одежды', 'либоси кӯдакона мағоза'],
  Turkmenistan: ['çaga eşikleri dükany', 'магазин детской одежды'],
  'Dagestan (Russia)': ['магазин детской одежды', 'детская одежда Махачкала'],
  'Chechnya (Russia)': ['магазин детской одежды', 'детская одежда Грозный'],
  'Ingushetia (Russia)': ['магазин детской одежды', 'детская одежда Назрань'],
  'North Ossetia (Russia)': ['магазин детской одежды', 'детская одежда Владикавказ'],
  'Tatarstan (Russia)': ['магазин детской одежды', 'балалар киеме кибете'],
  'Bashkortostan (Russia)': ['магазин детской одежды', 'детская одежда Уфа'],
};

const localKeywordsByCountry = {
  Romania: ['haine copii', 'magazin haine copii', 'magazin haine bebe'],
  Bulgaria: ['детски дрехи магазин', 'бебешки дрехи магазин'],
  Germany: ['Kinderbekleidung', 'Babygeschäft', 'Kindermode'],
  Ukraine: ['дитячий одяг магазин', 'одяг для немовлят магазин'],
  Russia: ['магазин детской одежды', 'магазин одежды для малышей'],
  Moldova: ['magazin haine copii', 'haine pentru bebelusi'],
  Poland: ['sklep z odzieżą dziecięcą', 'ubranka dla niemowląt sklep'],
  Belarus: ['магазин детской одежды', 'адзенне для дзяцей крама'],
  Georgia: ['ბავშვის ტანსაცმლის მაღაზია', 'საბავშვო ტანსაცმელი'],
  Armenia: ['մանկական հագուստի խանութ', 'երեխաների հագուստ'],
  Azerbaijan: ['uşaq geyim mağazası', 'körpə geyim mağazası'],
  Kazakhstan: ['магазин детской одежды', 'балалар киімі дүкені'],
  Uzbekistan: ['bolalar kiyim doʻkoni', 'chaqaloq kiyim doʻkoni'],
  Kyrgyzstan: ['магазин детской одежды', 'балдар кийим дүкөнү'],
  Tajikistan: ['магазин детской одежды', 'либоси кӯдакона мағоза'],
  Turkmenistan: ['çaga eşikleri dükany', 'магазин детской одежды'],
  'Dagestan (Russia)': ['магазин детской одежды', 'детская одежда Махачкала'],
  'Chechnya (Russia)': ['магазин детской одежды', 'детская одежда Грозный'],
  'Ingushetia (Russia)': ['магазин детской одежды', 'детская одежда Назрань'],
  'North Ossetia (Russia)': ['магазин детской одежды', 'детская одежда Владикавказ'],
  'Tatarstan (Russia)': ['магазин детской одежды', 'балалар киеме кибете'],
  'Bashkortostan (Russia)': ['магазин детской одежды', 'детская одежда Уфа'],
};

function buildGoogleQueries(task) {
  const city = task.city?.trim();
  const keywords = [
    ...(keywordGroups[task.keywordGroup] || [task.sourceKeyword || task.query]),
    ...(normalizedLocalKeywordsByCountry[task.country] || []),
  ];
  const uniqueKeywords = [...new Set(keywords.filter(Boolean))];
  const variants = [];

  for (const keyword of uniqueKeywords) {
    variants.push({
      query: city ? `${keyword} ${city}` : keyword,
      sourceKeyword: keyword,
    });
    if (city) {
      variants.push({
        query: `${keyword} near ${city} center`,
        sourceKeyword: keyword,
      });
    }
  }

  return variants.length ? variants : [{ query: task.query, sourceKeyword: task.sourceKeyword || task.query }];
}

function normalizeProviderResult(result) {
  if (Array.isArray(result)) {
    return {
      leads: result,
      foundCount: result.length,
      skippedDetailsCount: 0,
      detailErrorCount: 0,
      filteredOutCount: 0,
      searchedResults: result.map((lead) => compactRunLead(lead, 'candidate')),
    };
  }
  return {
    leads: result.leads || [],
    foundCount: result.foundCount ?? result.leads?.length ?? 0,
    skippedDetailsCount: result.skippedDetailsCount || 0,
    detailErrorCount: result.detailErrorCount || 0,
    filteredOutCount: result.filteredOutCount || 0,
    searchedResults: result.searchedResults || [],
    textSearchCount: result.textSearchCount || 0,
    detailRequestCount: result.detailRequestCount || 0,
  };
}

function compactRunLead(lead, status, reason = null) {
  return {
    id: lead.id || null,
    googlePlaceId: lead.googlePlaceId || null,
    companyName: lead.companyName,
    country: lead.country,
    city: lead.city,
    phone: lead.internationalPhoneNumber || lead.phone || null,
    website: lead.website || null,
    instagram: lead.instagram || null,
    googleMapsUrl: lead.googleMapsUrl || null,
    rating: lead.rating || null,
    userRatingsTotal: lead.userRatingsTotal || 0,
    leadScore: lead.leadScore || null,
    businessStatus: lead.businessStatus || null,
    sourceQuery: lead.sourceQuery || null,
    sourceKeyword: lead.sourceKeyword || null,
    status,
    reason,
  };
}

function dedupeRunResults(results) {
  const priority = {
    inserted: 5,
    duplicate: 4,
    filtered_out: 3,
    duplicate_skipped: 2,
    candidate: 1,
    found: 0,
  };
  const byKey = new Map();
  for (const result of results) {
    const key = result.googlePlaceId || `${result.companyName || ''}|${result.city || ''}|${result.sourceQuery || ''}`;
    const current = byKey.get(key);
    if (!current || (priority[result.status] || 0) >= (priority[current.status] || 0)) {
      byKey.set(key, result);
    }
  }
  return [...byKey.values()];
}

function getGoogleSafetyConfig() {
  return {
    maxRunResults: Math.min(Math.max(Number(process.env.GOOGLE_PLACES_MAX_RUN_RESULTS || 50), 1), 50),
    detailDelayMs: Math.max(0, Number(process.env.GOOGLE_PLACES_DETAIL_DELAY_MS || 100)),
    monthlyTextSearchLimit: Math.max(1, Number(process.env.GOOGLE_PLACES_MONTHLY_TEXT_SEARCH_LIMIT || 1000)),
    monthlyPlaceDetailsLimit: Math.max(1, Number(process.env.GOOGLE_PLACES_MONTHLY_PLACE_DETAILS_LIMIT || 5000)),
  };
}

function getMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function getGoogleMonthlyUsage() {
  const monthStart = getMonthStart();
  const [monthRuns, completedRuns, failedRuns, aggregate] = await Promise.all([
    prisma.searchRunHistory.count({
      where: { sourceType: 'GOOGLE_PLACES', ranAt: { gte: monthStart } },
    }),
    prisma.searchRunHistory.count({
      where: { sourceType: 'GOOGLE_PLACES', status: 'COMPLETED', ranAt: { gte: monthStart } },
    }),
    prisma.searchRunHistory.count({
      where: { sourceType: 'GOOGLE_PLACES', status: 'FAILED', ranAt: { gte: monthStart } },
    }),
    prisma.searchRunHistory.aggregate({
      where: { sourceType: 'GOOGLE_PLACES', ranAt: { gte: monthStart } },
      _sum: {
        foundCount: true,
        createdCount: true,
        duplicateCount: true,
        errorCount: true,
      },
    }),
  ]);

  const createdCount = aggregate._sum.createdCount || 0;
  const duplicateCount = aggregate._sum.duplicateCount || 0;

  return {
    monthStart,
    monthRuns,
    completedRuns,
    failedRuns,
    foundCount: aggregate._sum.foundCount || 0,
    createdCount,
    duplicateCount,
    errorCount: aggregate._sum.errorCount || 0,
    estimatedTextSearchRequests: monthRuns,
    estimatedPlaceDetailsRequests: createdCount + duplicateCount,
  };
}

async function assertGoogleRunWithinLimits({ projectedTextSearchRequests, projectedPlaceDetailsRequests }) {
  const config = getGoogleSafetyConfig();
  const usage = await getGoogleMonthlyUsage();
  const nextTextSearchTotal = usage.estimatedTextSearchRequests + projectedTextSearchRequests;
  const nextPlaceDetailsTotal = usage.estimatedPlaceDetailsRequests + projectedPlaceDetailsRequests;

  if (
    nextTextSearchTotal > config.monthlyTextSearchLimit ||
    nextPlaceDetailsTotal > config.monthlyPlaceDetailsLimit
  ) {
    const err = new Error('Google Places monthly safety limit would be exceeded');
    err.status = 429;
    err.details = {
      projectedTextSearchRequests,
      projectedPlaceDetailsRequests,
      monthlyTextSearchLimit: config.monthlyTextSearchLimit,
      monthlyPlaceDetailsLimit: config.monthlyPlaceDetailsLimit,
      currentTextSearchRequests: usage.estimatedTextSearchRequests,
      currentPlaceDetailsRequests: usage.estimatedPlaceDetailsRequests,
    };
    throw err;
  }
}

function buildTaskIdentityWhere(input) {
  const sourceType = input.sourceType || 'DEMO';
  return {
    country: { equals: input.country, mode: 'insensitive' },
    query: { equals: input.query, mode: 'insensitive' },
    sourceType,
    ...(input.city
      ? { city: { equals: input.city, mode: 'insensitive' } }
      : { city: null }),
  };
}

function normalizeSearchTaskInput(input) {
  return {
    ...input,
    city: input.city?.trim() || null,
    language: input.language?.trim() || null,
    keywordGroup: input.keywordGroup?.trim() || null,
    sourceKeyword: input.sourceKeyword?.trim() || null,
    sourceType: input.sourceType || 'DEMO',
  };
}

router.get('/', async (_req, res, next) => {
  try {
    const tasks = await prisma.searchTask.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

router.get('/history/check', async (req, res, next) => {
  try {
    const input = searchHistoryQuerySchema.parse(req.query);
    const sourceType = input.sourceType || 'DEMO';
    const where = buildTaskIdentityWhere({ ...input, sourceType });

    const [historyCompletedCount, completedTaskCount, existingTaskCount, lastRun, lastTask, existingTask] = await Promise.all([
      prisma.searchRunHistory.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.searchTask.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.searchTask.count({ where }),
      prisma.searchRunHistory.findFirst({ where, orderBy: { ranAt: 'desc' } }),
      prisma.searchTask.findFirst({ where, orderBy: { updatedAt: 'desc' } }),
      prisma.searchTask.findFirst({ where, orderBy: { updatedAt: 'desc' } }),
    ]);
    const completedCount = historyCompletedCount + completedTaskCount;

    res.json({
      alreadyCompleted: completedCount > 0,
      completedCount,
      hasExistingTask: existingTaskCount > 0,
      existingTask,
      lastRun: lastRun || lastTask,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const query = listHistoryQuerySchema.parse(req.query);
    const history = await prisma.searchRunHistory.findMany({
      where: {
        ...(query.country ? { country: { equals: query.country, mode: 'insensitive' } } : {}),
        ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
        ...(query.sourceType ? { sourceType: query.sourceType } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { ranAt: 'desc' },
      take: query.take || 25,
    });
    res.json(history);
  } catch (err) {
    next(err);
  }
});

router.get('/coverage', async (req, res, next) => {
  try {
    const query = coverageQuerySchema.parse(req.query);
    const runs = await prisma.searchRunHistory.findMany({
      where: {
        ...(query.country ? { country: { equals: query.country, mode: 'insensitive' } } : {}),
        ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      },
      orderBy: { ranAt: 'desc' },
      take: 1000,
    });

    const countries = new Map();
    for (const run of runs) {
      const countryKey = run.country;
      if (!countries.has(countryKey)) {
        countries.set(countryKey, {
          country: run.country,
          totalRuns: 0,
          completedRuns: 0,
          failedRuns: 0,
          foundCount: 0,
          createdCount: 0,
          duplicateCount: 0,
          lastRunAt: null,
          cities: new Map(),
        });
      }

      const country = countries.get(countryKey);
      country.totalRuns += 1;
      if (run.status === 'COMPLETED') country.completedRuns += 1;
      if (run.status === 'FAILED') country.failedRuns += 1;
      country.foundCount += run.foundCount;
      country.createdCount += run.createdCount;
      country.duplicateCount += run.duplicateCount;
      country.lastRunAt = country.lastRunAt || run.ranAt;

      const cityKey = run.city || 'No city';
      if (!country.cities.has(cityKey)) {
        country.cities.set(cityKey, {
          city: run.city,
          totalRuns: 0,
          completedRuns: 0,
          foundCount: 0,
          createdCount: 0,
          duplicateCount: 0,
          lastRunAt: null,
          queries: [],
        });
      }

      const city = country.cities.get(cityKey);
      city.totalRuns += 1;
      if (run.status === 'COMPLETED') city.completedRuns += 1;
      city.foundCount += run.foundCount;
      city.createdCount += run.createdCount;
      city.duplicateCount += run.duplicateCount;
      city.lastRunAt = city.lastRunAt || run.ranAt;
      if (!city.queries.includes(run.query)) city.queries.push(run.query);
    }

    res.json([...countries.values()].map((country) => ({
      ...country,
      cities: [...country.cities.values()],
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/safety', async (_req, res, next) => {
  try {
    const config = getGoogleSafetyConfig();
    const usage = await getGoogleMonthlyUsage();
    const remainingTextSearchRequests = Math.max(
      0,
      config.monthlyTextSearchLimit - usage.estimatedTextSearchRequests,
    );
    const remainingPlaceDetailsRequests = Math.max(
      0,
      config.monthlyPlaceDetailsLimit - usage.estimatedPlaceDetailsRequests,
    );
    const textSearchLimitUsedPercent = Math.round(
      (usage.estimatedTextSearchRequests / config.monthlyTextSearchLimit) * 100,
    );
    const placeDetailsLimitUsedPercent = Math.round(
      (usage.estimatedPlaceDetailsRequests / config.monthlyPlaceDetailsLimit) * 100,
    );

    res.json({
      configured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
      ...config,
      ...usage,
      remainingTextSearchRequests,
      remainingPlaceDetailsRequests,
      textSearchLimitUsedPercent,
      placeDetailsLimitUsedPercent,
      limitWarning: textSearchLimitUsedPercent >= 80 || placeDetailsLimitUsedPercent >= 80,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = normalizeSearchTaskInput(createSearchTaskSchema.parse(req.body));
    const providerStatus = listProviderStatuses()[input.sourceType];
    if (!providerStatus?.implemented) {
      return res.status(400).json({ error: `Provider is not implemented: ${input.sourceType}` });
    }
    const { allowDuplicate, ...taskInput } = input;
    const existingTask = await prisma.searchTask.findFirst({
      where: buildTaskIdentityWhere(taskInput),
      orderBy: { updatedAt: 'desc' },
    });
    if (existingTask && !allowDuplicate) {
      return res.status(409).json({
        error: 'Search task already exists for this country, city, query, and source',
        existingTask,
      });
    }
    const task = await prisma.searchTask.create({ data: taskInput });
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/run', async (req, res, next) => {
  let taskId = req.params.id;
  let failedTask = null;

  try {
    const existing = await prisma.searchTask.findUnique({ where: { id: taskId } });
    if (!existing) throw notFound('Search task not found');

    const task = await prisma.searchTask.update({ where: { id: taskId }, data: { status: 'RUNNING', error: null } });
    const provider = getSearchProvider(task.sourceType);
    const queryRuns = task.sourceType === 'GOOGLE_PLACES' && task.keywordGroup
      ? buildGoogleQueries(task)
      : [{ query: task.query, sourceKeyword: task.sourceKeyword || task.query }];

    const seenPlaceIds = new Set();
    let foundCount = 0;
    let createdCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    let textSearchCount = 0;
    let detailRequestCount = 0;
    let targetFilteredCount = 0;
    const createdLeads = [];
    const acceptedLeads = [];
    const searchedResults = [];
    const maxResults = Number(task.maxResults) || 20;

    if (task.sourceType === 'GOOGLE_PLACES') {
      await assertGoogleRunWithinLimits({
        projectedTextSearchRequests: queryRuns.length,
        projectedPlaceDetailsRequests: maxResults,
      });
    }

    for (const queryRun of queryRuns) {
      if (foundCount >= maxResults) break;

      const remaining = maxResults - foundCount;
      const providerTask = {
        ...task,
        query: queryRun.query,
        sourceKeyword: queryRun.sourceKeyword,
        maxResults: Math.min(remaining, 20),
      };

      const result = normalizeProviderResult(await provider(providerTask, {
        shouldSkipPlaceDetails: async (placeId) => {
          if (!placeId) return false;
          if (seenPlaceIds.has(placeId)) return true;
          const exists = await prisma.lead.findFirst({ where: { googlePlaceId: placeId }, select: { id: true } });
          if (exists) return true;
          seenPlaceIds.add(placeId);
          return false;
        },
      }));

      foundCount += result.foundCount;
      duplicateCount += result.skippedDetailsCount;
      errorCount += result.detailErrorCount;
      targetFilteredCount += result.filteredOutCount;
      textSearchCount += result.textSearchCount;
      detailRequestCount += result.detailRequestCount;
      searchedResults.push(...result.searchedResults);

      for (const leadInput of result.leads) {
        if (['GOOGLE_PLACES', 'INSTAGRAM', 'INSTAGRAM_APIFY', 'APIFY'].includes(task.sourceType) && !isBabyKidsClothingLead(leadInput)) {
          targetFilteredCount += 1;
          searchedResults.push(compactRunLead(leadInput, 'filtered_out', 'Hedef bebek/cocuk giyim disi gorundu'));
          continue;
        }
        const leadResult = await createLeadIfNew(prisma, leadInput);
        if (leadResult.created) {
          createdCount += 1;
          createdLeads.push(leadResult.lead);
          acceptedLeads.push(leadResult.lead);
          searchedResults.push(compactRunLead(leadResult.lead, 'inserted', 'Yeni lead olarak eklendi'));
        } else {
          duplicateCount += 1;
          acceptedLeads.push(leadResult.lead);
          searchedResults.push(compactRunLead(leadResult.lead, 'duplicate', 'Mevcut lead olarak bulundu'));
        }
      }
    }

    const averageScore = acceptedLeads.length
      ? acceptedLeads.reduce((sum, lead) => sum + lead.leadScore, 0) / acceptedLeads.length
      : null;

    const updated = await prisma.searchTask.update({
      where: { id: task.id },
      data: {
        status: 'COMPLETED',
        foundCount,
        insertedCount: createdCount,
        duplicateCount,
        errorCount,
        averageScore,
      },
    });

    await prisma.searchRunHistory.create({
      data: {
        taskId: task.id,
        country: task.country,
        city: task.city,
        keywordGroup: task.keywordGroup,
        sourceKeyword: task.sourceKeyword,
        query: task.query,
        sourceType: task.sourceType,
        status: 'COMPLETED',
        foundCount,
        createdCount,
        duplicateCount,
        errorCount,
        averageScore,
      },
    });

    const bestLeads = acceptedLeads.sort((a, b) => b.leadScore - a.leadScore).slice(0, 5);
    let aiReport = null;
    try {
      const companyProfile = await getCompanyProfile(prisma);
      aiReport = await analyzeSearchRunWithGemini({
        task,
        companyProfile,
        bestLeads,
        metrics: {
          foundCount,
          createdCount,
          duplicateCount,
          errorCount,
          targetFilteredCount,
          averageScore,
          textSearchCount,
          detailRequestCount,
        },
      });
    } catch (reportError) {
      aiReport = {
        provider: 'GEMINI',
        error: reportError.message?.includes('UNAUTHENTICATED')
          ? 'Gemini API key dogrulanamadi. AI Studio icinden yeni bir Gemini API key uretip Ayarlar icin .env dosyasina eklemek gerekiyor.'
          : reportError.message,
      };
    }

    const runSearchedResults = dedupeRunResults(searchedResults).slice(0, 100);

    res.json({
      ...updated,
      createdCount,
      duplicateCount,
      errorCount,
      targetFilteredCount,
      averageScore,
      bestLeads,
      searchedResults: runSearchedResults,
      aiReport,
      usage: {
        textSearchCount,
        detailRequestCount,
      },
    });
  } catch (err) {
    if (err.status !== 404) {
      failedTask = await prisma.searchTask.update({
        where: { id: taskId },
        data: { status: 'FAILED', error: err.message, errorCount: { increment: 1 } },
      }).catch(() => null);
      if (failedTask) {
        await prisma.searchRunHistory.create({
          data: {
            taskId: failedTask.id,
            country: failedTask.country,
            city: failedTask.city,
            keywordGroup: failedTask.keywordGroup,
            sourceKeyword: failedTask.sourceKeyword,
            query: failedTask.query,
            sourceType: failedTask.sourceType,
            status: 'FAILED',
            error: err.message,
            errorCount: 1,
          },
        }).catch(() => null);
      }
    }
    next(err);
  }
});

export default router;
