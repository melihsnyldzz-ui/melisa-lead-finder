import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const analysisSchema = {
  type: 'object',
  properties: {
    aiFitScore: { type: 'integer', minimum: 0, maximum: 100 },
    aiCategory: {
      type: 'string',
      enum: ['baby_clothing_store', 'kids_clothing_store', 'mixed_retail', 'wholesale_candidate', 'not_target', 'unknown'],
    },
    isTargetCustomer: { type: 'boolean' },
    isWholesalePotential: { type: 'boolean' },
    recommendedAction: {
      type: 'string',
      enum: ['call_first', 'whatsapp_first', 'website_review', 'manual_review', 'skip'],
    },
    summary: { type: 'string' },
    reason: { type: 'string' },
    suggestedMessage: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'aiFitScore',
    'aiCategory',
    'isTargetCustomer',
    'isWholesalePotential',
    'recommendedAction',
    'summary',
    'reason',
    'suggestedMessage',
    'confidence',
  ],
  additionalProperties: false,
};

const searchRunReportSchema = {
  type: 'object',
  properties: {
    executiveSummary: { type: 'string' },
    leadQuality: {
      type: 'string',
      enum: ['strong', 'acceptable', 'mixed', 'weak'],
    },
    marketSignal: { type: 'string' },
    searchWeaknesses: {
      type: 'array',
      items: { type: 'string' },
    },
    nextSearchIdeas: {
      type: 'array',
      items: { type: 'string' },
    },
    keywordImprovements: {
      type: 'array',
      items: { type: 'string' },
    },
    recommendedCities: {
      type: 'array',
      items: { type: 'string' },
    },
    actionPlan: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'executiveSummary',
    'leadQuality',
    'marketSignal',
    'searchWeaknesses',
    'nextSearchIdeas',
    'keywordImprovements',
    'recommendedCities',
    'actionPlan',
  ],
  additionalProperties: false,
};

const searchPlanSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    primaryCity: { type: 'string' },
    recommendedCities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          reason: { type: 'string' },
        },
        required: ['city', 'priority', 'reason'],
        additionalProperties: false,
      },
    },
    keywords: {
      type: 'array',
      items: { type: 'string' },
    },
    localKeywords: {
      type: 'array',
      items: { type: 'string' },
    },
    searchStrategy: {
      type: 'array',
      items: { type: 'string' },
    },
    exclusions: {
      type: 'array',
      items: { type: 'string' },
    },
    maxResults: { type: 'integer', minimum: 1, maximum: 50 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'summary',
    'primaryCity',
    'recommendedCities',
    'keywords',
    'localKeywords',
    'searchStrategy',
    'exclusions',
    'maxResults',
    'confidence',
  ],
  additionalProperties: false,
};

const instagramSearchPlanSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    audienceDefinition: { type: 'string' },
    targetProfiles: {
      type: 'array',
      items: { type: 'string' },
    },
    searchQueries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          searchType: {
            type: 'string',
            enum: ['user', 'hashtag', 'place'],
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          reason: { type: 'string' },
        },
        required: ['query', 'searchType', 'priority', 'reason'],
        additionalProperties: false,
      },
    },
    positiveSignals: {
      type: 'array',
      items: { type: 'string' },
    },
    negativeSignals: {
      type: 'array',
      items: { type: 'string' },
    },
    hashtags: {
      type: 'array',
      items: { type: 'string' },
    },
    localKeywords: {
      type: 'array',
      items: { type: 'string' },
    },
    cityFocus: {
      type: 'array',
      items: { type: 'string' },
    },
    maxResultsPerQuery: { type: 'integer', minimum: 1, maximum: 20 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'summary',
    'audienceDefinition',
    'targetProfiles',
    'searchQueries',
    'positiveSignals',
    'negativeSignals',
    'hashtags',
    'localKeywords',
    'cityFocus',
    'maxResultsPerQuery',
    'confidence',
  ],
  additionalProperties: false,
};

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientGeminiError(error) {
  const combined = [
    error?.message,
    error?.payload?.error?.message,
    error?.payload?.error?.status,
    error?.status,
  ].map((item) => String(item || '')).join(' ');
  return combined.includes('UNAVAILABLE')
    || combined.includes('503')
    || combined.includes('high demand')
    || combined.includes('temporarily unavailable');
}

async function generateContentWithRetry(ai, request, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await ai.models.generateContent(request);
    } catch (err) {
      lastError = err;
      if (!isTransientGeminiError(err) || attempt === retries) break;
      await wait(900 * (attempt + 1));
    }
  }
  throw lastError;
}

export function getGeminiStatus() {
  return {
    configured: Boolean(getGeminiApiKey()),
    model: DEFAULT_MODEL,
  };
}

