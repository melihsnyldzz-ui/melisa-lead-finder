import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bot, Copy, Download, Flame, Globe, MapPin, MessageCircle, Phone, Play, Save, Search, Settings, ThumbsDown, ThumbsUp, UsersRound } from 'lucide-react';
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
  GOOGLE_PLACES: 'Google Places',
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

const keywordGroups = {
  'baby/kids retail': 'Bebek/Çocuk Giyim Mağazası',
};

const automaticSearchKeywords = [
  'baby clothing store',
  'kids clothing store',
  "children's clothing store",
  "children's wear store",
  'kids fashion store',
  'baby kids clothing store',
];

const googlePlacesLanguageCodes = new Set(['en', 'ro', 'bg', 'de', 'tr', 'ru', 'uk', 'pl', 'el', 'sr', 'hr', 'sq']);

function getGooglePlacesLanguageCode(language) {
  return googlePlacesLanguageCodes.has(language) ? language : 'en';
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
  const keywords = uniqueList([
    ...(aiSearchPlan?.keywords || []),
    ...(aiSearchPlan?.localKeywords || []),
    ...automaticSearchKeywords,
    ...(selectedPreset?.queries || []),
  ]);
  const queries = keywords.flatMap((keyword) => (
    city ? [`${keyword} ${city}`, `${keyword} near ${city} center`] : [keyword]
  ));
  const primaryKeyword = keywords[0] || 'baby clothing store';
  const primaryQuery = city ? `${primaryKeyword} ${city}` : primaryKeyword;
  const groupLabel = keywordGroups[taskForm.keywordGroup] || 'Bebek/Cocuk Giyim Magazasi';

  return {
    city,
    keywords,
    queries,
    primaryKeyword,
    primaryQuery,
    name: [taskForm.country, city, groupLabel, 'Akilli Arama'].filter(Boolean).join(' '),
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
  const [filters, setFilters] = useState({ country: '', city: '', minScore: '', q: '', status: '' });
  const [taskForm, setTaskForm] = useState(pilotDefaults);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
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
  const [selectedPresetCode, setSelectedPresetCode] = useState('RO');
  const [aiSearchPlan, setAiSearchPlan] = useState(null);
  const [isPlanningSearch, setIsPlanningSearch] = useState(false);
  const [searchHistory, setSearchHistory] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [safety, setSafety] = useState(null);
  const mapElementRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerLayerRef = useRef(null);

  const hotLeads = useMemo(() => leads.filter((lead) => lead.leadScore >= 80 || lead.status === 'HOT'), [leads]);
  const selectedPreset = useMemo(
    () => balkanCountryPresets.find((preset) => preset.code === selectedPresetCode),
    [selectedPresetCode],
  );
  const selectedMarketProfile = selectedPreset ? countryMarketProfiles[selectedPreset.code] : null;
  const automaticSearchPlan = useMemo(
    () => buildAutomaticSearchPlan(taskForm, selectedPreset, aiSearchPlan),
    [taskForm.country, taskForm.city, taskForm.keywordGroup, selectedPreset, aiSearchPlan],
  );
  const selectedFilterPreset = useMemo(
    () => balkanCountryPresets.find((preset) => preset.name === filters.country),
    [filters.country],
  );
  const currentFilterQuery = useMemo(() => (
    new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '')).toString()
  ), [filters]);
  const coverageByCountry = useMemo(() => coverage.reduce((acc, item) => {
    acc[item.country] = item;
    return acc;
  }, {}), [coverage]);
  const selectedLeadPhone = selectedLead?.internationalPhoneNumber || selectedLead?.phone || '';
  const selectedLeadPhoneHref = selectedLeadPhone ? `tel:${normalizePhoneForLink(selectedLeadPhone)}` : '';
  const selectedLeadWhatsappHref = selectedLeadPhone
    ? `https://wa.me/${normalizePhoneForWhatsApp(selectedLeadPhone)}`
    : '';

  async function refresh() {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '')).toString();
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

  useEffect(() => {
    Promise.all([
      refresh(),
      apiGet('/providers').then(setProviders),
      apiGet('/ai/company-profile').then(setCompanyProfile),
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
        countryPreset: {
          code: preset.code,
          name: preset.name,
          cities: preset.cities,
          queries: preset.queries,
        },
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

  function applyCountryPreset(preset) {
    const city = preset.cities[0];
    const sourceKeyword = preset.queries[0];
    setSelectedPresetCode(preset.code);
    setAiSearchPlan(null);
    setTaskForm({
      ...taskForm,
      name: `${preset.name} ${city} ${keywordGroups[taskForm.keywordGroup] || taskForm.keywordGroup}`,
      country: preset.name,
      city,
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
    const sourceKeyword = aiSearchPlan?.keywords?.[0] || aiSearchPlan?.localKeywords?.[0] || taskForm.sourceKeyword || selectedPreset?.queries[0] || 'baby clothing store';
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
      await refresh();
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
    setRunningTaskId(id);
    try {
      const task = await apiPost(`/search-tasks/${id}/run`, {});
      setLastRunSummary(task);
      await refresh();
      setMessage(`${task.foundCount || 0} sonuç bulundu, ${task.createdCount || 0} yeni lead eklendi, ${task.duplicateCount || 0} tekrar atlandı`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunningTaskId(null);
    }
  }

  async function createAndRunGoogleSearch(event) {
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
      const created = await apiPost('/search-tasks', getAutomaticTaskPayload({ sourceType: 'GOOGLE_PLACES', allowDuplicate }));
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
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function clearFilters() {
    setFilters({ country: '', city: '', minScore: '', q: '', status: '' });
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const [leadsData, statsData, tasksData, historyData, coverageData, safetyData] = await Promise.all([
        apiGet('/leads'),
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
      setSelectedLead(leadsData[0] || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  function setCountryFilter(country) {
    const preset = balkanCountryPresets.find((item) => item.name === country);
    setFilters({
      ...filters,
      country,
      city: preset?.cities.includes(filters.city) ? filters.city : '',
    });
  }

  function showHotLeads() {
    setFilters({ ...filters, minScore: '80', status: '' });
  }

  function selectRunResult(result) {
    if (!result?.id) return;
    const lead = leads.find((item) => item.id === result.id);
    if (lead) setSelectedLead(lead);
  }

  async function showTaskSummary(task) {
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        country: task.country,
        ...(task.city ? { city: task.city } : {}),
      }).toString();
      const taskLeads = await apiGet(`/leads?${params}`);
      const searchedResults = taskLeads.slice(0, 100).map((lead) => ({
        id: lead.id,
        googlePlaceId: lead.googlePlaceId,
        companyName: lead.companyName,
        country: lead.country,
        city: lead.city,
        phone: lead.internationalPhoneNumber || lead.phone,
        website: lead.website,
        googleMapsUrl: lead.googleMapsUrl,
        rating: lead.rating,
        userRatingsTotal: lead.userRatingsTotal,
        leadScore: lead.leadScore,
        businessStatus: lead.businessStatus,
        sourceQuery: lead.sourceQuery,
        sourceKeyword: lead.sourceKeyword,
        status: 'found',
      }));
      setLastRunSummary({
        ...task,
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
            <strong>Melisa Lead Finder</strong>
            <span>Planlı Google Places araması</span>
          </div>
        </div>
        <nav>
          <button className={`nav-item ${activeView === 'leads' ? 'active' : ''}`} onClick={() => setActiveView('leads')} type="button"><UsersRound size={18} /> Lead Paneli</button>
          <button className="nav-item" onClick={() => setActiveView('leads')} type="button"><Search size={18} /> Arama Gorevleri</button>
          <button className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')} type="button"><Settings size={18} /> Ayarlar</button>
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <h1>{activeView === 'settings' ? 'AI Ayarlari' : 'Lead Finder Paneli'}</h1>
            <p>
              {activeView === 'settings'
                ? 'Firma bilgilerini, hedef musteri profilini ve Gemini AI baglantisini yonet.'
                : 'Hedef ulke, sehir ve anahtar kelime gruplariyla Avrasya bebek ve cocuk giyim musteri adaylarini bul.'}
            </p>
          </div>
          {activeView === 'leads' && <a className="primary-link" href={exportCsvUrl(currentFilterQuery)}><Download size={17} /> CSV Disa Aktar</a>}
        </header>

        {(error || message) && <div className={`notice ${error ? 'error' : 'success'}`}>{error || message}</div>}

        {activeView === 'leads' && (
          <>
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
          <form className="smart-search-form" onSubmit={createAndRunGoogleSearch}>
            <div className="smart-search-controls">
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
                    : `${automaticSearchPlan.queries.length} Google Places sorgusu otomatik calisacak. Sistem sadece bebek giyim ve cocuk giyim magazalarini hedefler.`}
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
              <Search size={15} /> {isCreatingTask || runningTaskId ? 'Çalışıyor' : 'Google Araması Çalıştır'}
            </button>
            <button className="secondary-button" type="button" disabled={isCreatingTask} onClick={createTask}>Sadece Görev Oluştur</button>
          </form>

          <div className="run-summary-panel">
            <div className="panel-header"><h2>Çalışma Özeti</h2></div>
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
                {(lastRunSummary.searchedResults || []).length > 0 && (
                  <div className="searched-results-box">
                    <div className="searched-results-header">
                      <strong>Arananlar</strong>
                      <span>{lastRunSummary.searchedResults.length} sonuc</span>
                    </div>
                    <div className="searched-results-list">
                      {lastRunSummary.searchedResults.map((result) => (
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
                          </span>
                          <em>{runResultStatusLabels[result.status] || result.status}</em>
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
          </div>
          </div>
        </section>

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
                <select value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })}>
                  <option value="">Tüm şehirler</option>
                  {selectedFilterPreset.cities.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              ) : (
                <input placeholder="Şehir" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
              )}
              <select value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: e.target.value })}>
                <option value="">Tüm skorlar</option>
                <option value="80">80+ Sıcak</option>
                <option value="60">60+ Uygun</option>
                <option value="40">40+ İnceleme</option>
              </select>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">Tüm durumlar</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button type="button" onClick={applyFilters} disabled={isLoading}>{isLoading ? 'Yükleniyor' : 'Filtrele'}</button>
              <button type="button" className="secondary-button" onClick={showHotLeads} disabled={isLoading}>Sıcaklar</button>
              <button type="button" className="secondary-button" onClick={clearFilters} disabled={isLoading}>Temizle</button>
            </div>
            <div className="lead-table">
              {isLoading && <div className="empty-state">Lead listesi yükleniyor.</div>}
              {!isLoading && leads.length === 0 && <div className="empty-state">Bu filtrelerle lead bulunamadı.</div>}
              {leads.map((lead) => (
                <div
                  className={`lead-row ${selectedLead?.id === lead.id ? 'selected' : ''}`}
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedLead(lead);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <strong className={lead.leadScore >= 80 ? 'score hot' : 'score'}>{lead.leadScore}</strong>
                  <span className="lead-main">
                    <strong>{lead.companyName}</strong>
                    <small>{lead.country} {lead.city ? `- ${lead.city}` : ''}</small>
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
                  <dt>Maps</dt><dd>{selectedLead.googleMapsUrl || '-'}</dd>
                  <dt>Puan</dt><dd>{selectedLead.rating || '-'} ({selectedLead.userRatingsTotal || 0})</dd>
                  <dt>Durum</dt><dd>{selectedLead.businessStatus || '-'}</dd>
                  <dt>Skor Sebebi</dt><dd>{selectedLead.scoreReason || '-'}</dd>
                </dl>
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

        <section className="panel wide-panel">
          <div className="panel-header"><h2>Son Görevler</h2></div>
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
        </section>
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
              </div>
            ))}
          </div>
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
