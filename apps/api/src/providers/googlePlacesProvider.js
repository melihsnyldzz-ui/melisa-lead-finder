const GOOGLE_PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PLACES_DETAILS_URL = 'https://places.googleapis.com/v1/places';

import { isClearlyOutsideBabyKidsClothingTarget } from '../services/leadScoring.js';

const TEXT_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.googleMapsUri',
  'places.businessStatus',
  'places.primaryType',
  'places.types',
].join(',');

const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'googleMapsUri',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'rating',
  'userRatingCount',
  'websiteUri',
  'businessStatus',
  'primaryType',
  'types',
  'regularOpeningHours',
].join(',');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGoogleError(error) {
  return error.name === 'TypeError'
    || ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code)
    || error.status === 429
    || error.status >= 500;
}

function toGooglePlacesError(error) {
  const message = error.message || '';
  const causeCode = error.cause?.code;
  const friendly = new Error(message);
  friendly.status = error.status || 502;
  friendly.payload = error.payload;

  if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN') {
    friendly.message = 'Google Places API adresine ulasilamadi. Internet, DNS veya guvenlik duvari ayarini kontrol edip tekrar calistir.';
    return friendly;
  }

  if (causeCode === 'ECONNRESET' || causeCode === 'ETIMEDOUT' || causeCode === 'UND_ERR_CONNECT_TIMEOUT' || message === 'fetch failed') {
    friendly.message = 'Google Places API baglantisi gecici olarak basarisiz oldu. Birazdan tekrar calistir.';
    return friendly;
  }

  if (error.status === 401 || error.status === 403) {
    friendly.message = 'Google Places API yetkisi reddedildi. API key, Places API izni ve faturalandirma ayarlarini kontrol et.';
    return friendly;
  }

  if (error.status === 429) {
    friendly.message = 'Google Places API kota veya hiz limiti doldu. Biraz bekleyip tekrar dene ya da Google Cloud limitlerini kontrol et.';
    return friendly;
  }

  return friendly;
}

function getRunLimit() {
  const configured = Number(process.env.GOOGLE_PLACES_MAX_RUN_RESULTS || 50);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 50) : 50;
}

const GOOGLE_PLACES_LANGUAGE_CODES = new Set(['en', 'ro', 'bg', 'de', 'tr', 'ru', 'uk', 'pl', 'el', 'sr', 'hr', 'sq']);

function getGooglePlacesLanguageCode(language) {
  return GOOGLE_PLACES_LANGUAGE_CODES.has(language) ? language : 'en';
}

function shouldUseStrictClothingTypeFilter(task) {
  return task.sourceType === 'GOOGLE_PLACES'
    && task.keywordGroup === 'baby/kids retail'
    && process.env.GOOGLE_PLACES_STRICT_CLOTHING_TYPE !== 'false';
}

function pickAddressCity(place, fallbackCity) {
  if (fallbackCity) return fallbackCity;
  return place.shortFormattedAddress?.split(',')?.at(-2)?.trim() || null;
}

function mapPlaceToLead(place, task) {
  const displayName = place.displayName?.text || 'Unknown place';
  const phone = place.internationalPhoneNumber || place.nationalPhoneNumber || null;

  return {
    googlePlaceId: place.id,
    companyName: displayName,
    displayName,
    country: task.country,
    city: pickAddressCity(place, task.city),
    address: place.formattedAddress || null,
    phone,
    internationalPhoneNumber: place.internationalPhoneNumber || null,
    whatsapp: phone,
    website: place.websiteUri || null,
    googleMapsUrl: place.googleMapsUri || null,
    sourceType: 'GOOGLE_PLACES',
    sourceQuery: task.query,
    sourceKeyword: task.sourceKeyword || task.query,
    sourceCity: task.city || null,
    sourceCountry: task.country,
    categoryGuess: place.primaryType || place.types?.join(', ') || null,
    businessStatus: place.businessStatus || null,
    types: place.types || [],
    openingHours: place.regularOpeningHours || null,
    rating: place.rating || null,
    userRatingsTotal: place.userRatingCount || 0,
    notes: 'Google Places provider tarafindan bulundu',
    rawPayload: {
      provider: 'google_places',
      textSearchQuery: task.query,
      placeId: place.id,
      rating: place.rating || null,
      userRatingsTotal: place.userRatingCount || 0,
      businessStatus: place.businessStatus || null,
      types: place.types || [],
      google: place,
    },
  };
}