export function getFriendlyGeminiError(error) {
  const message = String(error?.message || '');
  const payloadMessage = String(error?.payload?.error?.message || '');
  const causeMessage = String(error?.cause?.message || '');
  const causeCode = String(error?.cause?.code || '');
  const combined = `${message} ${payloadMessage} ${causeMessage} ${causeCode}`;
  if (combined.includes('UNAUTHENTICATED') || combined.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
    return 'Gemini API key dogrulanamadi. AI Studio icinden standart Gemini API key kopyalanmali; OAuth/authorization token veya key detay ID degeri bu SDK ile calismaz.';
  }
  if (combined.includes('API key not valid') || combined.includes('API_KEY_INVALID')) {
    return 'Gemini API key gecersiz gorunuyor. AI Studio icinden yeni bir Gemini API key uretip .env dosyasindaki GEMINI_API_KEY degeriyle degistirmek gerekiyor.';
  }
  if (combined.includes('PERMISSION_DENIED')) {
    return 'Gemini API key bu proje veya model icin yetkili degil. AI Studio/API key izinlerini kontrol etmek gerekiyor.';
  }
  if (
    combined.includes('RESOURCE_EXHAUSTED')
    || combined.includes('Quota exceeded')
    || combined.includes('GenerateRequestsPerDay')
    || combined.includes('generate_content_free_tier_requests')
    || combined.includes('429')
  ) {
    return 'Gemini gunluk ucretsiz kullanim kotasi doldu. Sistem yerel akilli plana dustu; kota yenilenince Gemini renkli planlar tekrar gelecektir.';
  }
  if (combined.includes('UNAVAILABLE') || combined.includes('503') || combined.includes('high demand')) {
    return 'Gemini su anda yogunluk nedeniyle plan uretemedi. Sistem yerel akilli plana dustu; biraz sonra tekrar secim yapinca Gemini yeniden denenir.';
  }
  if (combined.includes('ENOTFOUND') || combined.includes('EAI_AGAIN')) {
    return 'Gemini API adresine ulasilamiyor: generativelanguage.googleapis.com DNS/ag tarafinda cozumlenemedi. Internet, DNS veya guvenlik duvari ayari duzelmeden Gemini canli calismaz.';
  }
  if (combined.includes('fetch failed')) {
    return 'Gemini API baglantisi kurulamadi. Internet/DNS/guvenlik duvari ayarlarini kontrol etmek gerekiyor.';
  }
  return message || 'Gemini baglantisi test edilemedi.';
}

export async function testGeminiConnection() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const error = new Error('Gemini API key is not configured');
    error.status = 400;
    throw error;
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await generateContentWithRetry(ai, {
    model: DEFAULT_MODEL,
    contents: 'Return exactly this text: ok',
    config: {
      temperature: 0,
      maxOutputTokens: 8,
    },
  });

  return {
    provider: 'GEMINI',
    model: DEFAULT_MODEL,
    ok: true,
  };
}

function compactLeadForPrompt(lead) {
  return {
    companyName: lead.companyName,
    displayName: lead.displayName,
    country: lead.country,
    city: lead.city,
    address: lead.address,
    phoneExists: Boolean(lead.internationalPhoneNumber || lead.phone),
    website: lead.website,
    googleMapsUrl: lead.googleMapsUrl,
    sourceQuery: lead.sourceQuery,
    sourceKeyword: lead.sourceKeyword,
    leadScore: lead.leadScore,
    scoreReason: lead.scoreReason,
    categoryGuess: lead.categoryGuess,
    businessStatus: lead.businessStatus,
    types: lead.types,
    rating: lead.rating,
    userRatingsTotal: lead.userRatingsTotal,
  };
}

function compactLeadForRunReport(lead) {
  return {
    companyName: lead.companyName,
    country: lead.country,
    city: lead.city,
    websiteExists: Boolean(lead.website),
    phoneExists: Boolean(lead.internationalPhoneNumber || lead.phone),
    googleMapsUrlExists: Boolean(lead.googleMapsUrl),
    leadScore: lead.leadScore,
    scoreReason: lead.scoreReason,
    categoryGuess: lead.categoryGuess,
    businessStatus: lead.businessStatus,
    types: lead.types,
    rating: lead.rating,
    userRatingsTotal: lead.userRatingsTotal,
  };
}

function compactCompanyProfileForPrompt(companyProfile) {
  if (!companyProfile) return null;
  return {
    companyName: companyProfile.companyName,
    description: companyProfile.description,
    productCategories: companyProfile.productCategories,
    targetCustomerTypes: companyProfile.targetCustomerTypes,
    excludedCustomerTypes: companyProfile.excludedCustomerTypes,
    targetCountries: companyProfile.targetCountries,
    valueProposition: companyProfile.valueProposition,
    salesTone: companyProfile.salesTone,
    minimumOrderNote: companyProfile.minimumOrderNote,
    outreachLanguage: companyProfile.outreachLanguage,
  };
}

function buildPrompt(lead, companyProfile) {
  return `
You are an AI lead analyst for the company described below. You understand the company's products, target customers, excluded customers, sales tone, and outreach style.

Company profile:
${JSON.stringify(compactCompanyProfileForPrompt(companyProfile), null, 2)}

Goal:
Analyze whether the Google Places lead is a good potential B2B customer for this specific company.

Target customers:
- Use the company profile targetCustomerTypes as the highest-priority target definition.
- Strong matches are baby clothing stores, kids clothing stores, children's boutiques, and retailers that may buy wholesale stock.

Reject or downgrade:
- Use excludedCustomerTypes from the company profile.
- Also downgrade clinics, schools, playgrounds, toy-only shops, supermarkets, unrelated apparel, adult fashion only
- closed businesses
- businesses with no useful contact signal

Rules:
- Be conservative. If unsure, choose manual_review and explain why.
- Suggested message must follow the company's salesTone and outreachLanguage.
- Do not invent phone numbers, websites, emails, or facts not present in the input.
- Return only JSON matching the schema.

Lead input:
${JSON.stringify(compactLeadForPrompt(lead), null, 2)}
`;
}

