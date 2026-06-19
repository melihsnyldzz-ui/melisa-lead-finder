import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getCompanyProfile } from '../services/companyProfileService.js';
import {
  buildFallbackInstagramSearchPlan,
  createInstagramSearchPlanWithGemini,
  getFriendlyGeminiError,
} from '../services/geminiLeadAnalyzer.js';

const router = Router();

const plannerSchema = z.object({
  country: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  targetCustomerType: z.string().trim().min(1).max(160).default('baby/kids clothing buyer'),
  productCategory: z.string().trim().min(1).max(160).default('baby and kids clothing'),
  maxQueries: z.coerce.number().int().min(1).max(20).default(12),
  maxResults: z.coerce.number().int().min(1).max(200).default(60),
});

const countryLanguageLibrary = {
  Albania: {
    code: 'AL',
    languages: ['Albanian', 'English'],
    cities: ['Tirana', 'Durres', 'Vlore', 'Shkoder'],
    localKeywords: ['rroba per femije', 'rroba bebe', 'dyqan femijesh', 'butik femijesh'],
  },
  Bosnia: {
    code: 'BA',
    languages: ['Bosnian', 'Serbian', 'Croatian', 'English'],
    cities: ['Sarajevo', 'Banja Luka', 'Mostar', 'Tuzla'],
    localKeywords: ['dječija odjeća', 'odjeća za bebe', 'prodavnica dječije odjeće', 'baby shop'],
  },
  Bulgaria: {
    code: 'BG',
    languages: ['Bulgarian', 'English'],
    cities: ['Sofia', 'Plovdiv', 'Varna', 'Burgas'],
    localKeywords: ['детски дрехи', 'бебешки дрехи', 'детски магазин', 'бебешки магазин'],
  },
  Germany: {
    code: 'DE',
    languages: ['German', 'English'],
    cities: ['Berlin', 'Munich', 'Hamburg', 'Cologne', 'Frankfurt'],
    localKeywords: ['Kinderbekleidung', 'Babybekleidung', 'Kindermode', 'Babygeschäft'],
  },
  France: {
    code: 'FR',
    languages: ['French', 'English'],
    cities: ['Paris', 'Lyon', 'Marseille', 'Toulouse'],
    localKeywords: ['vêtements bébé', 'vêtements enfants', 'boutique enfant', 'mode enfant'],
  },
  Iraq: {
    code: 'IQ',
    languages: ['Arabic', 'Kurdish', 'English'],
    cities: ['Baghdad', 'Erbil', 'Basra', 'Mosul'],
    localKeywords: ['ملابس اطفال', 'ملابس بيبي', 'متجر اطفال', 'baby clothes Iraq'],
  },
  Libya: {
    code: 'LY',
    languages: ['Arabic', 'English'],
    cities: ['Tripoli', 'Benghazi', 'Misrata'],
    localKeywords: ['ملابس اطفال', 'ملابس مواليد', 'متجر اطفال', 'baby clothes Libya'],
  },
  Moldova: {
    code: 'MD',
    languages: ['Romanian', 'Russian', 'English'],
    cities: ['Chisinau', 'Balti', 'Tiraspol', 'Bender'],
    localKeywords: ['haine copii', 'haine bebe', 'magazin haine copii', 'magazin bebe'],
  },
  Poland: {
    code: 'PL',
    languages: ['Polish', 'English'],
    cities: ['Warsaw', 'Krakow', 'Wroclaw', 'Gdansk', 'Poznan'],
    localKeywords: ['odzież dziecięca', 'ubranka dla niemowląt', 'sklep dziecięcy', 'butik dziecięcy'],
  },
  Romania: {
    code: 'RO',
    languages: ['Romanian', 'English'],
    cities: ['Bucharest', 'Cluj-Napoca', 'Iasi', 'Timisoara', 'Constanta'],
    localKeywords: ['haine copii', 'haine bebe', 'magazin haine copii', 'magazin bebe', 'butic copii'],
  },
  Russia: {
    code: 'RU',
    languages: ['Russian', 'English'],
    cities: ['Moscow', 'Saint Petersburg', 'Kazan', 'Yekaterinburg', 'Novosibirsk'],
    localKeywords: ['детская одежда', 'одежда для малышей', 'магазин детской одежды', 'детский бутик'],
  },
  Serbia: {
    code: 'RS',
    languages: ['Serbian', 'English'],
    cities: ['Belgrade', 'Novi Sad', 'Nis', 'Kragujevac'],
    localKeywords: ['dečija odeća', 'bebi odeća', 'prodavnica dečije odeće', 'dečiji butik'],
  },
  Turkey: {
    code: 'TR',
    languages: ['Turkish', 'English'],
    cities: ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya'],
    localKeywords: ['bebek giyim', 'çocuk giyim', 'bebek butik', 'çocuk butik', 'bebek kıyafet'],
  },
  Ukraine: {
    code: 'UA',
    languages: ['Ukrainian', 'Russian', 'English'],
    cities: ['Kyiv', 'Lviv', 'Odesa', 'Dnipro', 'Kharkiv'],
    localKeywords: ['дитячий одяг', 'одяг для немовлят', 'магазин дитячого одягу', 'дитячий бутік'],
  },
};

