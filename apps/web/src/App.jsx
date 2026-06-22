import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bot, Copy, Download, Flame, Globe, Instagram as InstagramIcon, MapPin, MessageCircle, Phone, Play, Save, Search, Settings, ThumbsDown, ThumbsUp, UsersRound } from 'lucide-react';
import { balkanCountryPresets } from './lib/countryPresets.js';
import { countryMarketProfiles } from './lib/countryMarketProfiles.js';
import { apiGet, apiPatch, apiPost, exportCsvUrl } from './lib/api.js';

const statusLabels = {
  NEW: 'Yeni',
  HOT: 'Sıcak',
  REVIEW: 'İncelemede',
  QUALIFIED: 'Uygun',
  LOW_QUALITY: 'Düşük Kalite',
  REJECTED: 'Uygun Değil',
  CONVERTED: 'CRM’e Aktarıldı',
};

const feedbackLabels = {
  NONE: 'Gorus yok',
  LIKED: 'Begenildi',
  DISLIKED: 'Begenilmedi',
};

const sourceTypeLabels = {
  DEMO: 'Demo',
  GOOGLE_PLACES: 'Google Magaza Bul',
  INSTAGRAM: 'Instagram Musteri Bul',
  INSTAGRAM_APIFY: 'Instagram Apify',
  APIFY: 'Apify',
  MANUAL: 'Manuel',
};

const taskStatusLabels = {
  DRAFT: 'Taslak',
  QUEUED: 'Kuyrukta',
  RUNNING: 'Çalışıyor',
  COMPLETED: 'Tamamlandı',
  FAILED: 'Hatalı',
};

const runResultStatusLabels = {
  inserted: 'Eklendi',
  duplicate: 'Zaten vardi',
  duplicate_skipped: 'Detay atlandi',
  filtered_out: 'Hedef disi',
  candidate: 'Aday',
  found: 'Bulundu',
};

const summarySourceLabels = {
  live: 'Canli arama',
  persisted: 'Kayitli arama',
  cache: 'Yerel kayit',
  estimated: 'Arsivden tahmin',
};

const runResultFilterLabels = {
  all: 'Hepsi',
  inserted: 'Yeni eklenen',
  duplicate: 'Tekrar',
  filtered_out: 'Hedef disi',
};

const keywordGroups = {
  'baby/kids retail': 'Bebek/Çocuk Giyim Mağazası',
};

const automaticSearchKeywords = [
  'baby clothing store',
  'kids clothing store',
  "children's clothing boutique",
  'baby clothes shop',
  'kids fashion store',
  "children's wear retailer",
  'baby boutique',
  'kids boutique',
  'baby kids clothing store',
  'children clothing shop',
  'baby clothing retailer',
  'kidswear store',
];

const instagramSearchKeywords = [
  'baby clothing boutique',
  'kids clothing boutique',
  'children wear shop',
  'babywear shop',
  'kidswear store',
  'children boutique',
  'baby kids boutique',
  'baby boutique online',
  'kidswear online shop',
  'bebek giyim butik',
  'cocuk giyim butik',
  'bebek magaza',
  'cocuk butik',
  'bebek giyim',
  'cocuk giyim',
  'çocuk giyim',
];

const googlePlacesLanguageCodes = new Set(['en', 'ro', 'bg', 'de', 'tr', 'ru', 'uk', 'pl', 'el', 'sr', 'hr', 'sq', 'bs', 'sl', 'mk', 'ka', 'hy', 'az', 'kk', 'uz', 'be']);

const countrySearchProfiles = {
  AL: { languageCode: 'sq', languages: ['Albanian', 'English'], searchHabits: ['small boutiques', 'Instagram and WhatsApp contact', 'price-sensitive retail'], instagramHabits: ['rroba femijesh', 'rroba bebe', 'dyqan rrobash femijesh'] },
  BA: { languageCode: 'bs', languages: ['Bosnian', 'Serbian', 'Croatian'], searchHabits: ['city-center retailers', 'local-language store terms', 'price-focused offers'], instagramHabits: ['dječija odjeća', 'bebi odjeca', 'prodavnica dječije odjeće'] },
  BG: { languageCode: 'bg', languages: ['Bulgarian', 'English'], searchHabits: ['Bulgarian Cyrillic keywords first', 'Sofia/Plovdiv/Varna split', 'EU quality expectations'], instagramHabits: ['детски дрехи', 'бебешки дрехи', 'детски магазин'] },
  GR: { languageCode: 'el', languages: ['Greek', 'English'], searchHabits: ['Greek keywords first', 'Athens and Thessaloniki priority', 'seasonal boutique demand'], instagramHabits: ['παιδικά ρούχα', 'βρεφικά ρούχα', 'παιδικά ρούχα κατάστημα'] },
  RO: { languageCode: 'ro', languages: ['Romanian', 'English'], searchHabits: ['Romanian keywords first', 'website and phone are strong signals', 'large city expansion'], instagramHabits: ['haine copii', 'magazin bebe', 'butic'] },
  RS: { languageCode: 'sr', languages: ['Serbian', 'English'], searchHabits: ['Serbian keyword variants', 'Belgrade segmenting', 'price and delivery clarity'], instagramHabits: ['dečija odeća', 'prodavnica', 'butik'] },
  TR: { languageCode: 'tr', languages: ['Turkish'], searchHabits: ['Turkish keywords first', 'district-based Istanbul searches', 'high competition and high volume', 'avoid wholesale-only search terms when looking for retailers'], instagramHabits: ['bebek giyim', 'cocuk giyim', 'bebek butik', 'bebek kiyafet'] },
  UA: { languageCode: 'uk', languages: ['Ukrainian', 'Russian', 'English'], searchHabits: ['Ukrainian keywords first', 'Kyiv and Lviv controlled pilots', 'logistics and payment notes'], instagramHabits: ['дитячий одяг', 'одяг для немовлят', 'магазин дитячого одягу'] },
  RU: { languageCode: 'ru', languages: ['Russian'], searchHabits: ['Russian keywords first', 'major cities segmented', 'payment and logistics risk check'], instagramHabits: ['детская одежда', 'одежда для малышей', 'магазин детской одежды'] },
  MD: { languageCode: 'ro', languages: ['Romanian', 'Russian'], searchHabits: ['Romanian and Russian keywords together', 'Chisinau first', 'small order advantage'], instagramHabits: ['haine copii', 'magazin bebe', 'детская одежда'] },
  PL: { languageCode: 'pl', languages: ['Polish', 'English'], searchHabits: ['Polish keywords first', 'website quality matters', 'EU label expectations'], instagramHabits: ['odzież dziecięca', 'ubranka dla niemowląt', 'sklep z odzieżą dziecięcą'] },
  BY: { languageCode: 'ru', languages: ['Russian', 'Belarusian'], searchHabits: ['Russian keywords first', 'Minsk pilot', 'payment/logistics risk'], instagramHabits: ['детская одежда', 'адзенне для дзяцей', 'магазин детской одежды'] },
  GE: { languageCode: 'ka', languages: ['Georgian', 'English', 'Russian'], searchHabits: ['Georgian and English searches together', 'Tbilisi first', 'Instagram-active shops are strong'], instagramHabits: ['ბავშვის ტანსაცმელი', 'საბავშვო ტანსაცმელი', 'ბავშვის ტანსაცმლის მაღაზია'] },
  AM: { languageCode: 'hy', languages: ['Armenian', 'Russian', 'English'], searchHabits: ['Armenian keywords first', 'Yerevan first', 'low MOQ advantage'], instagramHabits: ['մանկական հագուստ', 'երեխաների հագուստ', 'մանկական հագուստի խանութ'] },
  AZ: { languageCode: 'az', languages: ['Azerbaijani', 'Turkish', 'Russian'], searchHabits: ['Azerbaijani and Turkish keywords together', 'Baku priority', 'Turkish outreach advantage'], instagramHabits: ['uşaq geyim', 'körpə geyim', 'uşaq geyim mağazası'] },
  KZ: { languageCode: 'ru', languages: ['Russian', 'Kazakh'], searchHabits: ['Russian and Kazakh keywords together', 'Almaty/Astana as separate pilots', 'logistics cost matters'], instagramHabits: ['детская одежда', 'балалар киімі', 'магазин детской одежды'] },
  UZ: { languageCode: 'uz', languages: ['Uzbek', 'Russian'], searchHabits: ['Uzbek and Russian keywords together', 'Tashkent first', 'price-sensitive high volume'], instagramHabits: ['bolalar kiyim', 'chaqaloq kiyim', 'bolalar kiyim doʻkoni'] },
  KG: { languageCode: 'ru', languages: ['Russian', 'Kyrgyz'], searchHabits: ['Russian keywords usually start better', 'Bishkek first', 'low MOQ and WhatsApp'], instagramHabits: ['детская одежда', 'балдар кийим', 'магазин детской одежды'] },
  TJ: { languageCode: 'ru', languages: ['Russian', 'Tajik'], searchHabits: ['Russian and Tajik keywords', 'Dushanbe first', 'manual quality control'], instagramHabits: ['детская одежда', 'либоси кӯдакона', 'магазин детской одежды'] },
  TM: { languageCode: 'ru', languages: ['Russian', 'Turkmen'], searchHabits: ['Russian and Turkmen keywords', 'Ashgabat first', 'relationship-based market'], instagramHabits: ['детская одежда', 'çaga eşikleri', 'çaga egin-eşikleri'] },
};

function getGooglePlacesLanguageCode(language) {
  return googlePlacesLanguageCodes.has(language) ? language : 'en';
}

function getCountrySearchProfile(preset) {
  if (!preset) return countrySearchProfiles.RO;
  if (countrySearchProfiles[preset.code]) return countrySearchProfiles[preset.code];
  if (preset.code?.startsWith('RU-')) return {
    ...countrySearchProfiles.RU,
    searchHabits: [...countrySearchProfiles.RU.searchHabits, 'regional Caucasus/Volga city focus', 'use Russian plus regional wording when available'],
  };
  return {
    languageCode: 'en',
    languages: ['English', 'local language'],
    searchHabits: ['local-language keywords first', 'start from largest city', 'prefer phone/website/Instagram signals'],
    instagramHabits: ['boutique', 'shop', 'WhatsApp', 'local baby/kids clothing words'],
  };
}

function buildCountryPresetPayload(preset) {
  const searchProfile = getCountrySearchProfile(preset);
  return {
    code: preset.code,
    name: preset.name,
    cities: preset.cities,
    queries: preset.queries,
    languageHints: {
      googleLanguageCode: searchProfile.languageCode,
      languages: searchProfile.languages,
      searchHabits: searchProfile.searchHabits,
      instagramHabits: searchProfile.instagramHabits,
    },
  };
}

const pilotDefaults = {
  name: 'Romanya Bükreş Bebek/Çocuk Giyim Mağazası',
  country: 'Romania',
  city: 'Bucharest',
  language: 'en',
  keywordGroup: 'baby/kids retail',
  sourceKeyword: 'baby clothing store',
  query: 'baby clothing store Bucharest',
  sourceType: 'GOOGLE_PLACES',
  maxResults: 50,
};

const instagramDefaults = {
  country: 'Bulgaria',
  city: 'Varna',
  query: 'baby kids clothing boutique Varna instagram',
  sourceKeyword: 'baby kids clothing boutique',
  maxResults: 20,
};

const runSummaryCacheKey = 'melisaLeadFinder.runSummaries.v1';

function makeRunCacheKey(run) {
  if (run.id) return `run:${run.id}`;
  if (run.taskId && run.ranAt) return `task-run:${run.taskId}:${run.ranAt}`;
  return [run.country, run.city || '', run.sourceType, run.query].join('|').toLowerCase();
}

function readRunSummaryCache() {
  try {
    return JSON.parse(window.localStorage.getItem(runSummaryCacheKey) || '{}');
  } catch {
    return {};
  }
}

function writeRunSummaryCache(summary) {
  try {
    const cache = readRunSummaryCache();
    const cachedSummary = {
      ...summary,
      cachedAt: new Date().toISOString(),
    };
    cache[makeRunCacheKey(summary)] = cachedSummary;
    if (summary.country && summary.sourceType && summary.query) {
      cache[[summary.country, summary.city || '', summary.sourceType, summary.query].join('|').toLowerCase()] = cachedSummary;
    }
    const entries = Object.entries(cache).slice(-40);
    window.localStorage.setItem(runSummaryCacheKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Local storage is optional; history still works without it.
  }
}

function getErrorMessage(error) {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.details?.length) {
      return parsed.details.map((detail) => `${detail.path}: ${detail.message}`).join(', ');
    }
    return parsed.error || error.message;
  } catch {
    return error.message || 'Beklenmeyen hata oluştu';
  }
}

function normalizePhoneForLink(phone) {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

function normalizePhoneForWhatsApp(phone) {
  return normalizePhoneForLink(phone).replace(/^\+/, '');
}

function formatPopulation(value) {
  if (!value) return '-';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value / 1_000_000);
}