function buildSearchRunReportPrompt({ task, metrics, bestLeads, companyProfile }) {
  return `
You are a B2B lead generation strategist for the company profile below.

Company profile:
${JSON.stringify(compactCompanyProfileForPrompt(companyProfile), null, 2)}

Search task:
${JSON.stringify({
    country: task.country,
    city: task.city,
    keywordGroup: task.keywordGroup,
    sourceKeyword: task.sourceKeyword,
    query: task.query,
    sourceType: task.sourceType,
    maxResults: task.maxResults,
  }, null, 2)}

Search metrics:
${JSON.stringify(metrics, null, 2)}

Best inserted leads:
${JSON.stringify(bestLeads.map(compactLeadForRunReport), null, 2)}

Goal:
Create a concise Turkish search report. Explain what this run taught us and how to improve the next search.

Rules:
- Be practical and specific.
- Suggest better keywords, cities, and filters.
- If results are weak, say why.
- Do not invent facts that are not supported by metrics or leads.
- Return only one valid JSON object.
- Do not write markdown, code fences, explanations, or any text before/after JSON.
- Use exactly this shape:
{
  "executiveSummary": "short Turkish summary",
  "leadQuality": "strong",
  "marketSignal": "what this run indicates about the market",
  "searchWeaknesses": ["weakness observed in this run"],
  "nextSearchIdeas": ["next practical Instagram or Google search idea"],
  "keywordImprovements": ["better keyword"],
  "recommendedCities": ["city name"],
  "actionPlan": ["short Turkish action step"]
}
`;
}

function buildSearchPlanPrompt({ countryPreset, marketProfile, coverage, companyProfile }) {
  return `
You are an AI search strategist for B2B wholesale baby and kids clothing lead generation.

Company profile:
${JSON.stringify(compactCompanyProfileForPrompt(companyProfile), null, 2)}

Country preset:
${JSON.stringify(countryPreset, null, 2)}

Market profile:
${JSON.stringify(marketProfile || null, null, 2)}

Existing Google Places coverage:
${JSON.stringify(coverage || null, null, 2)}

Goal:
Before starting Google Places, decide where and what to search in this country.
Find physical stores, boutiques, retailers, and children's wear shops that could buy wholesale baby/kids clothing from Melisa.

Rules:
- Return a practical Turkish plan.
- Choose the strongest first city for baby/kids clothing retail discovery.
- Recommend 3-6 cities from the provided country city list when possible.
- Keywords must target only baby clothing stores, kids clothing stores, children's boutiques, children's wear retailers, baby boutiques, and kidswear shops.
- Prefer retailer/store/boutique/shop terms over broad product-only terms.
- Each keyword must include both clothing intent and baby/kids audience intent, unless it is a strong local-language equivalent.
- Include English keywords and local-language keywords when useful.
- Do not suggest schools, clinics, playgrounds, toy-only shops, supermarkets, adult fashion, pharmacies, malls, or broad baby product stores without clothing proof.
- If a query is too broad, make it more specific with boutique, shop, retailer, kidswear, babywear, or local-language clothing words.
- If coverage shows a city was already searched successfully, lower its priority unless it still deserves a re-check.
- Use coverage.performance.bestCities and bestKeywords as positive signals.
- Avoid or lower coverage.performance.weakCities and weakKeywords unless there is too little data.
- Treat coverage.userFeedback.likedPatterns as the strongest signal of what Melisa prefers.
- Avoid or lower coverage.userFeedback.dislikedPatterns unless there is too little data.
- If previous searches found many duplicates but few created leads, suggest a different city or more specific local keyword.
- Return only one valid JSON object. Do not write markdown, code fences, explanations, or text before/after JSON.
- Use exactly this shape:
{
  "summary": "short Turkish summary",
  "primaryCity": "one city from the provided city list",
  "recommendedCities": [
    { "city": "city name", "priority": "high", "reason": "short Turkish reason" }
  ],
  "keywords": ["baby clothing store", "kids clothing store"],
  "localKeywords": ["local language baby/kids clothing keyword"],
  "searchStrategy": ["short Turkish step"],
  "exclusions": ["schools", "clinics", "toy-only shops"],
  "maxResults": 40,
  "confidence": 0.8
}
`;
}