function compactSearchResult(lead, { status = 'found', reason = null } = {}) {
  return {
    googlePlaceId: lead.googlePlaceId,
    companyName: lead.companyName,
    country: lead.country,
    city: lead.city,
    address: lead.address,
    phone: lead.internationalPhoneNumber || lead.phone || null,
    website: lead.website,
    googleMapsUrl: lead.googleMapsUrl,
    rating: lead.rating,
    userRatingsTotal: lead.userRatingsTotal,
    businessStatus: lead.businessStatus,
    types: lead.types || [],
    sourceQuery: lead.sourceQuery,
    sourceKeyword: lead.sourceKeyword,
    status,
    reason,
  };
}

async function requestGoogleJson(url, { apiKey, method = 'GET', fieldMask, body }) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      break;
    } catch (error) {
      lastError = error;
      if (!isTransientGoogleError(error) || attempt === 2) {
        throw toGooglePlacesError(error);
      }
      await sleep(400 * (attempt + 1));
    }
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Google Places request failed with ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    if (isTransientGoogleError(error)) {
      lastError = error;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await sleep(600 * (attempt + 1));
        const retryResponse = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }).catch((retryError) => {
          lastError = retryError;
          return null;
        });
        if (!retryResponse) continue;
        const retryPayload = await retryResponse.json().catch(() => ({}));
        if (retryResponse.ok) return retryPayload;
        lastError = Object.assign(new Error(retryPayload.error?.message || `Google Places request failed with ${retryResponse.status}`), {
          status: retryResponse.status,
          payload: retryPayload,
        });
      }
    }
    throw toGooglePlacesError(lastError || error);
  }

  return payload;
}

async function fetchPlaceDetails(placeId, apiKey) {
  return requestGoogleJson(`${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(placeId)}`, {
    apiKey,
    fieldMask: DETAILS_FIELD_MASK,
  });
}

export async function runGooglePlacesSearch(task, options = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const error = new Error('GOOGLE_PLACES_API_KEY is not configured');
    error.status = 400;
    throw error;
  }

  const detailDelayMs = Math.max(0, Number(process.env.GOOGLE_PLACES_DETAIL_DELAY_MS || 100));
  const maxResultCount = Math.min(Number(task.maxResults) || 20, 20, getRunLimit());
  const requestBody = {
    textQuery: task.query,
    languageCode: getGooglePlacesLanguageCode(task.language),
    maxResultCount,
    ...(shouldUseStrictClothingTypeFilter(task)
      ? { includedType: 'clothing_store', strictTypeFiltering: true }
      : {}),
  };

  const body = await requestGoogleJson(GOOGLE_PLACES_TEXT_SEARCH_URL, {
    apiKey,
    method: 'POST',
    fieldMask: TEXT_SEARCH_FIELD_MASK,
    body: requestBody,
  });

  const places = body.places || [];
  const leads = [];
  const searchedResults = [];
  let skippedDetailsCount = 0;
  let detailErrorCount = 0;
  let filteredOutCount = 0;

  for (const place of places) {
    const preliminaryLead = mapPlaceToLead(place, task);
    if (isClearlyOutsideBabyKidsClothingTarget(preliminaryLead)) {
      filteredOutCount += 1;
      searchedResults.push(compactSearchResult(preliminaryLead, {
        status: 'filtered_out',
        reason: 'Hedef disi gorundugu icin detay alinmadi',
      }));
      continue;
    }

    if (options.shouldSkipPlaceDetails && await options.shouldSkipPlaceDetails(place.id)) {
      skippedDetailsCount += 1;
      searchedResults.push(compactSearchResult(preliminaryLead, {
        status: 'duplicate_skipped',
        reason: 'Bu Google Place daha once islenmis',
      }));
      continue;
    }

    try {
      if (detailDelayMs > 0 && leads.length > 0) {
        await sleep(detailDelayMs);
      }
      const detailedPlace = await fetchPlaceDetails(place.id, apiKey);
      const detailedLead = mapPlaceToLead({ ...place, ...detailedPlace }, task);
      leads.push(detailedLead);
      searchedResults.push(compactSearchResult(detailedLead, { status: 'candidate' }));
    } catch {
      detailErrorCount += 1;
      leads.push(preliminaryLead);
      searchedResults.push(compactSearchResult(preliminaryLead, {
        status: 'candidate',
        reason: 'Detay alinamadi; text search verisiyle aday yapildi',
      }));
    }
  }

  return {
    leads,
    foundCount: places.length,
    skippedDetailsCount,
    detailErrorCount,
    filteredOutCount,
    searchedResults,
    textSearchCount: 1,
    detailRequestCount: leads.length,
  };
}