function getCountryLanguagePack(country) {
  const direct = countryLanguageLibrary[country];
  if (direct) return direct;
  const partial = Object.entries(countryLanguageLibrary).find(([name]) => (
    country.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(country.toLowerCase())
  ));
  return partial?.[1] || {
    code: country.slice(0, 2).toUpperCase(),
    languages: ['Local language', 'English'],
    cities: [],
    localKeywords: [],
  };
}

function unique(values, max = 20) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, max);
}

function uniqueQueryItems(items, max = 12) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      query: String(item?.query || item?.keyword || item?.search || '').trim(),
      searchType: ['user', 'hashtag', 'place'].includes(item?.searchType) ? item.searchType : 'user',
      priority: ['high', 'medium', 'low'].includes(item?.priority) ? item.priority : 'medium',
      intent: item?.intent,
      expectedQuality: item?.expectedQuality,
      reason: item?.reason,
    }))
    .filter((item) => {
      if (!item.query) return false;
      const key = `${item.searchType}:${item.query.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function buildCountryPreset(input) {
  const pack = getCountryLanguagePack(input.country);
  const cities = unique([input.city, ...(pack.cities || [])], 8);
  const englishKeywords = [
    'baby clothing boutique',
    'kids clothing boutique',
    'children clothing shop',
    'babywear shop',
    'kidswear boutique',
    'baby kids clothing store',
  ];
  return {
    code: pack.code,
    name: input.country,
    cities,
    queries: unique([
      ...(pack.localKeywords || []),
      input.productCategory,
      input.targetCustomerType,
      ...englishKeywords,
    ], 24),
    languageHints: {
      languages: pack.languages,
      instagramHabits: unique([
        ...(pack.localKeywords || []),
        'WhatsApp order',
        'online shop',
        'boutique',
        'catalog',
      ], 16),
    },
  };
}

function queryIntent(query, city) {
  const text = String(query || '').toLowerCase();
  if (city && text.includes(city.toLowerCase())) return 'city_specific_profile_discovery';
  if (text.includes('whatsapp') || text.includes('order') || text.includes('sipariş')) return 'contact_ready_online_seller_discovery';
  if (text.includes('boutique') || text.includes('butik')) return 'boutique_profile_discovery';
  return 'broad_local_profile_discovery';
}

function expectedQuality(priority) {
  if (priority === 'high') return 'high';
  if (priority === 'low') return 'experimental';
  return 'medium';
}

function toRoadmapPlan({ input, plan, countryPreset, provider, aiError = null }) {
  const perQueryLimit = Math.max(1, Math.min(20, Math.ceil(input.maxResults / Math.max(input.maxQueries, 1))));
  const searchQueries = uniqueQueryItems(plan.searchQueries || [], input.maxQueries).map((item) => ({
    query: item.query,
    searchType: item.searchType || 'user',
    priority: item.priority || 'medium',
    intent: item.intent || queryIntent(item.query, input.city),
    expectedQuality: item.expectedQuality || expectedQuality(item.priority),
    reason: item.reason || 'Bebek/cocuk giyim odakli Instagram profil aramasi.',
  }));

  return {
    provider,
    model: plan.model || null,
    usedFallback: provider !== 'GEMINI',
    aiError,
    country: input.country,
    city: input.city,
    languagePack: {
      languages: countryPreset.languageHints.languages,
      localKeywords: plan.localKeywords || countryPreset.queries.slice(0, 8),
      englishKeywords: ['baby clothing boutique', 'kids clothing boutique', 'children clothing shop', 'babywear shop', 'kidswear boutique'],
    },
    summary: plan.summary,
    audienceDefinition: plan.audienceDefinition,
    targetProfiles: plan.targetProfiles,
    searchQueries,
    negativeKeywords: plan.negativeSignals || [],
    businessSignals: plan.positiveSignals || [],
    rejectionSignals: plan.negativeSignals || [],
    scoringHints: {
      highValueSignals: plan.positiveSignals || [],
      lowValueSignals: plan.negativeSignals || [],
    },
    positiveSignals: plan.positiveSignals || [],
    negativeSignals: plan.negativeSignals || [],
    hashtags: plan.hashtags || [],
    localKeywords: plan.localKeywords || [],
    cityFocus: plan.cityFocus || [input.city],
    maxQueries: input.maxQueries,
    maxResults: input.maxResults,
    maxResultsPerQuery: Math.min(plan.maxResultsPerQuery || perQueryLimit, perQueryLimit),
    confidence: plan.confidence || 0.6,
  };
}

async function buildInstagramCoverage(country) {
  const runs = await prisma.searchRunHistory.findMany({
    where: {
      country: { equals: country, mode: 'insensitive' },
      sourceType: { in: ['INSTAGRAM', 'INSTAGRAM_APIFY', 'APIFY'] },
    },
    orderBy: { ranAt: 'desc' },
    take: 80,
  });

  return {
    country,
    totalRuns: runs.length,
    cities: runs.slice(0, 20).map((run) => ({
      city: run.city,
      query: run.query,
      status: run.status,
      foundCount: run.foundCount,
      createdCount: run.createdCount,
      duplicateCount: run.duplicateCount,
      averageScore: run.averageScore,
    })),
  };
}

router.post('/search-plan/gemini', async (req, res, next) => {
  try {
    const input = plannerSchema.parse(req.body);
    const countryPreset = buildCountryPreset(input);
    const companyProfile = await getCompanyProfile(prisma);
    const coverage = await buildInstagramCoverage(input.country);
    const marketProfile = {
      targetCustomerType: input.targetCustomerType,
      productCategory: input.productCategory,
      searchPrinciple: 'local language first, broad but targeted queries, learn from feedback',
    };

    try {
      const plan = await createInstagramSearchPlanWithGemini({
        countryPreset,
        marketProfile,
        coverage,
        companyProfile,
      });
      res.json(toRoadmapPlan({ input, plan, countryPreset, provider: 'GEMINI' }));
    } catch (err) {
      const fallbackPlan = buildFallbackInstagramSearchPlan({
        countryPreset,
        marketProfile,
        coverage,
      });
      res.json(toRoadmapPlan({
        input,
        plan: fallbackPlan,
        countryPreset,
        provider: 'LOCAL_FALLBACK',
        aiError: getFriendlyGeminiError(err),
      }));
    }
  } catch (err) {
    next(err);
  }
});

export default router;