function buildInstagramSearchPlanPrompt({ countryPreset, marketProfile, coverage, companyProfile }) {
  return `
You are an AI Instagram lead search strategist for a wholesale baby and kids clothing supplier.

Company profile:
${JSON.stringify(compactCompanyProfileForPrompt(companyProfile), null, 2)}

Country preset:
${JSON.stringify(countryPreset, null, 2)}

Market profile:
${JSON.stringify(marketProfile || null, null, 2)}

Existing Instagram search coverage and feedback:
${JSON.stringify(coverage || null, null, 2)}

Goal:
Create a detailed Instagram discovery plan that finds virtual stores, baby clothing shops, kids clothing boutiques, children's wear sellers, WhatsApp order profiles, and wholesale-capable retail profiles.

Rules:
- Return Turkish explanations, but search queries can be English, Turkish, and local language.
- Focus on Instagram profiles that look like real businesses with product posts, catalog/order language, WhatsApp, website, address, or store/boutique wording.
- Include local language keywords, transliterated variants, English variants, boutique terms, online shop terms, WhatsApp/order terms, and kidswear/babywear variants.
- Prefer searchType "user" because the current actor inserts profile leads; use hashtag/place only as secondary discovery ideas.
- Do not target toy-only pages, schools, clinics, playgrounds, mother blogs, influencers, personal baby accounts, adult fashion only, or unrelated marketplaces.
- Make queries broad enough to find sellers, but strict enough that every query implies baby/kids clothing sales.
- Use previous liked/disliked lead feedback as the strongest learning signal.
- If previous Instagram searches are weak, make queries more specific and local.
- Return only one valid JSON object. Do not write markdown, code fences, explanations, or any text before/after JSON.
- Use exactly this shape:
{
  "summary": "short Turkish strategy summary",
  "audienceDefinition": "which Instagram pages and businesses should be found",
  "targetProfiles": ["baby clothing Instagram stores", "kids boutique pages"],
  "searchQueries": [
    { "query": "baby clothing boutique Varna", "searchType": "user", "priority": "high", "reason": "why this query should work" }
  ],
  "positiveSignals": ["bio contains kidswear", "WhatsApp in bio", "store address"],
  "negativeSignals": ["personal influencer", "toy-only", "adult fashion"],
  "hashtags": ["#kidswearvarna"],
  "localKeywords": ["local baby clothing keyword"],
  "cityFocus": ["Varna", "Sofia"],
  "maxResultsPerQuery": 5,
  "confidence": 0.75
}
`;
}

function clampAnalysis(value) {
  const normalized = {
    aiFitScore: Number.isFinite(value.aiFitScore) ? Math.max(0, Math.min(100, Math.round(value.aiFitScore))) : 0,
    aiCategory: value.aiCategory || 'unknown',
    isTargetCustomer: Boolean(value.isTargetCustomer),
    isWholesalePotential: Boolean(value.isWholesalePotential),
    recommendedAction: value.recommendedAction || 'manual_review',
    summary: String(value.summary || '').slice(0, 500),
    reason: String(value.reason || '').slice(0, 900),
    suggestedMessage: String(value.suggestedMessage || '').slice(0, 700),
    confidence: Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0,
  };

  const allowedCategories = new Set(analysisSchema.properties.aiCategory.enum);
  if (!allowedCategories.has(normalized.aiCategory)) normalized.aiCategory = 'unknown';

  const allowedActions = new Set(analysisSchema.properties.recommendedAction.enum);
  if (!allowedActions.has(normalized.recommendedAction)) normalized.recommendedAction = 'manual_review';

  return normalized;
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function buildLocalLeadAnalysis(lead, reason) {
  const haystack = [
    lead.companyName,
    lead.categoryGuess,
    lead.sourceKeyword,
    lead.sourceQuery,
    lead.types,
    lead.formattedAddress,
  ].map((item) => String(item || '').toLowerCase()).join(' ');

  const babySignal = includesAny(haystack, [
    'baby',
    'bebek',
    'bebe',
    'infant',
    'newborn',
    'бебе',
    'бебеш',
    'малыш',
    'детск',
    'детски',
    'детские',
    'copii',
    'bambini',
  ]);
  const kidsSignal = includesAny(haystack, [
    'kid',
    'kids',
    'child',
    'children',
    'cocuk',
    'çocuk',
    'çocuk giyim',
    'дет',
    'dzieci',
    'copii',
  ]);
  const clothingSignal = includesAny(haystack, [
    'clothing',
    'clothes',
    'wear',
    'fashion',
    'boutique',
    'giyim',
    'kiyafet',
    'дрех',
    'одеж',
    'odziez',
    'îmbrăcăminte',
    'haine',
  ]);
  const wholesaleSignal = includesAny(haystack, ['wholesale', 'toptan', 'опт', 'оптом', 'hurt']);
  const hasPhone = Boolean(lead.phone || lead.internationalPhoneNumber);
  const hasWebsite = Boolean(lead.website);
  const isTargetCustomer = (babySignal || kidsSignal) && clothingSignal;
  const baseScore = Number.isFinite(lead.leadScore) ? lead.leadScore : 45;
  const aiFitScore = Math.max(0, Math.min(100, Math.round(
    baseScore
      + (isTargetCustomer ? 8 : -12)
      + (wholesaleSignal ? 8 : 0)
      + (hasPhone ? 4 : 0)
      + (hasWebsite ? 4 : 0),
  )));
  const recommendedAction = !isTargetCustomer
    ? 'manual_review'
    : hasPhone
      ? 'whatsapp_first'
      : hasWebsite
        ? 'website_review'
        : 'manual_review';
  const aiCategory = wholesaleSignal
    ? 'wholesale_candidate'
    : babySignal && kidsSignal
      ? 'mixed_retail'
      : babySignal
        ? 'baby_clothing_store'
        : kidsSignal
          ? 'kids_clothing_store'
          : isTargetCustomer
            ? 'mixed_retail'
            : 'unknown';

  return {
    provider: 'LOCAL_AI',
    model: 'local-lead-analysis-v1',
    ...clampAnalysis({
      aiFitScore,
      aiCategory,
      isTargetCustomer,
      isWholesalePotential: wholesaleSignal || (isTargetCustomer && hasWebsite && hasPhone),
      recommendedAction,
      summary: isTargetCustomer
        ? `${lead.companyName || 'Bu firma'} bebek/cocuk giyim hedef kitlesine uygun gorunuyor.`
        : `${lead.companyName || 'Bu firma'} icin bebek/cocuk giyim sinyali zayif; manuel kontrol onerilir.`,
      reason: `${reason || 'Gemini analizi alinamadi; yerel sinyal analizi kullanildi.'} Kaynak sinyaller: ${lead.sourceKeyword || lead.sourceQuery || 'belirsiz'}, skor ${baseScore}/100, telefon ${hasPhone ? 'var' : 'yok'}, web sitesi ${hasWebsite ? 'var' : 'yok'}.`,
      suggestedMessage: isTargetCustomer
        ? 'Merhaba, Melisa Baby olarak bebek ve cocuk giyim urunlerinde toptan is birligi yapiyoruz. Magazaniz icin koleksiyon ve fiyat bilgisi paylasabilir miyiz?'
        : '',
      confidence: isTargetCustomer ? 0.66 : 0.42,
    }),
  };
}

export async function analyzeLeadWithGemini(lead, companyProfile) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return buildLocalLeadAnalysis(lead, 'Gemini API key tanimli degil; yerel analiz kullanildi.');
  }

  let response;
  try {
    const ai = new GoogleGenAI({ apiKey });
    response = await generateContentWithRetry(ai, {
      model: DEFAULT_MODEL,
      contents: buildPrompt(lead, companyProfile),
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 900,
      },
    });
  } catch (err) {
    return buildLocalLeadAnalysis(lead, getFriendlyGeminiError(err));
  }

  const text = response.text;
  if (!text) {
    return buildLocalLeadAnalysis(lead, 'Gemini bos analiz dondu; yerel analiz kullanildi.');
  }

  try {
    return {
      provider: 'GEMINI',
      model: DEFAULT_MODEL,
      ...clampAnalysis(parseGeminiJson(text)),
    };
  } catch (err) {
    return buildLocalLeadAnalysis(lead, 'Gemini gecersiz analiz formati dondu; yerel analiz kullanildi.');
  }
}