function formatUsd(value) {
  if (!value) return '-';
  return new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function listToText(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function textToList(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(items) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
}

function buildAutomaticSearchPlan(taskForm, selectedPreset, aiSearchPlan) {
  const city = taskForm.city || aiSearchPlan?.primaryCity || selectedPreset?.cities?.[0] || '';
  const isInstagram = taskForm.sourceType === 'INSTAGRAM';
  const keywords = uniqueList([
    ...(aiSearchPlan?.keywords || []),
    ...(aiSearchPlan?.localKeywords || []),
    ...(isInstagram ? instagramSearchKeywords : automaticSearchKeywords),
    ...(selectedPreset?.queries || []),
  ]);
  const queries = isInstagram
    ? keywords.flatMap((keyword) => (city ? [`${keyword} ${city}`, `${keyword} ${city} instagram`] : [`${keyword} instagram`]))
    : keywords.flatMap((keyword) => (
      city ? [`${keyword} ${city}`, `${keyword} near ${city} center`] : [keyword]
    ));
  const primaryKeyword = keywords[0] || 'baby clothing store';
  const primaryQuery = city ? `${primaryKeyword} ${city}${isInstagram ? ' instagram' : ''}` : primaryKeyword;
  const groupLabel = keywordGroups[taskForm.keywordGroup] || 'Bebek/Cocuk Giyim Magazasi';

  return {
    city,
    keywords,
    queries,
    primaryKeyword,
    primaryQuery,
    name: [taskForm.country, city, groupLabel, isInstagram ? 'Instagram Arama' : 'Akilli Arama'].filter(Boolean).join(' '),
    sourceType: taskForm.sourceType,
    channelLabel: isInstagram ? 'Instagram satis profili' : 'Google magaza',
    channelGoal: isInstagram
      ? 'Instagram uzerinden satis yapan sanal magaza, butik ve WhatsApp siparis profilleri aranir.'
      : 'Google uzerinde fiziksel bebek/cocuk giyim magazasi, butik ve perakendeci aranir.',
    provider: aiSearchPlan?.provider || 'LOCAL_PRESET',
    summary: aiSearchPlan?.summary || '',
    recommendedCities: aiSearchPlan?.recommendedCities || [],
    searchStrategy: aiSearchPlan?.searchStrategy || [],
    exclusions: aiSearchPlan?.exclusions || [],
    confidence: aiSearchPlan?.confidence,
    aiError: aiSearchPlan?.aiError,
  };
}

export default function App() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, hot: 0, review: 0, converted: 0 });
  const [tasks, setTasks] = useState([]);
  const [providers, setProviders] = useState({});
  const [companyProfile, setCompanyProfile] = useState(null);
  const [activeView, setActiveView] = useState('leads');
  const [selectedLead, setSelectedLead] = useState(null);
  const [filters, setFilters] = useState({ country: '', city: '', minScore: '', q: '', status: '', sourceTypes: '' });
  const [taskForm, setTaskForm] = useState(pilotDefaults);
  const [instagramForm, setInstagramForm] = useState(instagramDefaults);
  const [instagramLeads, setInstagramLeads] = useState([]);
  const [instagramSummary, setInstagramSummary] = useState(null);
  const [instagramAiPlan, setInstagramAiPlan] = useState(null);
  const [isPlanningInstagramSearch, setIsPlanningInstagramSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isRunningInstagramSearch, setIsRunningInstagramSearch] = useState(false);
  const [instagramRunStatus, setInstagramRunStatus] = useState('');
  const [possibleMatches, setPossibleMatches] = useState([]);
  const [isLoadingPossibleMatches, setIsLoadingPossibleMatches] = useState(false);
  const [isSavingCompanyProfile, setIsSavingCompanyProfile] = useState(false);
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTest, setGeminiTest] = useState(null);
  const [runningTaskId, setRunningTaskId] = useState(null);
  const [updatingLeadStatus, setUpdatingLeadStatus] = useState(null);
  const [updatingLeadFeedback, setUpdatingLeadFeedback] = useState(null);
  const [analyzingLeadId, setAnalyzingLeadId] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [lastRunSummary, setLastRunSummary] = useState(null);
  const [runResultFilter, setRunResultFilter] = useState('all');
  const [instagramRunResultFilter, setInstagramRunResultFilter] = useState('all');
  const [selectedPresetCode, setSelectedPresetCode] = useState('RO');
  const [aiSearchPlan, setAiSearchPlan] = useState(null);
  const [aiProcessStrategy, setAiProcessStrategy] = useState(null);
  const [aiLearningSummary, setAiLearningSummary] = useState(null);
  const [isPlanningSearch, setIsPlanningSearch] = useState(false);
  const [isLoadingProcessStrategy, setIsLoadingProcessStrategy] = useState(false);
  const [searchHistory, setSearchHistory] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [safety, setSafety] = useState(null);
  const mapElementRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const instagramAbortRef = useRef(null);

  const hotLeads = useMemo(() => leads.filter((lead) => lead.leadScore >= 80 || lead.status === 'HOT'), [leads]);
  const uniqueInstagramLeads = useMemo(() => {
    const byKey = new Map();
    for (const lead of instagramLeads) {
      const key = lead.instagram || lead.displayName || lead.id;
      const current = byKey.get(key);
      if (!current || (lead.leadScore || 0) > (current.leadScore || 0)) byKey.set(key, lead);
    }
    return [...byKey.values()];
  }, [instagramLeads]);
  const hotInstagramLeads = useMemo(() => uniqueInstagramLeads.filter((lead) => lead.leadScore >= 80 || lead.status === 'HOT'), [uniqueInstagramLeads]);
  const likedInstagramLeads = useMemo(() => uniqueInstagramLeads.filter((lead) => lead.userFeedback === 'LIKED'), [uniqueInstagramLeads]);
  const instagramRunResults = useMemo(() => {
    const results = instagramSummary?.searchedResults || [];
    const byKey = new Map();
    for (const result of results) {
      const key = result.instagram || result.id || `${result.companyName}-${result.city}-${result.sourceQuery}`;
      if (!byKey.has(key)) byKey.set(key, result);
    }
    return [...byKey.values()];
  }, [instagramSummary]);
  const filteredInstagramRunResults = useMemo(() => {
    if (instagramRunResultFilter === 'all') return instagramRunResults;
    return instagramRunResults.filter((result) => result.status === instagramRunResultFilter);
  }, [instagramRunResultFilter, instagramRunResults]);
  const selectedPreset = useMemo(
    () => balkanCountryPresets.find((preset) => preset.code === selectedPresetCode),
    [selectedPresetCode],
  );
  const selectedMarketProfile = selectedPreset ? countryMarketProfiles[selectedPreset.code] : null;
  const activeLearningSnapshot = aiProcessStrategy?.learningSnapshot || aiLearningSummary?.snapshot || null;
  const selectedSearchProfile = useMemo(
    () => getCountrySearchProfile(selectedPreset),
    [selectedPreset],
  );
  const selectedInstagramPreset = useMemo(
    () => balkanCountryPresets.find((preset) => preset.name === instagramForm.country) || selectedPreset,
    [instagramForm.country, selectedPreset],
  );
  const selectedInstagramMarketProfile = selectedInstagramPreset ? countryMarketProfiles[selectedInstagramPreset.code] : null;
  const selectedInstagramSearchProfile = useMemo(
    () => getCountrySearchProfile(selectedInstagramPreset),
    [selectedInstagramPreset],
  );
  const automaticSearchPlan = useMemo(
    () => buildAutomaticSearchPlan(taskForm, selectedPreset, aiSearchPlan),
    [taskForm.country, taskForm.city, taskForm.keywordGroup, taskForm.sourceType, selectedPreset, aiSearchPlan],
  );
  const selectedFilterPreset = useMemo(
    () => balkanCountryPresets.find((preset) => preset.name === filters.country),
    [filters.country],
  );
  const currentFilterQuery = useMemo(() => (
    new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '')).toString()
  ), [filters]);
  const activeLeadFilters = useMemo(() => ([
    filters.q ? { key: 'q', label: `Arama: ${filters.q}` } : null,
    filters.country ? { key: 'country', label: `Ulke: ${filters.country}`, clear: { country: '', city: '' } } : null,
    filters.city ? { key: 'city', label: `Sehir: ${filters.city}` } : null,
    filters.minScore ? { key: 'minScore', label: `Skor: ${filters.minScore}+` } : null,
    filters.sourceTypes ? { key: 'sourceTypes', label: `Kaynak: ${filters.sourceTypes.includes('INSTAGRAM') ? 'Instagram musterileri' : sourceTypeLabels[filters.sourceTypes] || filters.sourceTypes}` } : null,
    filters.status ? { key: 'status', label: `Durum: ${statusLabels[filters.status] || filters.status}` } : null,
  ].filter(Boolean)), [filters]);
  const coverageByCountry = useMemo(() => coverage.reduce((acc, item) => {
    acc[item.country] = item;
    return acc;
  }, {}), [coverage]);
  const selectedLeadPhone = selectedLead?.internationalPhoneNumber || selectedLead?.phone || '';
  const selectedLeadPhoneHref = selectedLeadPhone ? `tel:${normalizePhoneForLink(selectedLeadPhone)}` : '';
  const selectedLeadWhatsappHref = selectedLeadPhone
    ? `https://wa.me/${normalizePhoneForWhatsApp(selectedLeadPhone)}`
    : '';
  const pageTitle = activeView === 'settings'
    ? 'AI Ayarlari'
    : activeView === 'instagram'
      ? 'Instagram Musteri Bul'
      : activeView === 'allLeads'
        ? 'Lead Havuzu'
        : 'Google Magaza Bul';
  const pageDescription = activeView === 'settings'
    ? 'Firma bilgilerini, hedef musteri profilini ve Gemini AI baglantisini yonet.'
    : activeView === 'instagram'
      ? 'Instagramda satis yapan bebek/cocuk giyim butiklerini, WhatsApp siparis profillerini ve sanal magazalari bul.'
      : activeView === 'allLeads'
        ? 'Tum lead havuzunu filtrele, detaylarini incele ve Gemini icin begeni verisi topla.'
        : 'Google ile fiziksel bebek/cocuk giyim magazalarini, butiklerini ve potansiyel toptan alicilari bul.';

  async function refresh(nextFilters = filters) {
    const query = new URLSearchParams(Object.entries(nextFilters).filter(([, value]) => value !== '')).toString();
    const [leadsData, statsData, tasksData, historyData, coverageData, safetyData] = await Promise.all([
      apiGet(`/leads${query ? `?${query}` : ''}`),
      apiGet('/leads/stats'),
      apiGet('/search-tasks'),
      apiGet('/search-tasks/history?take=15'),
      apiGet('/search-tasks/coverage?sourceType=GOOGLE_PLACES'),
      apiGet('/search-tasks/safety'),
    ]);
    setLeads(leadsData);
    setStats(statsData);
    setTasks(tasksData);
    setRunHistory(historyData);
    setCoverage(coverageData);
    setSafety(safetyData);
    setSelectedLead((current) => leadsData.find((lead) => lead.id === current?.id) || leadsData[0] || null);
  }

  async function refreshInstagramLeads() {
    const params = new URLSearchParams({
      sourceTypes: 'INSTAGRAM,INSTAGRAM_APIFY,APIFY',
      ...(instagramForm.country ? { country: instagramForm.country } : {}),
      ...(instagramForm.city ? { city: instagramForm.city } : {}),
    }).toString();
    const data = await apiGet(`/leads?${params}`);
    setInstagramLeads(data);
    return data;
  }

  useEffect(() => {
    Promise.all([
      refresh(),
      refreshInstagramLeads(),
      apiGet('/providers').then(setProviders),
      apiGet('/ai/company-profile').then(setCompanyProfile),
      loadAiLearningSummary(selectedPreset?.name),
    ])
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!mapElementRef.current || leafletMapRef.current) return undefined;

    const map = L.map(mapElementRef.current, {
      center: [46.5, 43],
      zoom: 4,
      minZoom: 3,
      maxZoom: 12,
      scrollWheelZoom: true,
      worldCopyJump: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    leafletMapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      leafletMapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = leafletMapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    balkanCountryPresets.forEach((preset) => {
      const coverageItem = coverageByCountry[preset.name];
      const completedCities = coverageItem?.cities?.filter((city) => city.completedRuns > 0).length || 0;
      const isSelected = selectedPresetCode === preset.code;
      const icon = L.divIcon({
        className: `leaflet-country-marker-shell ${isSelected ? 'selected' : ''}`,
        html: `
          <span class="leaflet-country-marker">
            <span class="leaflet-country-flag"><img src="${preset.flagImage}" alt="" /></span>
            <span class="leaflet-country-label">${preset.name}<small>${completedCities}/${preset.cities.length}</small></span>
          </span>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      L.marker(preset.coordinates, { icon, title: preset.name })
        .addTo(layer)
        .on('click', () => applyCountryPreset(preset));
    });
  }, [coverageByCountry, selectedPresetCode]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !selectedPreset?.coordinates) return;
    map.flyTo(selectedPreset.coordinates, Math.max(map.getZoom(), 6), { duration: 0.45 });
    loadAiLearningSummary(selectedPreset.name).catch(() => null);
  }, [selectedPresetCode]);

  useEffect(() => {
    if (!taskForm.country || !automaticSearchPlan.primaryQuery) {
      setSearchHistory(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        country: taskForm.country,
        query: automaticSearchPlan.primaryQuery,
        sourceType: taskForm.sourceType,
        ...(taskForm.city ? { city: taskForm.city } : {}),
      }).toString();

      apiGet(`/search-tasks/history/check?${params}`)
        .then(setSearchHistory)
        .catch(() => setSearchHistory(null));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [taskForm.country, taskForm.city, automaticSearchPlan.primaryQuery, taskForm.sourceType]);

  function updateTaskForm(patch) {
    const next = { ...taskForm, ...patch };
    const keyword = patch.sourceKeyword ?? next.sourceKeyword;
    const city = patch.city ?? next.city;
    if (patch.sourceKeyword !== undefined || patch.city !== undefined) {
      next.query = [keyword, city].filter(Boolean).join(' ');
      next.name = [next.country, city, keywordGroups[next.keywordGroup] || next.keywordGroup].filter(Boolean).join(' ');
    }
    setTaskForm(next);
  }

  function updateInstagramForm(patch) {
    const next = { ...instagramForm, ...patch };
    const keyword = patch.sourceKeyword ?? next.sourceKeyword;
    const city = patch.city ?? next.city;
    if (patch.sourceKeyword !== undefined || patch.city !== undefined) {
      next.query = [keyword, city, 'instagram'].filter(Boolean).join(' ');
    }
    setInstagramForm(next);
  }

  function applyInstagramPreset(preset) {
    const searchProfile = getCountrySearchProfile(preset);
    const city = preset.cities[0];
    const sourceKeyword = searchProfile.instagramHabits?.[0]
      || preset.queries.find((query) => !query.includes('baby clothing store') && !query.includes('kids clothing store'))
      || preset.queries[0]
      || 'baby clothing shop';
    setInstagramAiPlan(null);
    setInstagramSummary(null);
    setInstagramForm((current) => ({
      ...current,
      country: preset.name,
      city,
      sourceKeyword,
      query: sourceKeyword,
    }));
  }

  async function loadInstagramAiPlan() {
    const preset = selectedInstagramPreset || balkanCountryPresets.find((item) => item.name === instagramForm.country);
    if (!preset) {
      setError('Instagram AI plani icin once desteklenen bir ulke secilmeli');
      return null;
    }
    setError(null);
    setMessage(null);
    setInstagramAiPlan(null);
    setIsPlanningInstagramSearch(true);
    try {
      const plan = await apiPost('/instagram/search-plan/gemini', {
        country: preset.name,
        city: instagramForm.city || preset.cities[0],
        targetCustomerType: 'Instagram online baby/kids clothing sellers, boutiques, WhatsApp order stores',
        productCategory: 'baby and kids clothing',
        maxQueries: 10,
        maxResults: Number(instagramForm.maxResults || 60),
      });
      setInstagramAiPlan(plan);
      const firstQuery = plan.searchQueries?.find((item) => item.searchType === 'user') || plan.searchQueries?.[0];
      const firstCity = plan.cityFocus?.[0] || instagramForm.city || preset.cities[0];
      if (firstQuery) {
        setInstagramForm((current) => ({
          ...current,
          country: preset.name,
          city: firstCity,
          sourceKeyword: `${firstQuery.searchType}: ${firstQuery.query}`,
          query: firstQuery.query,
          maxResults: plan.maxResultsPerQuery || current.maxResults,
        }));
      }
      setMessage(plan.provider === 'GEMINI' ? 'Gemini Instagram arama kriterleri hazir' : 'Yerel Instagram arama kriterleri hazir');
      return plan;
    } catch (err) {
      setError(getErrorMessage(err));
      return null;
    } finally {
      setIsPlanningInstagramSearch(false);
    }
  }

  function getInstagramPlanQueries(plan = instagramAiPlan) {
    const plannedQueries = plan?.searchQueries?.length
      ? plan.searchQueries
      : [{
        query: instagramForm.query,
        searchType: 'user',
        priority: 'high',
        reason: 'Formdaki manuel Instagram sorgusu.',
      }];
    const seen = new Set();
    return plannedQueries
      .map((item) => ({
        ...item,
        query: String(item.query || '').trim(),
        searchType: ['user', 'place'].includes(item.searchType || 'user') ? item.searchType || 'user' : 'user',
      }))
      .filter((item) => {
        if (!item.query) return false;
        const key = `${item.searchType}:${item.query.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, plan?.maxQueries || 10);
  }

  function updateInstagramPlanQuery(index, patch) {
    setInstagramAiPlan((current) => {
      if (!current?.searchQueries) return current;
      const searchQueries = current.searchQueries.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      ));
      return { ...current, searchQueries };
    });
  }

  function removeInstagramPlanQuery(index) {
    setInstagramAiPlan((current) => {
      if (!current?.searchQueries) return current;
      const searchQueries = current.searchQueries.filter((_, itemIndex) => itemIndex !== index);
      return { ...current, searchQueries };
    });
  }

  function addInstagramPlanQuery() {
    setInstagramAiPlan((current) => {
      const fallbackPlan = current || {
        provider: 'MANUAL',
        summary: 'Manuel Instagram arama plani',
        audienceDefinition: 'Bebek/cocuk giyim odakli Instagram profil aramasi.',
        searchQueries: [],
        maxResultsPerQuery: Number(instagramForm.maxResults || 5),
        confidence: 0.5,
      };
      const nextQuery = instagramForm.query || `${instagramForm.sourceKeyword || 'bebek giyim'} ${instagramForm.city || ''}`.trim();
      return {
        ...fallbackPlan,
        searchQueries: [
          ...(fallbackPlan.searchQueries || []),
          {
            query: nextQuery,
            searchType: 'user',
            priority: 'medium',
            intent: 'manual_profile_discovery',
            reason: 'Kullanici tarafindan plana eklendi.',
          },
        ],
      };
    });
  }

  function selectInstagramPlanQuery(item) {
    setInstagramForm((current) => ({
      ...current,
      sourceKeyword: `${item.searchType || 'user'}: ${item.query}`,
      query: item.query,
      maxResults: instagramAiPlan?.maxResultsPerQuery || current.maxResults,
    }));
  }

  async function runInstagramPanelSearch(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setInstagramSummary(null);
    setInstagramRunResultFilter('all');
    setIsRunningInstagramSearch(true);
    setInstagramRunStatus('Instagram arama plani hazirlaniyor...');
    const controller = new AbortController();
    instagramAbortRef.current = controller;
    try {
      const activePlan = instagramAiPlan || await loadInstagramAiPlan();
      if (!activePlan) return;
      const queries = getInstagramPlanQueries(activePlan);
      if (!queries.length) {
        setError('Calistirilacak Instagram sorgusu kalmadi. Yeni plan olustur veya manuel sorgu ekle.');
        return;
      }
      const summaries = [];
      for (const [index, item] of queries.entries()) {
        if (controller.signal.aborted) break;
        setInstagramRunStatus(`${index + 1}/${queries.length} sorgu calisiyor: ${item.query}`);
        const created = await apiPost('/search-tasks', {
          name: `${instagramForm.country} ${instagramForm.city} Instagram ${item.query}`,
          country: instagramForm.country,
          city: instagramForm.city,
          language: 'auto',
          keywordGroup: 'instagram baby/kids retail',
          sourceKeyword: `${item.searchType || 'user'}: ${item.query}`,
          query: item.query,
          sourceType: 'INSTAGRAM_APIFY',
          maxResults: Number(activePlan?.maxResultsPerQuery || instagramForm.maxResults),
          allowDuplicate: true,
        }, { signal: controller.signal, timeoutMs: 30000 });
        const runSummary = await apiPost(`/search-tasks/${created.id}/run`, {}, { signal: controller.signal, timeoutMs: 75000 });
        const liveRunSummary = { ...runSummary, summarySource: 'live' };
        writeRunSummaryCache(liveRunSummary);
        summaries.push(liveRunSummary);
      }
      const summary = summaries.reduce((acc, item) => ({
        foundCount: acc.foundCount + (item.foundCount || 0),
        createdCount: acc.createdCount + (item.createdCount || 0),
        duplicateCount: acc.duplicateCount + (item.duplicateCount || 0),
        errorCount: acc.errorCount + (item.errorCount || 0),
        searchedResults: [...(acc.searchedResults || []), ...(item.searchedResults || [])].slice(0, 80),
        bestLeads: [...(acc.bestLeads || []), ...(item.bestLeads || [])].sort((a, b) => b.leadScore - a.leadScore).slice(0, 8),
      }), { foundCount: 0, createdCount: 0, duplicateCount: 0, errorCount: 0, searchedResults: [], bestLeads: [] });
      setInstagramSummary({ ...summary, ranQueries: queries, summarySource: 'live' });
      await Promise.all([refresh(), refreshInstagramLeads(), loadAiLearningSummary(instagramForm.country)]);
      setMessage(`${queries.length} Instagram sorgusu calisti, ${summary.foundCount || 0} profil bulundu, ${summary.createdCount || 0} yeni lead eklendi`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsRunningInstagramSearch(false);
      setInstagramRunStatus('');
      instagramAbortRef.current = null;
    }
  }

  function stopInstagramSearch() {
    instagramAbortRef.current?.abort();
    setInstagramRunStatus('Arama durduruluyor...');
  }

  function getAutomaticTaskPayload(overrides = {}) {
    return {
      ...taskForm,
      name: automaticSearchPlan.name,
      city: automaticSearchPlan.city,
      keywordGroup: 'baby/kids retail',
      language: getGooglePlacesLanguageCode(taskForm.language),
      sourceKeyword: automaticSearchPlan.primaryKeyword,
      query: automaticSearchPlan.primaryQuery,
      maxResults: Number(taskForm.maxResults),
      ...overrides,
    };
  }

  async function loadAiSearchPlan(preset) {
    if (!preset) return null;
    setIsPlanningSearch(true);
    setAiSearchPlan(null);
    try {
      const plan = await apiPost('/ai/search-plan', {
        countryPreset: buildCountryPresetPayload(preset),
        marketProfile: countryMarketProfiles[preset.code] || null,
      });
      setAiSearchPlan(plan);
      if (plan.primaryCity && preset.cities.includes(plan.primaryCity)) {
        const primaryKeyword = plan.keywords?.[0] || plan.localKeywords?.[0] || preset.queries[0] || 'baby clothing store';
        setTaskForm((current) => ({
          ...current,
          city: plan.primaryCity,
          maxResults: plan.maxResults || current.maxResults,
          sourceKeyword: primaryKeyword,
          query: `${primaryKeyword} ${plan.primaryCity}`,
          name: `${preset.name} ${plan.primaryCity} ${keywordGroups[current.keywordGroup] || current.keywordGroup}`,
        }));
      }
      return plan;
    } catch (err) {
      setError(getErrorMessage(err));
      return null;
    } finally {
      setIsPlanningSearch(false);
    }
  }

  async function loadAiProcessStrategy() {
    if (!selectedPreset) {
      setError('Gemini surec stratejisi icin once haritadan desteklenen bir ulke secilmeli');
      return null;
    }
    setError(null);
    setMessage(null);
    setIsLoadingProcessStrategy(true);
    try {
      const strategy = await apiPost('/ai/process-strategy', {
        countryPreset: buildCountryPresetPayload(selectedPreset),
        marketProfile: selectedMarketProfile || null,
      });
      setAiProcessStrategy(strategy);
      setMessage(strategy.provider === 'GEMINI' ? `${selectedPreset.name} icin Gemini surec stratejisi hazir` : `${selectedPreset.name} icin yerel surec stratejisi hazir`);
      return strategy;
    } catch (err) {
      setError(getErrorMessage(err));
      return null;
    } finally {
      setIsLoadingProcessStrategy(false);
    }
  }

  async function loadAiLearningSummary(country = selectedPreset?.name || taskForm.country) {
    if (!country) return null;
    const params = new URLSearchParams({ country }).toString();
    const summary = await apiGet(`/ai/learning-summary?${params}`);
    setAiLearningSummary(summary);
    return summary;
  }

  function applyCountryPreset(preset) {
    const city = preset.cities[0];
    const sourceKeyword = preset.queries[0];
    const searchProfile = getCountrySearchProfile(preset);
    setSelectedPresetCode(preset.code);
    setAiSearchPlan(null);
    setAiProcessStrategy(null);
    setTaskForm({
      ...taskForm,
      name: `${preset.name} ${city} ${keywordGroups[taskForm.keywordGroup] || taskForm.keywordGroup}`,
      country: preset.name,
      city,
      language: getGooglePlacesLanguageCode(searchProfile.languageCode),
      sourceKeyword,
      query: `${sourceKeyword} ${city}`,
      sourceType: providers.GOOGLE_PLACES?.configured ? 'GOOGLE_PLACES' : 'DEMO',
    });
    setMessage(`${preset.name} arama kriterleri forma yüklendi`);
    setError(null);
    loadAiSearchPlan(preset).then((plan) => {
      if (plan) setMessage(`${preset.name} icin AI arama plani hazir`);
    });
  }

  function setPresetCity(city) {
    const sourceKeyword = aiSearchPlan?.localKeywords?.[0] || aiSearchPlan?.keywords?.[0] || selectedPreset?.queries?.[2] || taskForm.sourceKeyword || selectedPreset?.queries[0] || 'baby clothing store';
    updateTaskForm({
      city,
      query: `${sourceKeyword} ${city}`,
      name: `${taskForm.country} ${city} ${keywordGroups[taskForm.keywordGroup] || taskForm.keywordGroup}`,
    });
  }

  function setPresetKeyword(sourceKeyword) {
    updateTaskForm({
      sourceKeyword,
      query: `${sourceKeyword} ${taskForm.city}`,
    });
  }

  async function createTask(event) {
    event.preventDefault();
    const allowDuplicate = Boolean(searchHistory?.hasExistingTask);
    if (allowDuplicate) {
      const confirmed = window.confirm('Bu arama için mevcut bir görev var. Yine de yeni görev oluşturulsun mu?');
      if (!confirmed) return;
    }
    setError(null);
    setMessage(null);
    setLastRunSummary(null);
    setIsCreatingTask(true);
    try {
      await apiPost('/search-tasks', getAutomaticTaskPayload({ allowDuplicate }));
      await Promise.all([
        refresh(),
        loadAiLearningSummary(task.country || selectedPreset?.name || taskForm.country),
      ]);
      setMessage('Arama görevi oluşturuldu');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreatingTask(false);
    }
  }

  async function runTask(id) {
    setError(null);
    setMessage(null);
    setLastRunSummary(null);
    setRunResultFilter('all');
    setRunningTaskId(id);
    try {
      const task = await apiPost(`/search-tasks/${id}/run`, {});
      const liveSummary = { ...task, summarySource: 'live' };
      setLastRunSummary(liveSummary);
      writeRunSummaryCache(liveSummary);
      await refresh();
      setMessage(`${task.foundCount || 0} sonuç bulundu, ${task.createdCount || 0} yeni lead eklendi, ${task.duplicateCount || 0} tekrar atlandı`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunningTaskId(null);
    }
  }

  async function createAndRunSmartSearch(event) {
    event.preventDefault();
    const allowDuplicate = Boolean(searchHistory?.alreadyCompleted || searchHistory?.hasExistingTask);
    if (allowDuplicate) {
      const confirmed = window.confirm('Bu arama daha önce tamamlandı. Duplicate korumasıyla tekrar çalıştırılsın mı?');
      if (!confirmed) return;
    }
    setError(null);
    setMessage(null);
    setLastRunSummary(null);
    setIsCreatingTask(true);
    try {
      const created = await apiPost('/search-tasks', getAutomaticTaskPayload({ sourceType: taskForm.sourceType, allowDuplicate }));
      await refresh();
      await runTask(created.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreatingTask(false);
    }
  }

  async function updateLeadStatus(id, status) {
    setError(null);
    setMessage(null);
    setUpdatingLeadStatus(status);
    try {
      const updated = await apiPatch(`/leads/${id}`, { status });
      setSelectedLead(updated);
      await refresh();
      setMessage(`Lead durumu güncellendi: ${statusLabels[status]}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUpdatingLeadStatus(null);
    }
  }

  async function updateLeadFeedback(id, userFeedback) {
    setError(null);
    setMessage(null);
    setUpdatingLeadFeedback(id);
    try {
      const updated = await apiPatch(`/leads/${id}`, {
        userFeedback,
        userFeedbackAt: userFeedback === 'NONE' ? null : new Date().toISOString(),
      });
    setSelectedLead((current) => (current?.id === updated.id ? updated : current));
      setLeads((current) => current.map((lead) => (lead.id === updated.id ? updated : lead)));
      setInstagramLeads((current) => current.map((lead) => (lead.id === updated.id ? updated : lead)));
      loadAiLearningSummary(updated.country).catch(() => null);
      setMessage(`Lead geri bildirimi kaydedildi: ${feedbackLabels[userFeedback]}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUpdatingLeadFeedback(null);
    }
  }

  async function analyzeSelectedLead() {
    if (!selectedLead) return;
    setError(null);
    setMessage(null);
    setAnalyzingLeadId(selectedLead.id);
    try {
      const updated = await apiPost(`/leads/${selectedLead.id}/ai-analysis`, {});
      setSelectedLead(updated);
      setLeads((current) => current.map((lead) => (lead.id === updated.id ? updated : lead)));
      setMessage(updated.aiAnalysis?.provider === 'GEMINI' ? 'Gemini AI analizi tamamlandi' : 'Yerel AI analizi kaydedildi');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAnalyzingLeadId(null);
    }
  }

  function updateCompanyProfile(patch) {
    setCompanyProfile((current) => ({ ...current, ...patch }));
  }

  async function saveCompanyProfile() {
    if (!companyProfile) return;
    setError(null);
    setMessage(null);
    setIsSavingCompanyProfile(true);
    try {
      const saved = await apiPatch('/ai/company-profile', {
        companyName: companyProfile.companyName,
        description: companyProfile.description,
        productCategories: companyProfile.productCategories || [],
        targetCustomerTypes: companyProfile.targetCustomerTypes || [],
        excludedCustomerTypes: companyProfile.excludedCustomerTypes || [],
        targetCountries: companyProfile.targetCountries || [],
        valueProposition: companyProfile.valueProposition,
        salesTone: companyProfile.salesTone,
        minimumOrderNote: companyProfile.minimumOrderNote || null,
        outreachLanguage: companyProfile.outreachLanguage || 'tr',
      });
      setCompanyProfile(saved);
      setMessage('AI firma hafizasi kaydedildi');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSavingCompanyProfile(false);
    }
  }

  async function testGemini() {
    setIsTestingGemini(true);
    setGeminiTest(null);
    setError(null);
    setMessage(null);
    try {
      const result = await apiPost('/ai/gemini/test', {});
      setGeminiTest(result);
      setMessage('Gemini baglantisi dogrulandi');
    } catch (err) {
      const text = getErrorMessage(err);
      setGeminiTest({ ok: false, error: text });
      setError(text);
    } finally {
      setIsTestingGemini(false);
    }
  }

  async function copyLeadPhone() {
    const phone = selectedLead?.internationalPhoneNumber || selectedLead?.phone;
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      setMessage('Telefon numarası kopyalandı');
      setError(null);
    } catch {
      setError('Telefon numarası kopyalanamadı');
    }
  }

  async function applyFilters() {
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      await refresh(filters);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function clearFilters() {
    const emptyFilters = { country: '', city: '', minScore: '', q: '', status: '', sourceTypes: '' };
    setFilters(emptyFilters);
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      await refresh(emptyFilters);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  function setCountryFilter(country) {
    const preset = balkanCountryPresets.find((item) => item.name === country);
    applyLeadFilterPatch({
      ...filters,
      country,
      city: preset?.cities.includes(filters.city) ? filters.city : '',
    });
  }

  function applyLeadFilterPatch(nextFilters) {
    setFilters(nextFilters);
    setIsLoading(true);
    refresh(nextFilters)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }

  function showHotLeads() {
    applyLeadFilterPatch({ ...filters, minScore: '80', status: '' });
  }

  function clearLeadFilter(filter) {
    const nextFilters = {
      ...filters,
      ...(filter.clear || { [filter.key]: '' }),
    };
    applyLeadFilterPatch(nextFilters);
  }

  function selectRunResult(result) {
    if (!result?.id) return;
    const lead = leads.find((item) => item.id === result.id);
    selectLead(lead || result);
    setActiveView('allLeads');
  }

  async function selectLead(lead) {
    if (!lead?.id) {
      setSelectedLead(lead || null);
      setPossibleMatches([]);
      return;
    }
    setSelectedLead(lead);
    setPossibleMatches([]);
    setIsLoadingPossibleMatches(true);
    try {
      const [detail, matches] = await Promise.all([
        apiGet(`/leads/${lead.id}`),
        apiGet(`/leads/${lead.id}/possible-matches`),
      ]);
      setSelectedLead(detail);
      setPossibleMatches(matches);
    } catch {
      setSelectedLead(lead);
      setPossibleMatches([]);
    } finally {
      setIsLoadingPossibleMatches(false);
    }
  }

  function compactLeadForRunView(lead, status = 'found') {
    return {
      id: lead.id,
      googlePlaceId: lead.googlePlaceId,
      companyName: lead.companyName,
      country: lead.country,
      city: lead.city,
      phone: lead.internationalPhoneNumber || lead.phone,
      website: lead.website,
      instagram: lead.instagram,
      googleMapsUrl: lead.googleMapsUrl,
      rating: lead.rating,
      userRatingsTotal: lead.userRatingsTotal,
      leadScore: lead.leadScore,
      businessStatus: lead.businessStatus,
      sourceQuery: lead.sourceQuery,
      sourceKeyword: lead.sourceKeyword,
      status,
    };
  }

  function getRunResultsByFilter(summary) {
    const results = summary?.searchedResults || [];
    if (runResultFilter === 'all') return results;
    return results.filter((result) => result.status === runResultFilter);
  }

  function countRunResultsByStatus(summary, status) {
    const results = summary?.searchedResults || [];
    if (status === 'all') return results.length;
    return results.filter((result) => result.status === status).length;
  }

  function countResultsByStatus(results, status) {
    if (status === 'all') return results.length;
    return results.filter((result) => result.status === status).length;
  }

  async function showRunSummary(run) {
    setError(null);
    setMessage(null);
    setRunResultFilter('all');
    try {
      const persistedResults = Array.isArray(run.searchedResults) ? run.searchedResults : [];
      if (persistedResults.length > 0) {
        const summary = {
          ...run,
          summarySource: 'persisted',
          createdCount: run.createdCount || 0,
          targetFilteredCount: run.targetFilteredCount || 0,
          searchedResults: persistedResults,
          bestLeads: Array.isArray(run.bestLeads) ? run.bestLeads : persistedResults
            .filter((lead) => lead.id && lead.leadScore)
            .sort((a, b) => b.leadScore - a.leadScore)
            .slice(0, 5),
          historyNote: null,
        };
        setLastRunSummary(summary);
        writeRunSummaryCache(summary);
        setFilters((current) => ({
          ...current,
          country: run.country,
          city: run.city || '',
        }));
        setMessage(`${run.country} ${run.city || ''} aramasinin kendi sonuc listesi acildi`);
        return;
      }

      const cachedSummary = readRunSummaryCache()[makeRunCacheKey(run)];
      if (cachedSummary) {
        setLastRunSummary({ ...cachedSummary, summarySource: cachedSummary.summarySource || 'cache' });
        setFilters((current) => ({
          ...current,
          country: run.country,
          city: run.city || '',
        }));
        setMessage(`${run.country} ${run.city || ''} son aramasi tam ozetiyle acildi`);
        return;
      }

      const params = new URLSearchParams({
        country: run.country,
        sourceType: run.sourceType,
        ...(run.city ? { city: run.city } : {}),
      }).toString();
      const runLeads = await apiGet(`/leads?${params}`);
      const relatedLeads = runLeads
        .filter((lead) => lead.sourceQuery === run.query || lead.sourceKeyword === run.sourceKeyword)
        .sort((a, b) => b.leadScore - a.leadScore);
      setLastRunSummary({
        ...run,
        summarySource: 'estimated',
        createdCount: run.createdCount || 0,
        searchedResults: relatedLeads.slice(0, 100).map((lead) => compactLeadForRunView(lead)),
        bestLeads: relatedLeads.slice(0, 5),
        historyNote: relatedLeads.length
          ? 'Bu eski kosunun tam sonuc listesi kayitli degildi; liste arama kriterlerinden arsiv uzerinden yeniden olusturuldu.'
          : 'Bu eski aramanin detay listesi kayitli degil; bu tarihten sonraki aramalar tam ozetiyle saklanacak.',
      });
      setFilters((current) => ({
        ...current,
        country: run.country,
        city: run.city || '',
      }));
      setMessage(`${run.country} ${run.city || ''} son aramasi calisma ozetine acildi`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function showTaskSummary(task) {
    setError(null);
    setMessage(null);
    setRunResultFilter('all');
    try {
      const params = new URLSearchParams({
        country: task.country,
        ...(task.city ? { city: task.city } : {}),
      }).toString();
      const taskLeads = await apiGet(`/leads?${params}`);
      const searchedResults = taskLeads.slice(0, 100).map((lead) => compactLeadForRunView(lead));
      setLastRunSummary({
        ...task,
        summarySource: 'estimated',
        createdCount: task.insertedCount || 0,
        searchedResults,
        bestLeads: taskLeads.slice(0, 5),
      });
      setMessage(`${task.country} ${task.city || ''} arananlari calisma ozetine alindi`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">M</div>
          <div>
            <strong>Melisa</strong>
            <span>AI Lead Finder</span>
          </div>
        </div>
        <nav>
          <button className={`nav-item ${activeView === 'leads' ? 'active' : ''}`} onClick={() => setActiveView('leads')} type="button"><UsersRound size={18} /> Bul</button>
          <button className={`nav-item ${activeView === 'allLeads' ? 'active' : ''}`} onClick={() => setActiveView('allLeads')} type="button"><UsersRound size={18} /> Leadler</button>
          <button className={`nav-item ${activeView === 'instagram' ? 'active' : ''}`} onClick={() => setActiveView('instagram')} type="button"><InstagramIcon size={18} /> Instagram</button>
          <button className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')} type="button"><Settings size={18} /> Ayarlar</button>
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <h1>{pageTitle}</h1>
            <p>{pageDescription}</p>
          </div>
          {activeView === 'allLeads' && <a className="primary-link" href={exportCsvUrl(currentFilterQuery)}><Download size={17} /> CSV Disa Aktar</a>}
        </header>

        {(error || message) && <div className={`notice ${error ? 'error' : 'success'}`}>{error || message}</div>}

        {activeView === 'leads' && (
          <>
        <section className="apple-hero-panel">
          <div>
            <span className="eyebrow">Tek hedef: bebek/cocuk giyim alicisi</span>
            <h2>{selectedPreset?.name || taskForm.country} icin satis yapabilecegin magazalari bulalim.</h2>
            <p>Google fiziksel magazalari bulur, Instagram sanal satis profillerini toplar. AI sehir ve keyword planini senin icin hazirlar.</p>
          </div>
          <div className="hero-actions">
            <button disabled={isPlanningSearch} onClick={() => loadAiSearchPlan(selectedPreset)} type="button">
              <Bot size={17} /> {isPlanningSearch ? 'AI hazirlaniyor' : 'AI Plani Yenile'}
            </button>
            <button className="secondary-button" disabled={isLoadingProcessStrategy} onClick={loadAiProcessStrategy} type="button">
              <Bot size={17} /> {isLoadingProcessStrategy ? 'Gemini bakiyor' : 'Gemini Sureci Optimize Et'}
            </button>
            <button className="secondary-button" disabled={isCreatingTask || !!runningTaskId} onClick={createAndRunSmartSearch} type="button">
              <Search size={17} /> Google Magaza Bul
            </button>
            <button className="secondary-button" onClick={() => setActiveView('instagram')} type="button">
              <InstagramIcon size={17} /> Instagram Musteri Bul
            </button>
          </div>
        </section>

        {activeLearningSnapshot && (
          <section className="panel learning-status-panel">
            <div>
              <strong>AI Ogrenme Durumu</strong>
              <span>{activeLearningSnapshot.totalFeedback || 0} begeni verisi ile {selectedPreset?.name || taskForm.country} planini iyilestiriyor</span>
            </div>
            <div className="learning-status-chips">
              {(activeLearningSnapshot.likedSignals?.terms || []).slice(0, 4).map((item) => (
                <span key={`learn-term-${item.name}`}>{item.name} ({item.count})</span>
              ))}
              {(activeLearningSnapshot.google?.bestCities || []).slice(0, 2).map((city) => (
                <span key={`learn-google-city-${city}`}>Google: {city}</span>
              ))}
              {(activeLearningSnapshot.instagram?.bestKeywords || []).slice(0, 2).map((keyword) => (
                <span key={`learn-instagram-keyword-${keyword}`}>Instagram: {keyword}</span>
              ))}
              {!activeLearningSnapshot.totalFeedback && <span>Lead begenmeye basladikca burada sinyaller olusur</span>}
            </div>
          </section>
        )}

        {aiProcessStrategy && (
          <section className={`panel process-strategy-panel ${aiProcessStrategy.provider === 'GEMINI' ? 'gemini-source' : ''}`}>
            <div className="panel-header">
              <h2><Bot size={18} /> Gemini Surec Stratejisi</h2>
              <span>{selectedPreset?.name || taskForm.country} - {aiProcessStrategy.provider === 'GEMINI' ? 'Canli Gemini' : 'Yerel analiz'} - Guven %{Math.round((aiProcessStrategy.confidence || 0) * 100)}</span>
            </div>
            <div className="country-habit-strip">
              <span><strong>Dil</strong>{selectedSearchProfile.languages.join(', ')}</span>
              <span><strong>Google</strong>{selectedSearchProfile.searchHabits.slice(0, 3).join(' / ')}</span>
              <span><strong>Instagram</strong>{selectedSearchProfile.instagramHabits.slice(0, 3).join(' / ')}</span>
            </div>
            <p>{aiProcessStrategy.summary}</p>
            {aiProcessStrategy.aiError && <p className="field-note warning">{aiProcessStrategy.aiError}</p>}
            <div className="process-strategy-roles">
              <span><strong>Google</strong>{aiProcessStrategy.googleRole}</span>
              <span><strong>Instagram</strong>{aiProcessStrategy.instagramRole}</span>
            </div>
            <div className="ai-run-report-columns">
              <ReportList title="Siradaki Hamle" items={aiProcessStrategy.nextActions} />
              <ReportList title="Ogrenme Dongusu" items={aiProcessStrategy.learningLoop} />
              <ReportList title="Kota Koruma" items={aiProcessStrategy.avoidWastingQuota} />
            </div>
            <div className="ai-run-report-columns compact">
              <ReportList title="Toplanacak Veri" items={aiProcessStrategy.dataToCollect} />
              <ReportList title="Basari Olcutu" items={aiProcessStrategy.successMetrics} />
            </div>
            {activeLearningSnapshot && (
              <div className="ai-learning-snapshot">
                <div>
                  <strong>AI Ogrenme Verisi</strong>
                  <span>{activeLearningSnapshot.totalFeedback || 0} begeni verisi</span>
                </div>
                <div>
                  <strong>Begenilen Sinyaller</strong>
                  {(activeLearningSnapshot.likedSignals?.terms || []).slice(0, 5).map((item) => (
                    <span key={`liked-${item.name}`}>{item.name} ({item.count})</span>
                  ))}
                  {!(activeLearningSnapshot.likedSignals?.terms || []).length && <span>Henuz yeterli begeni sinyali yok</span>}
                </div>
                <div>
                  <strong>Google En Iyi</strong>
                  {(activeLearningSnapshot.google?.bestCities || []).slice(0, 4).map((city) => <span key={`g-city-${city}`}>{city}</span>)}
                  {(activeLearningSnapshot.google?.bestKeywords || []).slice(0, 4).map((keyword) => <span key={`g-key-${keyword}`}>{keyword}</span>)}
                </div>
                <div>
                  <strong>Instagram En Iyi</strong>
                  {(activeLearningSnapshot.instagram?.bestCities || []).slice(0, 4).map((city) => <span key={`i-city-${city}`}>{city}</span>)}
                  {(activeLearningSnapshot.instagram?.bestKeywords || []).slice(0, 4).map((keyword) => <span key={`i-key-${keyword}`}>{keyword}</span>)}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="kpi-grid">
          <Kpi title="Toplam Lead" value={stats.total} />
          <Kpi title="Sıcak Lead" value={stats.hot} icon={<Flame size={22} />} />
          <Kpi title="İncelemede" value={stats.review} />
          <Kpi title="Aktarılan" value={stats.converted} />
        </section>

        <section className="safety-panel is-hidden">
          <div className="panel-header">
            <h2>Google Places Güvenlik ve Limitler</h2>
            <span>{safety?.configured ? 'API key hazır' : 'API key eksik'}</span>
          </div>
          {safety ? (
            <div className="safety-grid">
              <Kpi title="Koşu Limiti" value={safety.maxRunResults} />
              <Kpi title="Detay Gecikmesi" value={`${safety.detailDelayMs}ms`} />
              <Kpi title="Bu Ay Koşu" value={safety.monthRuns} />
              <Kpi title="Bu Ay Sonuç" value={safety.foundCount} />
              <Kpi title="Text Search Kalan" value={safety.remainingTextSearchRequests} />
              <Kpi title="Details Kalan" value={safety.remainingPlaceDetailsRequests} />
              <Kpi title="Text Kullanım" value={`%${safety.textSearchLimitUsedPercent}`} />
              <Kpi title="Details Kullanım" value={`%${safety.placeDetailsLimitUsedPercent}`} />
              {safety.limitWarning && (
                <p className="field-note warning">
                  Google Places aylık limitlerinin %80 eşiği geçildi. Yeni aramalar otomatik olarak
                  limit kontrolünden geçirilecek.
                </p>
              )}
            </div>
          ) : (
            <div className="empty-state">Limit bilgisi yükleniyor.</div>
          )}
        </section>

        <section className="panel command-center-panel">
          <div className="panel-header command-center-header">
            <h2>Avrasya Haritası</h2>
            <span>{balkanCountryPresets.length} ülke</span>
          </div>
          <div className="country-map-layout">
            <div
              className="world-map political-map"
              aria-label="Siyasi dünya haritası"
              ref={mapElementRef}
            />
            {selectedPreset && (
              <div className="map-country-card">
                <span className="flag-frame large">
                  <img alt={`${selectedPreset.name} bayrağı`} src={selectedPreset.flagImage} />
                </span>
                <div className="preset-summary">
                  <strong>{selectedPreset.name}</strong>
                  <span>Şehirler: {selectedPreset.cities.join(', ')}</span>
                  <span>Aramalar: {selectedPreset.queries.join(' / ')}</span>
                  <span>{coverageByCountry[selectedPreset.name]?.createdCount || 0} lead eklendi</span>
                  {coverageByCountry[selectedPreset.name] && (
                    <span>Son tarama: {new Date(coverageByCountry[selectedPreset.name].lastRunAt).toLocaleString('tr-TR')}</span>
                  )}
                </div>
                {selectedMarketProfile && (
                  <div className="market-profile">
                    <div className="market-metrics">
                      <span>
                        <small>Nüfus</small>
                        <strong>{formatPopulation(selectedMarketProfile.population)}M</strong>
                        <em>{selectedMarketProfile.populationYear}</em>
                      </span>
                      <span>
                        <small>Kişi Başı GDP</small>
                        <strong>{formatUsd(selectedMarketProfile.gdpPerCapitaUsd)}</strong>
                        <em>{selectedMarketProfile.gdpYear}</em>
                      </span>
                    </div>
                    <div className="market-notes">
                      <strong>Ticari Genel Bilgi</strong>
                      <p>{selectedMarketProfile.tradeSummary}</p>
                      <strong>Bebek/Çocuk Giyim Sinyali</strong>
                      <p>{selectedMarketProfile.babyKidsClothingSignal}</p>
                      <strong>Satış Notları</strong>
                      <ul>
                        {selectedMarketProfile.salesNotes.map((note) => <li key={note}>{note}</li>)}
                      </ul>
                    </div>
                  </div>
                )}
                <div className="map-city-buttons">
                  {selectedPreset.cities.map((city) => (
                    <button
                      className={taskForm.city === city ? 'selected' : ''}
                      key={city}
                      onClick={() => setPresetCity(city)}
                      type="button"
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        
          <div className="workspace-grid command-workspace">
          <form className="smart-search-form" onSubmit={createAndRunSmartSearch}>
            <div className="smart-search-controls">
              <label>
                Kaynak
                <select value={taskForm.sourceType} onChange={(e) => updateTaskForm({ sourceType: e.target.value })}>
                  <option value="GOOGLE_PLACES">Google Magaza Bul</option>
                  <option value="INSTAGRAM">Instagram Musteri Bul</option>
                  <option value="DEMO">Demo</option>
                </select>
              </label>
              <label>
                Ulke
                <select value={selectedPresetCode} onChange={(e) => applyCountryPreset(balkanCountryPresets.find((preset) => preset.code === e.target.value) || balkanCountryPresets[0])}>
                  {balkanCountryPresets.map((preset) => <option key={preset.code} value={preset.code}>{preset.name}</option>)}
                </select>
              </label>
              <label>
                Sehir
                {selectedPreset ? (
                  <select value={automaticSearchPlan.city} onChange={(e) => setPresetCity(e.target.value)}>
                    {selectedPreset.cities.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                ) : (
                  <input value={taskForm.city} onChange={(e) => updateTaskForm({ city: e.target.value })} placeholder="Sehir" />
                )}
              </label>
              <label>
                Sonuc limiti
                <input required type="number" min="1" max="50" value={taskForm.maxResults} onChange={(e) => updateTaskForm({ maxResults: e.target.value })} />
              </label>
            </div>
            <div className={`smart-plan-card ${automaticSearchPlan.provider === 'GEMINI' ? 'gemini-source' : ''}`}>
              <div>
                <strong>Akilli Arama Plani</strong>
                <p>
                  {isPlanningSearch
                    ? 'AI ulke, sehir ve keyword analizini hazirliyor.'
                    : `${automaticSearchPlan.queries.length} ${automaticSearchPlan.channelLabel} sorgusu otomatik calisacak. ${automaticSearchPlan.channelGoal}`}
                </p>
              </div>
              <div className="smart-plan-meta">
                <span className={automaticSearchPlan.provider === 'GEMINI' ? 'gemini-chip' : ''}>{automaticSearchPlan.provider === 'GEMINI' ? 'Gemini AI' : 'Yerel AI Plan'}</span>
                {Number.isFinite(automaticSearchPlan.confidence) && <span>Guven %{Math.round(automaticSearchPlan.confidence * 100)}</span>}
                {automaticSearchPlan.city && <span>Ilk sehir: {automaticSearchPlan.city}</span>}
              </div>
              {automaticSearchPlan.summary && <p className="smart-plan-summary">{automaticSearchPlan.summary}</p>}
              {automaticSearchPlan.aiError && <p className="field-note warning">{automaticSearchPlan.aiError}</p>}
              {automaticSearchPlan.recommendedCities.length > 0 && (
                <div className="smart-city-plan">
                  {automaticSearchPlan.recommendedCities.map((item) => (
                    <button
                      className={automaticSearchPlan.city === item.city ? 'selected' : ''}
                      key={`${item.city}-${item.priority}`}
                      onClick={() => setPresetCity(item.city)}
                      type="button"
                    >
                      <strong>{item.city}</strong>
                      <small>{item.priority} - {item.reason}</small>
                    </button>
                  ))}
                </div>
              )}
              <div className="smart-plan-tags">
                {automaticSearchPlan.keywords.slice(0, 8).map((keyword) => <span key={keyword}>{keyword}</span>)}
              </div>
              {automaticSearchPlan.searchStrategy.length > 0 && (
                <ul className="smart-strategy-list">
                  {automaticSearchPlan.searchStrategy.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
              <small>Ilk sorgu: {automaticSearchPlan.primaryQuery}</small>
            </div>
            <div className="panel-header"><h2>Arama Görevi</h2><span>Varsayılan pilot: Romanya / Bükreş</span></div>
            <input required value={taskForm.name} onChange={(e) => updateTaskForm({ name: e.target.value })} placeholder="Görev adı" />
            <input required value={taskForm.country} onChange={(e) => updateTaskForm({ country: e.target.value })} placeholder="Ülke" />
            {selectedPreset?.name === taskForm.country ? (
              <select value={taskForm.city} onChange={(e) => setPresetCity(e.target.value)}>
                {selectedPreset.cities.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            ) : (
              <input value={taskForm.city} onChange={(e) => updateTaskForm({ city: e.target.value })} placeholder="Şehir" />
            )}
            <select value={taskForm.language} onChange={(e) => updateTaskForm({ language: e.target.value })}>
              <option value="en">İngilizce</option>
              <option value="ro">Romence</option>
              <option value="bg">Bulgarca</option>
              <option value="de">Almanca</option>
            </select>
            <select value={taskForm.keywordGroup} onChange={(e) => updateTaskForm({ keywordGroup: e.target.value })}>
              {Object.entries(keywordGroups).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {selectedPreset?.name === taskForm.country ? (
              <select value={taskForm.sourceKeyword} onChange={(e) => setPresetKeyword(e.target.value)}>
                {selectedPreset.queries.map((query) => <option key={query} value={query}>{query}</option>)}
              </select>
            ) : (
              <input required value={taskForm.sourceKeyword} onChange={(e) => updateTaskForm({ sourceKeyword: e.target.value })} placeholder="Ana anahtar kelime" />
            )}
            <input required value={taskForm.query} onChange={(e) => updateTaskForm({ query: e.target.value })} placeholder="Arama sorgusu" />
            <select value={taskForm.sourceType} onChange={(e) => updateTaskForm({ sourceType: e.target.value })}>
              {Object.entries(sourceTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}{providers[value]?.configured === false ? ' - API key gerekli' : ''}</option>
              ))}
            </select>
            {providers.GOOGLE_PLACES?.configured === false && <p className="field-note warning">.env içinde GOOGLE_PLACES_API_KEY gerekli.</p>}
            <input required type="number" min="1" max="50" value={taskForm.maxResults} onChange={(e) => updateTaskForm({ maxResults: e.target.value })} placeholder="Maksimum sonuç" />
            {(searchHistory?.alreadyCompleted || searchHistory?.hasExistingTask) && (
              <p className="field-note warning">
                Bu arama daha önce {searchHistory.completedCount} kez tamamlandı. Tekrar çalıştırırsan duplicate koruması sadece yeni leadleri ekler.
              </p>
            )}
            <button type="submit" disabled={isCreatingTask || !!runningTaskId}>
              <Search size={15} /> {isCreatingTask || runningTaskId ? 'Calisiyor' : `${sourceTypeLabels[taskForm.sourceType] || 'Arama'} Calistir`}
            </button>
            <button className="secondary-button" type="button" disabled={isCreatingTask} onClick={createTask}>Sadece Görev Oluştur</button>
          </form>

          <div className="run-summary-panel">
            <div className="panel-header">
              <h2>Çalışma Özeti</h2>
              {lastRunSummary?.summarySource && (
                <span className={`summary-source summary-source-${lastRunSummary.summarySource}`}>
                  {summarySourceLabels[lastRunSummary.summarySource] || 'Ozet'}
                </span>
              )}
            </div>
            {lastRunSummary ? (
              <div className="summary-grid">
                <Kpi title="Bulunan Sonuç" value={lastRunSummary.foundCount || 0} />
                <Kpi title="Eklenen Lead" value={lastRunSummary.createdCount || 0} />
                <Kpi title="Tekrar Atlanan" value={lastRunSummary.duplicateCount || 0} />
                <Kpi title="Hedef Dışı" value={lastRunSummary.targetFilteredCount || 0} />
                <Kpi title="Ortalama Skor" value={lastRunSummary.averageScore ? Math.round(lastRunSummary.averageScore) : 0} />
                <div className="best-leads">
                  <strong>En iyi leadler</strong>
                  {(lastRunSummary.bestLeads || []).map((lead) => <span key={lead.id}>{lead.leadScore} - {lead.companyName}</span>)}
                </div>
                {lastRunSummary.historyNote && <p className="field-note warning">{lastRunSummary.historyNote}</p>}
                {(lastRunSummary.searchedResults || []).length > 0 && (
                  <div className="searched-results-box">
                    <div className="searched-results-header">
                      <strong>Arananlar</strong>
                      <span>{getRunResultsByFilter(lastRunSummary).length} / {lastRunSummary.searchedResults.length} sonuc</span>
                    </div>
                    <div className="run-result-filter-row">
                      {Object.entries(runResultFilterLabels).map(([value, label]) => (
                        <button
                          className={runResultFilter === value ? 'active' : ''}
                          key={value}
                          onClick={() => setRunResultFilter(value)}
                          type="button"
                        >
                          {label}
                          <em>{countRunResultsByStatus(lastRunSummary, value)}</em>
                        </button>
                      ))}
                    </div>
                    <div className="searched-results-list">
                      {getRunResultsByFilter(lastRunSummary).length === 0 && (
                        <div className="empty-state compact-empty">Bu filtrede sonuc yok.</div>
                      )}
                      {getRunResultsByFilter(lastRunSummary).map((result) => (
                        <button
                          className={`searched-result-row searched-${result.status}`}
                          disabled={!result.id}
                          key={`${result.googlePlaceId || result.companyName}-${result.sourceQuery}-${result.status}`}
                          onClick={() => selectRunResult(result)}
                          type="button"
                        >
                          <span>
                            <strong>{result.companyName}</strong>
                            <small>{result.city || result.country} - {result.sourceKeyword || result.sourceQuery}</small>
                            {result.reason && <small>{result.reason}</small>}
                          </span>
                          <em>
                            {result.qualityScore ? `Kalite ${result.qualityScore}` : runResultStatusLabels[result.status] || result.status}
                            {result.qualityLabel ? ` - ${result.qualityLabel}` : ''}
                          </em>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {lastRunSummary.aiReport && (
                  <div className="ai-run-report gemini-source">
                    <div className="ai-run-report-header">
                      <strong>Gemini Arama Raporu</strong>
                      <span>{lastRunSummary.aiReport.leadQuality || 'rapor'}</span>
                    </div>
                    {lastRunSummary.aiReport.error ? (
                      <p>{lastRunSummary.aiReport.error}</p>
                    ) : (
                      <>
                        <p>{lastRunSummary.aiReport.executiveSummary}</p>
                        <p>{lastRunSummary.aiReport.marketSignal}</p>
                        <div className="ai-run-report-columns">
                          <ReportList title="Sonraki Aramalar" items={lastRunSummary.aiReport.nextSearchIdeas} />
                          <ReportList title="Kelime Iyilestirme" items={lastRunSummary.aiReport.keywordImprovements} />
                          <ReportList title="Aksiyon Plani" items={lastRunSummary.aiReport.actionPlan} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">Sonuç sayısı, tekrarlar, ortalama skor ve en iyi leadleri görmek için Google araması çalıştır.</div>
            )}
            <div className="recent-runs-box">
              <div className="searched-results-header">
                <strong>Son Aramalar</strong>
                <span>{runHistory.length} kosu</span>
              </div>
              <div className="recent-runs-list">
                {isLoading && runHistory.length === 0 && <div className="empty-state">Son aramalar yukleniyor.</div>}
                {!isLoading && runHistory.length === 0 && <div className="empty-state">Henuz arama gecmisi yok.</div>}
                {runHistory.slice(0, 6).map((run) => (
                  <button
                    className={`recent-run-item status-${run.status.toLowerCase()}`}
                    key={run.id}
                    onClick={() => showRunSummary(run)}
                    type="button"
                  >
                    <span>
                      <strong>{run.country} {run.city || ''}</strong>
                      <small>{sourceTypeLabels[run.sourceType] || run.sourceType} - {run.query}</small>
                    </span>
                    <em>{run.foundCount} bulundu / {run.createdCount || 0} eklendi</em>
                    <small>{new Date(run.ranAt).toLocaleString('tr-TR')}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
          </div>
        </section>

          </>
        )}

        {activeView === 'allLeads' && (
          <>
        <section className="workspace-grid">
          <div className="panel wide-panel">
            <div className="panel-header">
              <h2>Lead Listesi</h2>
              <span>{hotLeads.length} sıcak aday</span>
            </div>
            <div className="filter-row lead-filter-row">
              <input className="filter-search" placeholder="Firma adı ara" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
              <select value={filters.country} onChange={(e) => setCountryFilter(e.target.value)}>
                <option value="">Tüm ülkeler</option>
                {balkanCountryPresets.map((preset) => <option key={preset.code} value={preset.name}>{preset.name}</option>)}
              </select>
              {selectedFilterPreset ? (
                <select value={filters.city} onChange={(e) => applyLeadFilterPatch({ ...filters, city: e.target.value })}>
                  <option value="">Tüm şehirler</option>
                  {selectedFilterPreset.cities.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              ) : (
                <input placeholder="Şehir" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
              )}
              <select value={filters.minScore} onChange={(e) => applyLeadFilterPatch({ ...filters, minScore: e.target.value })}>
                <option value="">Tüm skorlar</option>
                <option value="80">80+ Sıcak</option>
                <option value="60">60+ Uygun</option>
                <option value="40">40+ İnceleme</option>
              </select>
              <select value={filters.sourceTypes} onChange={(e) => applyLeadFilterPatch({ ...filters, sourceTypes: e.target.value })}>
                <option value="">Tum kaynaklar</option>
                <option value="GOOGLE_PLACES">Google magazalari</option>
                <option value="INSTAGRAM,INSTAGRAM_APIFY,APIFY">Instagram musterileri</option>
                <option value="DEMO">Demo</option>
                <option value="MANUAL">Manuel</option>
              </select>
              <select value={filters.status} onChange={(e) => applyLeadFilterPatch({ ...filters, status: e.target.value })}>
                <option value="">Tüm durumlar</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button type="button" onClick={applyFilters} disabled={isLoading}>{isLoading ? 'Yükleniyor' : 'Filtrele'}</button>
              <button type="button" className="secondary-button" onClick={showHotLeads} disabled={isLoading}>Sıcaklar</button>
              <button type="button" className="secondary-button" onClick={clearFilters} disabled={isLoading}>Temizle</button>
            </div>
            {activeLeadFilters.length > 0 && (
              <div className="active-filter-row">
                {activeLeadFilters.map((filter) => (
                  <button key={filter.key} onClick={() => clearLeadFilter(filter)} type="button">
                    {filter.label}
                    <span>Kaldir</span>
                  </button>
                ))}
              </div>
            )}
            <div className="lead-table">
              {isLoading && <div className="empty-state">Lead listesi yükleniyor.</div>}
              {!isLoading && leads.length === 0 && <div className="empty-state">Bu filtrelerle lead bulunamadı.</div>}
              {leads.map((lead) => (
                <div
                  className={`lead-row ${selectedLead?.id === lead.id ? 'selected' : ''}`}
                  key={lead.id}
                  onClick={() => selectLead(lead)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') selectLead(lead);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <strong className={lead.leadScore >= 80 ? 'score hot' : 'score'}>{lead.leadScore}</strong>
                  <span className="lead-main">
                    <strong>{lead.companyName}</strong>
                    <small>
                      <span className={`lead-source-pill source-${lead.sourceType || 'UNKNOWN'}`}>
                        {sourceTypeLabels[lead.sourceType] || lead.sourceType || 'Kaynak'}
                      </span>
                      {lead.country} {lead.city ? `- ${lead.city}` : ''}
                    </small>
                  </span>
                  <span className="lead-badges" aria-label="Lead iletişim alanları">
                    {(lead.internationalPhoneNumber || lead.phone) && <small>Tel</small>}
                    {lead.website && <small>Site</small>}
                    {lead.googleMapsUrl && <small>Maps</small>}
                  </span>
                  <span className="lead-feedback-actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      aria-label="Lead begenildi"
                      className={lead.userFeedback === 'LIKED' ? 'active' : ''}
                      disabled={updatingLeadFeedback === lead.id}
                      onClick={() => updateLeadFeedback(lead.id, lead.userFeedback === 'LIKED' ? 'NONE' : 'LIKED')}
                      title="Begen"
                      type="button"
                    >
                      <ThumbsUp size={14} />
                    </button>
                    <button
                      aria-label="Lead begenilmedi"
                      className={lead.userFeedback === 'DISLIKED' ? 'active negative' : ''}
                      disabled={updatingLeadFeedback === lead.id}
                      onClick={() => updateLeadFeedback(lead.id, lead.userFeedback === 'DISLIKED' ? 'NONE' : 'DISLIKED')}
                      title="Begenme"
                      type="button"
                    >
                      <ThumbsDown size={14} />
                    </button>
                  </span>
                  <em>{statusLabels[lead.status] || lead.status}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><h2>Lead Detay</h2></div>
            {selectedLead ? (
              <div className="detail-card">
                <h3>{selectedLead.companyName}</h3>
                <p>{selectedLead.country} {selectedLead.city ? `- ${selectedLead.city}` : ''}</p>
                <div className="detail-score">{selectedLead.leadScore}/100</div>
                <div className="feedback-strip">
                  <span>{feedbackLabels[selectedLead.userFeedback || 'NONE']}</span>
                  <button
                    className={selectedLead.userFeedback === 'LIKED' ? 'active' : ''}
                    disabled={updatingLeadFeedback === selectedLead.id}
                    onClick={() => updateLeadFeedback(selectedLead.id, selectedLead.userFeedback === 'LIKED' ? 'NONE' : 'LIKED')}
                    type="button"
                  >
                    <ThumbsUp size={15} /> Begen
                  </button>
                  <button
                    className={selectedLead.userFeedback === 'DISLIKED' ? 'active negative' : ''}
                    disabled={updatingLeadFeedback === selectedLead.id}
                    onClick={() => updateLeadFeedback(selectedLead.id, selectedLead.userFeedback === 'DISLIKED' ? 'NONE' : 'DISLIKED')}
                    type="button"
                  >
                    <ThumbsDown size={15} /> Begenme
                  </button>
                </div>
                <div className={`ai-analysis-box ${selectedLead.aiAnalysis?.provider === 'GEMINI' ? 'gemini-source' : ''}`}>
                  <div className="ai-analysis-header">
                    <strong>Gemini AI Analizi</strong>
                    <button
                      className="secondary-button"
                      disabled={analyzingLeadId === selectedLead.id || providers.GEMINI?.configured === false}
                      onClick={analyzeSelectedLead}
                      type="button"
                    >
                      {analyzingLeadId === selectedLead.id ? 'Analiz ediliyor' : 'AI Analiz Et'}
                    </button>
                  </div>
                  {providers.GEMINI?.configured === false && (
                    <p className="field-note warning">Gemini icin .env icinde GEMINI_API_KEY gerekli.</p>
                  )}
                  {selectedLead.aiAnalysis ? (
                    <div className="ai-analysis-grid">
                      <span><small>AI Skor</small><strong>{selectedLead.aiAnalysis.aiFitScore}/100</strong></span>
                      <span><small>Aksiyon</small><strong>{selectedLead.aiAnalysis.recommendedAction}</strong></span>
                      <p>{selectedLead.aiAnalysis.summary}</p>
                      <p>{selectedLead.aiAnalysis.reason}</p>
                      {selectedLead.aiAnalysis.suggestedMessage && (
                        <blockquote>{selectedLead.aiAnalysis.suggestedMessage}</blockquote>
                      )}
                    </div>
                  ) : (
                    <p className="ai-empty">Bu lead icin henuz AI analizi yok.</p>
                  )}
                </div>
                <div className="lead-action-strip">
                  <a className={!selectedLeadPhoneHref ? 'disabled-link' : ''} href={selectedLeadPhoneHref || undefined}>
                    <Phone size={16} /> Ara
                  </a>
                  <a className={!selectedLeadWhatsappHref ? 'disabled-link' : ''} href={selectedLeadWhatsappHref || undefined} rel="noreferrer" target="_blank">
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                  <a className={!selectedLead.website ? 'disabled-link' : ''} href={selectedLead.website || undefined} rel="noreferrer" target="_blank">
                    <Globe size={16} /> Site
                  </a>
                  <a className={!selectedLead.instagram ? 'disabled-link' : ''} href={selectedLead.instagram || undefined} rel="noreferrer" target="_blank">
                    <MessageCircle size={16} /> Instagram
                  </a>
                  <a className={!selectedLead.googleMapsUrl ? 'disabled-link' : ''} href={selectedLead.googleMapsUrl || undefined} rel="noreferrer" target="_blank">
                    <MapPin size={16} /> Maps
                  </a>
                  <button disabled={!selectedLeadPhone} onClick={copyLeadPhone} type="button">
                    <Copy size={16} /> Kopyala
                  </button>
                </div>
                <dl>
                  <dt>Telefon</dt><dd>{selectedLead.internationalPhoneNumber || selectedLead.phone || '-'}</dd>
                  <dt>Website</dt><dd>{selectedLead.website || '-'}</dd>
                  <dt>Instagram</dt><dd>{selectedLead.instagram || '-'}</dd>
                  <dt>Maps</dt><dd>{selectedLead.googleMapsUrl || '-'}</dd>
                  <dt>Puan</dt><dd>{selectedLead.rating || '-'} ({selectedLead.userRatingsTotal || 0})</dd>
                  <dt>Durum</dt><dd>{selectedLead.businessStatus || '-'}</dd>
                  <dt>Skor Sebebi</dt><dd>{selectedLead.scoreReason || '-'}</dd>
                </dl>
                {(selectedLead.sources?.length || selectedLead.instagramProfiles?.length || selectedLead.activities?.length) ? (
                  <div className="lead-evidence-grid">
                    <div>
                      <strong>Kaynak Kayitlari</strong>
                      {(selectedLead.sources || []).slice(0, 5).map((source) => (
                        <span key={source.id}>
                          <small>{sourceTypeLabels[source.sourceType] || source.sourceType}</small>
                          <em>{source.sourceQuery || source.sourceName || '-'}</em>
                        </span>
                      ))}
                      {!selectedLead.sources?.length && <p>Kaynak kaydi yok.</p>}
                    </div>
                    <div>
                      <strong>Instagram Profili</strong>
                      {(selectedLead.instagramProfiles || []).slice(0, 3).map((profile) => (
                        <span key={profile.id}>
                          <small>{profile.username ? `@${profile.username}` : profile.profileName || 'Profil'}</small>
                          <em>{profile.followerCount ? `${profile.followerCount} takipci` : profile.bio || profile.profileUrl || '-'}</em>
                        </span>
                      ))}
                      {!selectedLead.instagramProfiles?.length && <p>Instagram profil kaydi yok.</p>}
                    </div>
                    <div>
                      <strong>Aktivite</strong>
                      {(selectedLead.activities || []).slice(0, 4).map((activity) => (
                        <span key={activity.id}>
                          <small>{activity.activityType}</small>
                          <em>{activity.content || activity.result || '-'}</em>
                        </span>
                      ))}
                      {!selectedLead.activities?.length && <p>Aktivite yok.</p>}
                    </div>
                  </div>
                ) : null}
                <div className="possible-match-box">
                  <div className="possible-match-header">
                    <strong>Olası Eşleşmeler</strong>
                    <span>{isLoadingPossibleMatches ? 'Kontrol ediliyor' : `${possibleMatches.length} kayıt`}</span>
                  </div>
                  {possibleMatches.length > 0 ? (
                    <div className="possible-match-list">
                      {possibleMatches.map((match) => (
                        <button className="possible-match-row" key={match.id} onClick={() => selectLead(match)} type="button">
                          <span>
                            <strong>{match.companyName}</strong>
                            <small>{sourceTypeLabels[match.sourceType] || match.sourceType} · {match.country} {match.city ? `- ${match.city}` : ''}</small>
                          </span>
                          <em>{match.matchScore}/100</em>
                          <small>{match.matchReasons?.join(', ') || 'Benzer kayıt sinyali'}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="field-note">{isLoadingPossibleMatches ? 'Aynı müşteri olabilecek kayıtlar aranıyor.' : 'Bu lead için güçlü bir tekrar/eşleşme sinyali yok.'}</p>
                  )}
                </div>
                <div className="action-row">
                  {['HOT', 'REVIEW', 'QUALIFIED', 'REJECTED', 'CONVERTED'].map((status) => (
                    <button disabled={!!updatingLeadStatus} key={status} onClick={() => updateLeadStatus(selectedLead.id, status)} type="button">
                      {updatingLeadStatus === status ? 'Kaydediliyor' : statusLabels[status]}
                    </button>
                  ))}
                </div>
              </div>
            ) : <p>Lead seç.</p>}
          </div>
        </section>

          </>
        )}

        {activeView === 'leads' && (
          <>

        <details className="panel wide-panel advanced-panel">
          <summary>Gecmis aramalar ve teknik gorevler</summary>
          <div className="task-list">
            {tasks.length === 0 && <div className="empty-state">Henüz arama görevi yok.</div>}
            {tasks.map((task) => (
              <div className="task-row" key={task.id}>
                <div>
                  <strong>{task.name}</strong>
                  <small>{sourceTypeLabels[task.sourceType] || task.sourceType} - {task.query} - {task.country} {task.city}</small>
                  {task.error && <small className="task-error">{task.error}</small>}
                </div>
                <span className={`status-badge status-${task.status.toLowerCase()}`}>
                  {taskStatusLabels[task.status] || task.status} - bulunan {task.foundCount} / eklenen {task.insertedCount || 0} / tekrar {task.duplicateCount || 0}
                </span>
                <button disabled={!!runningTaskId} onClick={() => runTask(task.id)} type="button">
                  <Play size={15} /> {runningTaskId === task.id ? 'Çalışıyor' : 'Çalıştır'}
                </button>
                <button className="secondary-button" disabled={!!runningTaskId} onClick={() => showTaskSummary(task)} type="button">
                  Ozet
                </button>
              </div>
            ))}
          </div>
        </details>
        <section className="panel wide-panel">
          <div className="panel-header"><h2>Arama Geçmişi</h2><span>Son {runHistory.length} koşu</span></div>
          <div className="task-list">
            {runHistory.length === 0 && <div className="empty-state">Henüz çalışma geçmişi yok.</div>}
            {runHistory.map((run) => (
              <div className="task-row" key={run.id}>
                <div>
                  <strong>{run.country} {run.city || ''}</strong>
                  <small>{run.sourceType} - {run.query}</small>
                  {run.error && <small className="task-error">{run.error}</small>}
                </div>
                <span className={`status-badge status-${run.status.toLowerCase()}`}>
                  {taskStatusLabels[run.status] || run.status} - bulunan {run.foundCount} / eklenen {run.createdCount || 0} / tekrar {run.duplicateCount || 0}
                </span>
                <small>{new Date(run.ranAt).toLocaleString('tr-TR')}</small>
                <button className="secondary-button" onClick={() => showRunSummary(run)} type="button">Ac</button>
              </div>
            ))}
          </div>
        </section>
          </>
        )}

        {activeView === 'instagram' && (
          <>
            <section className="instagram-hero panel">
              <div>
                <h2><InstagramIcon size={20} /> Instagram Musteri Bul</h2>
                <p>Ulkeyi sec, Gemini o ulkenin diline ve Instagram satis aliskanligina gore profil arama kriterlerini hazirlasin.</p>
              </div>
              <div className="instagram-provider-card">
                <span>Baglanti modu</span>
                <strong>{providers.INSTAGRAM?.mode === 'APIFY' ? 'Apify canli actor' : 'Yerel aday motoru'}</strong>
                <small>{providers.INSTAGRAM?.mode === 'APIFY' ? 'APIFY_TOKEN ve APIFY_INSTAGRAM_ACTOR_ID aktif.' : 'Ayarlar icin .env: APIFY_TOKEN + APIFY_INSTAGRAM_ACTOR_ID eklenince canli scraper calisir.'}</small>
              </div>
            </section>

            <section className="instagram-grid">
              <form className="panel instagram-search-panel" onSubmit={runInstagramPanelSearch}>
                <div className="panel-header">
                  <h2>Akilli Instagram Aramasi</h2>
                  <span>{instagramAiPlan?.provider === 'GEMINI' ? 'Gemini kriterleri aktif' : 'Gemini plan bekliyor'}</span>
                </div>
                <div className="instagram-command-controls">
                  <label>
                    Ulke
                    <select value={selectedInstagramPreset?.code || selectedPresetCode} onChange={(e) => applyInstagramPreset(balkanCountryPresets.find((preset) => preset.code === e.target.value) || balkanCountryPresets[0])}>
                      {balkanCountryPresets.map((preset) => <option key={preset.code} value={preset.code}>{preset.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Sehir
                    <select value={instagramForm.city} onChange={(e) => {
                      setInstagramAiPlan(null);
                      setInstagramSummary(null);
                      updateInstagramForm({ city: e.target.value });
                    }}>
                      {(selectedInstagramPreset?.cities || []).map((city) => <option key={city} value={city}>{city}</option>)}
                    </select>
                  </label>
                  <label>
                    Profil limiti
                    <input required min="1" max="50" type="number" value={instagramForm.maxResults} onChange={(e) => setInstagramForm({ ...instagramForm, maxResults: e.target.value })} />
                  </label>
                </div>
                <div className="country-habit-strip instagram-habit-strip">
                  <span><strong>Dil</strong>{selectedInstagramSearchProfile.languages.join(', ')}</span>
                  <span><strong>Arama</strong>{selectedInstagramSearchProfile.instagramHabits.slice(0, 3).join(' / ')}</span>
                  <span><strong>Pazar</strong>{selectedInstagramMarketProfile?.babyKidsClothingSignal || 'Yerel butik ve online satis profilleri oncelikli.'}</span>
                </div>
                {instagramAiPlan && (
                  <div className={`instagram-ai-plan ${instagramAiPlan.provider === 'GEMINI' ? 'gemini-source' : ''}`}>
                    <div className="instagram-ai-plan-header">
                      <strong>{instagramAiPlan.provider === 'GEMINI' ? 'Gemini Instagram Plani' : 'Yerel Instagram Plani'}</strong>
                      <span>Guven %{Math.round((instagramAiPlan.confidence || 0) * 100)}</span>
                    </div>
                    <p>{instagramAiPlan.summary}</p>
                    <small>{instagramAiPlan.audienceDefinition}</small>
                    <div className="instagram-plan-meta">
                      <span>{instagramAiPlan.searchQueries?.length || 0} sorgu</span>
                      <span>Sorgu basina {instagramAiPlan.maxResultsPerQuery || instagramForm.maxResults} profil</span>
                      <span>Tahmini toplam {(instagramAiPlan.searchQueries?.length || 0) * Number(instagramAiPlan.maxResultsPerQuery || instagramForm.maxResults || 0)}</span>
                      <span>{instagramAiPlan.languagePack?.languages?.join(', ') || selectedInstagramSearchProfile.languages.join(', ')}</span>
                      <button className="mini-inline-button" onClick={addInstagramPlanQuery} type="button">Sorgu Ekle</button>
                    </div>
                    <div className="instagram-query-list">
                      {instagramAiPlan.searchQueries?.length === 0 && (
                        <div className="empty-state">Bu planda sorgu kalmadi. Sorgu Ekle ile manuel arama ekleyebilirsin.</div>
                      )}
                      {instagramAiPlan.searchQueries?.map((item, index) => (
                        <div
                          className={`instagram-query-row ${instagramForm.query === item.query ? 'selected' : ''}`}
                          key={`${item.searchType}-${item.query}`}
                        >
                          <input
                            aria-label="Instagram sorgusu"
                            value={item.query}
                            onChange={(e) => updateInstagramPlanQuery(index, { query: e.target.value })}
                          />
                          <select
                            aria-label="Arama tipi"
                            value={item.searchType || 'user'}
                            onChange={(e) => updateInstagramPlanQuery(index, { searchType: e.target.value })}
                          >
                            <option value="user">user</option>
                            <option value="place">place</option>
                          </select>
                          <select
                            aria-label="Oncelik"
                            value={item.priority || 'medium'}
                            onChange={(e) => updateInstagramPlanQuery(index, { priority: e.target.value })}
                          >
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                          <button className="icon-text-button" onClick={() => selectInstagramPlanQuery(item)} type="button">Sec</button>
                          <button className="icon-text-button danger-text" onClick={() => removeInstagramPlanQuery(index)} type="button">Sil</button>
                          <small>{item.intent || item.reason || 'Instagram icinde hedef profil aramasi.'}</small>
                        </div>
                      ))}
                    </div>
                    <div className="instagram-signal-grid">
                      <div>
                        <strong>Olumlu sinyal</strong>
                        {instagramAiPlan.positiveSignals?.slice(0, 4).map((item) => <span key={item}>{item}</span>)}
                      </div>
                      <div>
                        <strong>Ele</strong>
                        {instagramAiPlan.negativeSignals?.slice(0, 4).map((item) => <span key={item}>{item}</span>)}
                      </div>
                    </div>
                    {instagramAiPlan.aiError && <div className="field-note warning">{instagramAiPlan.aiError}</div>}
                  </div>
                )}
                {!instagramAiPlan && (
                  <div className="instagram-ai-plan">
                    <div className="instagram-ai-plan-header">
                      <strong>Gemini plan hazir degil</strong>
                      <span>1 tik</span>
                    </div>
                    <p>Gemini ile Instagram Bul butonu once kriterleri olusturur, sonra en yuksek oncelikli sorgulari otomatik calistirir.</p>
                  </div>
                )}
                <details className="instagram-advanced-fields">
                  <summary>Manuel sorgu ayarlari</summary>
                  <label>
                    Arama niyeti
                    <select value={instagramForm.sourceKeyword} onChange={(e) => updateInstagramForm({ sourceKeyword: e.target.value })}>
                      <option value="baby kids clothing boutique">baby kids clothing boutique</option>
                      <option value="kidswear boutique">kidswear boutique</option>
                      <option value="babywear shop">babywear shop</option>
                      <option value="kidswear online shop">kidswear online shop</option>
                      <option value="baby boutique whatsapp">baby boutique whatsapp</option>
                      <option value="bebek giyim butik">bebek giyim butik</option>
                      <option value="cocuk giyim butik">cocuk giyim butik</option>
                      <option value="bebek giyim siparis">bebek giyim siparis</option>
                      <option value="children wear shop">children wear shop</option>
                    </select>
                  </label>
                  <label>
                    Sorgu
                    <input required value={instagramForm.query} onChange={(e) => setInstagramForm({ ...instagramForm, query: e.target.value })} />
                  </label>
                  <button className="secondary-button" onClick={addInstagramPlanQuery} type="button">Manuel Sorguyu Plana Ekle</button>
                </details>
                <div className="instagram-search-actions">
                  <button className="secondary-button" disabled={isPlanningInstagramSearch || isRunningInstagramSearch} onClick={loadInstagramAiPlan} type="button">
                    <Bot size={16} /> {isPlanningInstagramSearch ? 'Gemini planliyor' : 'Gemini Kriter Olustur'}
                  </button>
                  <button disabled={isRunningInstagramSearch} type="submit">
                    <InstagramIcon size={16} /> {isRunningInstagramSearch ? 'Araniyor' : 'Gemini ile Instagram Bul'}
                  </button>
                  {isRunningInstagramSearch && (
                    <button className="secondary-button danger-button" onClick={stopInstagramSearch} type="button">Durdur</button>
                  )}
                  <button className="secondary-button" disabled={isRunningInstagramSearch} onClick={refreshInstagramLeads} type="button">Listeyi Yenile</button>
                </div>
                {instagramRunStatus && <p className="field-note warning">{instagramRunStatus}</p>}
              </form>

              <div className="panel instagram-summary-panel">
                <div className="panel-header">
                  <h2>Takip Ozeti</h2>
                  <span>{uniqueInstagramLeads.length} tekil Instagram lead</span>
                </div>
                <div className="instagram-kpis">
                  <Kpi title="Tekil Lead" value={uniqueInstagramLeads.length} />
                  <Kpi title="Sicak" value={hotInstagramLeads.length} />
                  <Kpi title="Begenilen" value={likedInstagramLeads.length} />
                  <Kpi title="Canli Mod" value={providers.INSTAGRAM?.mode === 'APIFY' ? 'Apify' : 'Yerel'} />
                </div>
                {instagramSummary ? (
                  <div className="instagram-run-summary">
                    <strong>Son Instagram aramasi</strong>
                    <span>Bulunan {instagramSummary.foundCount || 0}</span>
                    <span>Eklenen {instagramSummary.createdCount || 0}</span>
                    <span>Tekrar {instagramSummary.duplicateCount || 0}</span>
                    {instagramSummary.ranQueries?.length ? <span>Sorgu {instagramSummary.ranQueries.length}</span> : null}
                    {instagramSummary.ranQueries?.length ? (
                      <div className="ran-query-chips">
                        {instagramSummary.ranQueries.slice(0, 8).map((item) => (
                          <em key={`${item.searchType}-${item.query}`}>{item.query}</em>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p>Arama calistirinca bulunan profiller, eklenen leadler ve tekrarlar burada gorunur.</p>
                )}
              </div>
            </section>

            <section className="panel wide-panel">
              <div className="panel-header">
                <h2>Son Aramada Bulunanlar</h2>
                <span>{instagramRunResults.length ? `${filteredInstagramRunResults.length} / ${instagramRunResults.length} sonuc` : `${instagramForm.country} ${instagramForm.city}`}</span>
              </div>
              {instagramRunResults.length === 0 ? (
                <div className="empty-state">Yeni bir Instagram aramasi calistirinca sadece o aramanin sonuclari burada gorunur. Eski leadler arsivde tutulur.</div>
              ) : (
                <>
                  <div className="run-result-filter-row instagram-result-filter-row">
                    {Object.entries(runResultFilterLabels).map(([value, label]) => (
                      <button
                        className={instagramRunResultFilter === value ? 'active' : ''}
                        key={value}
                        onClick={() => setInstagramRunResultFilter(value)}
                        type="button"
                      >
                        {label}
                        <em>{countResultsByStatus(instagramRunResults, value)}</em>
                      </button>
                    ))}
                  </div>
                  <div className="searched-results-list instagram-current-results">
                    {filteredInstagramRunResults.length === 0 && (
                      <div className="empty-state compact-empty">Bu filtrede sonuc yok.</div>
                    )}
                    {filteredInstagramRunResults.map((result) => (
                      <button
                        className={`searched-result-row searched-${result.status}`}
                        disabled={!result.id}
                        key={`${result.instagram || result.companyName}-${result.sourceQuery}-${result.status}`}
                        onClick={() => selectRunResult(result)}
                        type="button"
                      >
                        <span>
                          <strong>{result.companyName}</strong>
                          <small>{result.city || result.country} - {result.sourceQuery || result.sourceKeyword}</small>
                          {result.reason && <small>{result.reason}</small>}
                        </span>
                        <em>
                          {result.qualityScore ? `Kalite ${result.qualityScore}` : runResultStatusLabels[result.status] || result.status}
                          {result.qualityLabel ? ` - ${result.qualityLabel}` : ''}
                        </em>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <details className="instagram-archive-panel">
                <summary>Tum Instagram lead arsivi ({uniqueInstagramLeads.length} tekil)</summary>
                <div className="instagram-lead-grid">
                  {uniqueInstagramLeads.length === 0 && <div className="empty-state">Bu ulke/sehir icin Instagram lead yok. Ilk aramayi calistir.</div>}
                  {uniqueInstagramLeads.map((lead) => (
                    <article className="instagram-lead-card" key={lead.id}>
                      <div className="instagram-card-header">
                        <strong>{lead.companyName}</strong>
                        <span className={lead.leadScore >= 80 ? 'score hot' : 'score'}>{lead.leadScore}</span>
                      </div>
                      <small>{lead.city || lead.country} - {lead.sourceKeyword || 'Instagram profil'}</small>
                      <p>{lead.scoreReason || lead.categoryGuess || 'Instagram profil adayi'}</p>
                      <div className="instagram-card-links">
                        <a className={!lead.instagram ? 'disabled-link' : ''} href={lead.instagram || undefined} rel="noreferrer" target="_blank"><InstagramIcon size={15} /> Profil</a>
                        <a className={!lead.whatsapp && !lead.phone ? 'disabled-link' : ''} href={(lead.whatsapp || lead.phone) ? `https://wa.me/${normalizePhoneForWhatsApp(lead.whatsapp || lead.phone)}` : undefined} rel="noreferrer" target="_blank"><MessageCircle size={15} /> WhatsApp</a>
                        <button onClick={() => { selectLead(lead); setActiveView('allLeads'); }} type="button">Detaya Al</button>
                      </div>
                      <div className="lead-feedback-actions">
                        <button
                          aria-label="Instagram lead begenildi"
                          className={lead.userFeedback === 'LIKED' ? 'active' : ''}
                          disabled={updatingLeadFeedback === lead.id}
                          onClick={() => updateLeadFeedback(lead.id, lead.userFeedback === 'LIKED' ? 'NONE' : 'LIKED')}
                          type="button"
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          aria-label="Instagram lead begenilmedi"
                          className={lead.userFeedback === 'DISLIKED' ? 'active negative' : ''}
                          disabled={updatingLeadFeedback === lead.id}
                          onClick={() => updateLeadFeedback(lead.id, lead.userFeedback === 'DISLIKED' ? 'NONE' : 'DISLIKED')}
                          type="button"
                        >
                          <ThumbsDown size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            </section>
          </>
        )}

        {activeView === 'settings' && (
          <>
            <section className="settings-grid">
              <div className="panel settings-status-panel">
                <div className="panel-header">
                  <h2><Bot size={18} /> Gemini Baglantisi</h2>
                  <button className="secondary-button" disabled={isTestingGemini || providers.GEMINI?.configured === false} onClick={testGemini} type="button">
                    {isTestingGemini ? 'Test ediliyor' : 'Baglantiyi Test Et'}
                  </button>
                </div>
                <div className="settings-status-grid">
                  <Kpi title="Durum" value={providers.GEMINI?.configured ? 'Aktif' : 'Key Yok'} />
                  <Kpi title="Model" value={providers.GEMINI?.model || '-'} />
                  <Kpi title="Canli Test" value={geminiTest ? (geminiTest.ok ? 'Basarili' : 'Hata') : 'Yapilmadi'} />
                </div>
                {providers.GEMINI?.configured === false && <p className="field-note warning">Gemini icin .env icinde GEMINI_API_KEY gerekli. Key girilip API yeniden baslatilinca lead detayindaki AI Analiz Et butonu aktif olur.</p>}
                {geminiTest?.ok === false && <p className="field-note warning">{geminiTest.error}</p>}
                {geminiTest?.ok === true && <p className="field-note success">Gemini API key ve model canli olarak dogrulandi.</p>}
              </div>
            </section>

        {companyProfile && (
          <section className="panel ai-memory-panel">
            <div className="panel-header">
              <h2><Bot size={18} /> AI Firma Hafizasi</h2>
              <button className="secondary-button" type="button" disabled={isSavingCompanyProfile} onClick={saveCompanyProfile}>
                <Save size={15} /> {isSavingCompanyProfile ? 'Kaydediliyor' : 'Kaydet'}
              </button>
            </div>
            <div className="ai-profile-grid">
              <label>
                Firma Adi
                <input value={companyProfile.companyName || ''} onChange={(e) => updateCompanyProfile({ companyName: e.target.value })} />
              </label>
              <label>
                Mesaj Dili
                <select value={companyProfile.outreachLanguage || 'tr'} onChange={(e) => updateCompanyProfile({ outreachLanguage: e.target.value })}>
                  <option value="tr">Turkce</option>
                  <option value="en">Ingilizce</option>
                  <option value="ru">Rusca</option>
                  <option value="mixed">Ulkeye gore</option>
                </select>
              </label>
              <label className="wide-field">
                Firma Tanimi
                <textarea value={companyProfile.description || ''} onChange={(e) => updateCompanyProfile({ description: e.target.value })} />
              </label>
              <label className="wide-field">
                Deger Onerisi
                <textarea value={companyProfile.valueProposition || ''} onChange={(e) => updateCompanyProfile({ valueProposition: e.target.value })} />
              </label>
              <label>
                Urun Gruplari
                <textarea value={listToText(companyProfile.productCategories)} onChange={(e) => updateCompanyProfile({ productCategories: textToList(e.target.value) })} />
              </label>
              <label>
                Hedef Musteri Tipleri
                <textarea value={listToText(companyProfile.targetCustomerTypes)} onChange={(e) => updateCompanyProfile({ targetCustomerTypes: textToList(e.target.value) })} />
              </label>
              <label>
                Uygun Olmayan Tipler
                <textarea value={listToText(companyProfile.excludedCustomerTypes)} onChange={(e) => updateCompanyProfile({ excludedCustomerTypes: textToList(e.target.value) })} />
              </label>
              <label>
                Hedef Ulke/Bolge
                <textarea value={listToText(companyProfile.targetCountries)} onChange={(e) => updateCompanyProfile({ targetCountries: textToList(e.target.value) })} />
              </label>
              <label className="wide-field">
                Satis Dili ve Ton
                <textarea value={companyProfile.salesTone || ''} onChange={(e) => updateCompanyProfile({ salesTone: e.target.value })} />
              </label>
              <label className="wide-field">
                Minimum Siparis / Ilk Temas Notu
                <textarea value={companyProfile.minimumOrderNote || ''} onChange={(e) => updateCompanyProfile({ minimumOrderNote: e.target.value })} />
              </label>
            </div>
          </section>
        )}
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ title, value, icon }) {
  return (
    <div className="kpi-card">
      <span>{title}</span>
      <strong>{value}</strong>
      {icon && <i>{icon}</i>}
    </div>
  );
}

function ReportList({ title, items = [] }) {
  if (!items.length) return null;
  return (
    <div>
      <strong>{title}</strong>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