function clampSearchRunReport(value) {
  const allowedQuality = new Set(searchRunReportSchema.properties.leadQuality.enum);
  return {
    provider: 'GEMINI',
    model: DEFAULT_MODEL,
    executiveSummary: String(value.executiveSummary || '').slice(0, 800),
    leadQuality: allowedQuality.has(value.leadQuality) ? value.leadQuality : 'mixed',
    marketSignal: String(value.marketSignal || '').slice(0, 800),
    searchWeaknesses: Array.isArray(value.searchWeaknesses) ? value.searchWeaknesses.map(String).slice(0, 6) : [],
    nextSearchIdeas: Array.isArray(value.nextSearchIdeas) ? value.nextSearchIdeas.map(String).slice(0, 6) : [],
    keywordImprovements: Array.isArray(value.keywordImprovements) ? value.keywordImprovements.map(String).slice(0, 8) : [],
    recommendedCities: Array.isArray(value.recommendedCities) ? value.recommendedCities.map(String).slice(0, 8) : [],
    actionPlan: Array.isArray(value.actionPlan) ? value.actionPlan.map(String).slice(0, 6) : [],
  };
}

function normalizeStringArray(value, fallback = [], max = 8) {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, max);
}

function parseGeminiJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Empty Gemini response');

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || raw).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('Gemini response does not contain a JSON object');
  }
}

function clampSearchPlan(value, countryPreset = {}) {
  const cities = Array.isArray(countryPreset.cities) ? countryPreset.cities : [];
  const rawRecommendedCities = Array.isArray(value.recommendedCities)
    ? value.recommendedCities
    : Array.isArray(value.citiesToSearch)
      ? value.citiesToSearch
      : Array.isArray(value.cities)
        ? value.cities
        : [];
  const recommendedCities = rawRecommendedCities
      .map((item) => ({
        city: String(item?.city || item?.name || item?.cityName || '').trim(),
        priority: ['high', 'medium', 'low'].includes(item?.priority) ? item.priority : 'medium',
        reason: String(item?.reason || item?.rationale || item?.why || '').slice(0, 240),
      }))
      .filter((item) => item.city)
      .slice(0, 6);

  const primaryCity = String(value.primaryCity || value.firstCity || recommendedCities[0]?.city || cities[0] || '').trim();
  const normalizedRecommendedCities = recommendedCities.length
    ? recommendedCities
    : cities.slice(0, 5).map((city, index) => ({
      city,
      priority: index === 0 ? 'high' : 'medium',
      reason: index === 0 ? 'Ilk pilot sehir olarak en guclu baslangic noktasi.' : 'Ikinci dalga tarama icin uygun sehir.',
    }));

  const keywords = normalizeStringArray(value.keywords || value.englishKeywords, [
    'baby clothing store',
    'kids clothing store',
    "children's clothing store",
    "children's wear store",
    'kids fashion store',
  ], 10);
  const localKeywords = normalizeStringArray(value.localKeywords || value.localLanguageKeywords, countryPreset.queries || [], 8);
  const searchStrategy = normalizeStringArray(value.searchStrategy || value.steps || value.actionPlan, [
    'Once en yuksek oncelikli sehirde Google Places kalite testi yap.',
    'Telefon ve web sitesi olan magaza adaylarini one al.',
    'Sadece bebek giyim ve cocuk giyim odakli perakende magazalari tut.',
  ], 6);
  const confidence = Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0.68;
  const summary = String(
    value.summary
      || value.planSummary
      || value.strategy
      || value.planName
      || `${countryPreset.name || 'Secili ulke'} icin ${primaryCity || 'ilk sehir'} odakli bebek ve cocuk giyim magazasi arama plani.`
  ).slice(0, 700);

  return {
    provider: 'GEMINI',
    model: DEFAULT_MODEL,
    summary,
    primaryCity,
    recommendedCities: normalizedRecommendedCities,
    keywords,
    localKeywords,
    searchStrategy,
    exclusions: normalizeStringArray(value.exclusions || value.exclude, [
      'toy-only shops',
      'schools',
      'clinics',
      'playgrounds',
      'adult fashion only',
      'supermarkets',
    ], 8),
    maxResults: Number.isFinite(value.maxResults) ? Math.max(1, Math.min(50, Math.round(value.maxResults))) : 50,
    confidence,
  };
}

function normalizeInstagramSearchType(value) {
  return ['user', 'hashtag', 'place'].includes(value) ? value : 'user';
}

function clampInstagramSearchPlan(value, countryPreset = {}) {
  const cities = Array.isArray(countryPreset.cities) ? countryPreset.cities : [];
  const fallbackCity = cities[0] || '';
  const fallbackQueries = [
    `baby clothing boutique ${fallbackCity}`.trim(),
    `kidswear boutique ${fallbackCity}`.trim(),
    `children clothing store ${fallbackCity}`.trim(),
    `babywear shop ${fallbackCity}`.trim(),
  ];
  const rawQueries = Array.isArray(value.searchQueries) ? value.searchQueries : [];
  const searchQueries = rawQueries
    .map((item) => ({
      query: String(item?.query || item?.keyword || item?.search || '').trim(),
      searchType: normalizeInstagramSearchType(item?.searchType),
      priority: ['high', 'medium', 'low'].includes(item?.priority) ? item.priority : 'medium',
      reason: String(item?.reason || item?.why || '').slice(0, 240),
    }))
    .filter((item) => item.query)
    .slice(0, 10);

  const normalizedQueries = searchQueries.length
    ? searchQueries
    : fallbackQueries.map((query, index) => ({
      query,
      searchType: 'user',
      priority: index === 0 ? 'high' : 'medium',
      reason: index === 0 ? 'Ilk Instagram profil kesfi icin en guclu genel sorgu.' : 'Kapsami genisletmek icin alternatif profil sorgusu.',
    }));

  return {
    provider: 'GEMINI',
    model: DEFAULT_MODEL,
    summary: String(value.summary || `${countryPreset.name || 'Secili ulke'} icin Instagram bebek/cocuk giyim profil arama plani.`).slice(0, 700),
    audienceDefinition: String(value.audienceDefinition || 'Instagram uzerinden satis yapan bebek giyim, cocuk giyim, kidswear butik ve sanal magaza profilleri.').slice(0, 700),
    targetProfiles: normalizeStringArray(value.targetProfiles, [
      'baby clothing Instagram stores',
      'kids clothing boutiques',
      'children wear online shops',
      'babywear retailers with WhatsApp in bio',
    ], 8),
    searchQueries: normalizedQueries,
    positiveSignals: normalizeStringArray(value.positiveSignals, [
      'bio contains babywear, kidswear, children clothing, boutique, shop',
      'WhatsApp, phone, website, or store address exists',
      'recent product posts and catalog-like content',
      'business account or store-like profile name',
    ], 10),
    negativeSignals: normalizeStringArray(value.negativeSignals, [
      'personal influencer account',
      'toy-only page',
      'school, clinic, playground, mother blog',
      'adult fashion only',
      'private or empty profile',
    ], 10),
    hashtags: normalizeStringArray(value.hashtags, [
      '#kidswear',
      '#babywear',
      '#childrensclothing',
      '#kidsboutique',
    ], 12),
    localKeywords: normalizeStringArray(value.localKeywords || value.localLanguageKeywords, countryPreset.queries || [], 10),
    cityFocus: normalizeStringArray(value.cityFocus || value.cities, cities.slice(0, 5), 6),
    maxResultsPerQuery: Number.isFinite(value.maxResultsPerQuery)
      ? Math.max(1, Math.min(20, Math.round(value.maxResultsPerQuery)))
      : 5,
    confidence: Number.isFinite(value.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0.62,
  };
}

export function buildFallbackSearchPlan({ countryPreset = {}, marketProfile = {}, coverage = null } = {}) {
  const cities = Array.isArray(countryPreset.cities) ? countryPreset.cities : [];
  const searchedCities = new Set((coverage?.cities || [])
    .filter((city) => city.completedRuns > 0)
    .map((city) => city.city));
  const bestCities = (coverage?.performance?.bestCities || [])
    .filter((item) => cities.includes(item.name) && item.createdCount > 0)
    .map((item) => item.name);
  const weakCities = new Set((coverage?.performance?.weakCities || []).map((item) => item.name));
  const orderedCities = [
    ...bestCities,
    ...cities.filter((city) => !searchedCities.has(city)),
    ...cities.filter((city) => searchedCities.has(city) && !weakCities.has(city) && !bestCities.includes(city)),
    ...cities.filter((city) => weakCities.has(city) && !bestCities.includes(city)),
  ].slice(0, 5);
  const dedupedOrderedCities = [...new Set(orderedCities)];
  const primaryFallbackCity = dedupedOrderedCities.find((city) => !weakCities.has(city)) || dedupedOrderedCities[0] || cities[0] || '';
  const bestKeywords = (coverage?.performance?.bestKeywords || [])
    .filter((item) => item.createdCount > 0)
    .map((item) => item.name);
  const weakKeywords = new Set((coverage?.performance?.weakKeywords || []).map((item) => item.name));
  const presetKeywords = normalizeStringArray(countryPreset.queries || [], [], 8);
  const learnedLocalKeywords = normalizeStringArray([
    ...bestKeywords,
    ...presetKeywords.filter((keyword) => !weakKeywords.has(keyword)),
  ], presetKeywords, 8);

  return {
    provider: 'LOCAL_ANALYSIS',
    model: null,
    summary: marketProfile?.babyKidsClothingSignal
      ? `${countryPreset.name} icin ilk hedef, cocuk/bebek giyim sinyali guclu sehirlerden baslayip yerel dil keywordleriyle Google Places taramasi yapmak. ${marketProfile.babyKidsClothingSignal}`
      : `${countryPreset.name || 'Secili ulke'} icin en guclu sehirlerden baslayarak bebek ve cocuk giyim magazalari aranacak.`,
    primaryCity: primaryFallbackCity,
    recommendedCities: dedupedOrderedCities.map((city, index) => ({
      city,
      priority: weakCities.has(city) ? 'low' : index === 0 ? 'high' : index < 3 ? 'medium' : 'low',
      reason: bestCities.includes(city)
        ? 'Gecmis aramalarda daha iyi lead sinyali verdigi icin one alindi.'
        : weakCities.has(city)
          ? 'Onceki arama zayifti; yalnizca farkli keywordlerle tekrar denenmeli.'
          : searchedCities.has(city)
            ? 'Bu sehir daha once taranmis; kalite dusukse yeniden farkli keywordlerle denenebilir.'
            : index === 0
              ? 'Ulke icin ilk pilot tarama sehri olarak en uygun aday.'
              : 'Kapsami genisletmek icin sonraki tarama sehri.',
    })),
    keywords: [
      'baby clothing store',
      'kids clothing store',
      "children's clothing boutique",
      'baby clothes shop',
      'kids fashion store',
      "children's wear retailer",
      'baby boutique',
      'kidswear store',
      'baby kids clothing store',
    ],
    localKeywords: learnedLocalKeywords,
    searchStrategy: [
      'Once en yuksek oncelikli sehirde 20-30 sonuc ile kalite testi yap.',
      'Telefon ve websitesi olan leadleri onceliklendir.',
      'Magaza, butik, retailer ve shop sinyali tasiyan sonuclari yukari al.',
      'Sonra ayni ulkede ikinci ve ucuncu sehre gec.',
      'Zayif sonuclarda yerel dil keywordlerini one al.',
    ],
    exclusions: ['toy-only shops', 'schools', 'clinics', 'playgrounds', 'adult fashion only', 'supermarkets'],
    maxResults: 50,
    confidence: marketProfile ? 0.72 : 0.55,
  };
}

export function buildFallbackInstagramSearchPlan({ countryPreset = {}, marketProfile = {}, coverage = null } = {}) {
  const cities = Array.isArray(countryPreset.cities) ? countryPreset.cities : [];
  const searchedCities = new Set((coverage?.cities || [])
    .filter((city) => city.completedRuns > 0)
    .map((city) => city.city));
  const cityFocus = [
    ...cities.filter((city) => !searchedCities.has(city)),
    ...cities.filter((city) => searchedCities.has(city)),
  ].slice(0, 4);
  const primaryCity = cityFocus[0] || cities[0] || '';
  const localKeywords = normalizeStringArray(countryPreset.queries || [], [], 8);
  const keywords = [
    'baby clothing boutique',
    'kidswear boutique',
    'children clothing shop',
    'babywear shop',
    'kidswear online shop',
    'baby boutique whatsapp',
    'kids fashion store',
    ...localKeywords,
  ];

  return clampInstagramSearchPlan({
    summary: marketProfile?.salesNotes?.length
      ? `${countryPreset.name} icin Instagram aramalarinda sanal magaza, WhatsApp satis ve butik profil sinyalleri one alinacak. ${marketProfile.salesNotes[0]}`
      : `${countryPreset.name || 'Secili ulke'} icin Instagram sanal magaza ve bebek/cocuk giyim butik profilleri aranacak.`,
    audienceDefinition: 'Instagram uzerinden satis yapan bebek giyim magazalari, cocuk giyim butik sayfalari, kidswear sanal magazalari ve WhatsApp ile siparis alan isletme profilleri.',
    targetProfiles: [
      'baby clothing Instagram stores',
      'kids clothing boutiques',
      'children wear online shops',
      'babywear retailers',
      'kids fashion sellers with WhatsApp',
    ],
    searchQueries: keywords.slice(0, 8).map((keyword, index) => ({
      query: [keyword, primaryCity].filter(Boolean).join(' '),
      searchType: 'user',
      priority: index < 3 ? 'high' : 'medium',
      reason: index < 3 ? 'Hedef profil sinyali guclu ana Instagram sorgusu.' : 'Yerel varyasyonla kapsam genisletme sorgusu.',
    })),
    positiveSignals: [
      'bio veya ad kisminda baby, kids, children, boutique, shop, wear sinyali',
      'WhatsApp, telefon, web sitesi veya adres bulunmasi',
      'order, catalog, delivery, online shop veya siparis dili',
      'urun katalogu gibi gorunen son paylasimlar',
      'magaza/butik ismi ve fiyat/siparis dili',
    ],
    negativeSignals: [
      'personal influencer account',
      'toy-only page',
      'mother blog',
      'adult fashion only',
      'school, clinic, playground',
      'private or empty profile',
    ],
    hashtags: ['#kidswear', '#babywear', '#kidsboutique', '#childrensclothing'],
    localKeywords,
    cityFocus,
    maxResultsPerQuery: 5,
    confidence: coverage?.totalRuns ? 0.7 : 0.58,
  }, countryPreset);
}

export async function createInstagramSearchPlanWithGemini({ countryPreset, marketProfile, coverage, companyProfile }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const error = new Error('Gemini API key is not configured');
    error.status = 400;
    throw error;
  }

  let response;
  try {
    const ai = new GoogleGenAI({ apiKey });
    response = await generateContentWithRetry(ai, {
      model: DEFAULT_MODEL,
      contents: buildInstagramSearchPlanPrompt({ countryPreset, marketProfile, coverage, companyProfile }),
      config: {
        responseMimeType: 'application/json',
        temperature: 0.28,
        maxOutputTokens: 3200,
      },
    });
  } catch (err) {
    const error = new Error(getFriendlyGeminiError(err));
    error.status = err.status || 502;
    error.cause = err;
    throw error;
  }

  const text = response.text;
  if (!text) {
    const error = new Error('Gemini returned an empty Instagram search plan');
    error.status = 502;
    throw error;
  }

  try {
    return clampInstagramSearchPlan(parseGeminiJson(text), countryPreset);
  } catch (err) {
    const preview = String(text || '').replace(/\s+/g, ' ').slice(0, 180);
    const error = new Error(`Gemini returned invalid Instagram search plan JSON: ${err.message}${preview ? ` (${preview})` : ''}`);
    error.status = 502;
    error.cause = err;
    throw error;
  }
}

export async function createSearchPlanWithGemini({ countryPreset, marketProfile, coverage, companyProfile }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const error = new Error('Gemini API key is not configured');
    error.status = 400;
    throw error;
  }

  let response;
  try {
    const ai = new GoogleGenAI({ apiKey });
    response = await generateContentWithRetry(ai, {
      model: DEFAULT_MODEL,
      contents: buildSearchPlanPrompt({ countryPreset, marketProfile, coverage, companyProfile }),
      config: {
        responseMimeType: 'application/json',
        temperature: 0.25,
        maxOutputTokens: 3000,
      },
    });
  } catch (err) {
    const error = new Error(getFriendlyGeminiError(err));
    error.status = err.status || 502;
    error.cause = err;
    throw error;
  }

  const text = response.text;
  if (!text) {
    const error = new Error('Gemini returned an empty search plan');
    error.status = 502;
    throw error;
  }

  try {
    return clampSearchPlan(parseGeminiJson(text), countryPreset);
  } catch (err) {
    const preview = String(text || '').replace(/\s+/g, ' ').slice(0, 180);
    const error = new Error(`Gemini returned invalid search plan JSON: ${err.message}${preview ? ` (${preview})` : ''}`);
    error.status = 502;
    error.cause = err;
    throw error;
  }
}

export async function analyzeSearchRunWithGemini({ task, metrics, bestLeads, companyProfile }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  let response;
  try {
    const ai = new GoogleGenAI({ apiKey });
    response = await generateContentWithRetry(ai, {
      model: DEFAULT_MODEL,
      contents: buildSearchRunReportPrompt({ task, metrics, bestLeads, companyProfile }),
      config: {
        responseMimeType: 'application/json',
        temperature: 0.25,
        maxOutputTokens: 1200,
      },
    });
  } catch (err) {
    const error = new Error(getFriendlyGeminiError(err));
    error.status = err.status || 502;
    error.cause = err;
    throw error;
  }

  const text = response.text;
  if (!text) {
    const error = new Error('Gemini returned an empty search report');
    error.status = 502;
    throw error;
  }

  try {
    return clampSearchRunReport(parseGeminiJson(text));
  } catch (err) {
    const error = new Error('Gemini returned invalid search report JSON');
    error.status = 502;
    error.cause = err;
    throw error;
  }
}
