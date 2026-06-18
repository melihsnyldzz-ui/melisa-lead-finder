import { isBabyKidsClothingLead } from '../services/leadScoring.js';

const instagramProfiles = [
  { handle: 'mini.style', label: 'Mini Style', signal: 'kids clothing boutique', followers: 18400 },
  { handle: 'baby.corner', label: 'Baby Corner', signal: 'baby clothing shop', followers: 12700 },
  { handle: 'littlewear', label: 'Little Wear', signal: 'children wear store', followers: 22100 },
  { handle: 'kids.modashop', label: 'Kids Moda Shop', signal: 'kids fashion store', followers: 9600 },
  { handle: 'bebek.outlet', label: 'Bebek Outlet', signal: 'baby kids clothing store', followers: 15300 },
  { handle: 'tiny.boutique', label: 'Tiny Boutique', signal: "children's boutique", followers: 8100 },
  { handle: 'mama.babywear', label: 'Mama Babywear', signal: 'infant clothing store', followers: 11600 },
  { handle: 'junior.collection', label: 'Junior Collection', signal: 'children clothing retail', followers: 19300 },
];

function getApifyConfig() {
  return {
    token: process.env.APIFY_TOKEN || '',
    actorId: process.env.APIFY_INSTAGRAM_ACTOR_ID || process.env.INSTAGRAM_APIFY_ACTOR_ID || '',
  };
}

function slugify(value) {
  return String(value || 'market')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function normalizeActorId(actorId) {
  return String(actorId || '').trim().replace(/\//g, '~');
}

function applyTemplate(value, task) {
  return JSON.parse(JSON.stringify(value).replaceAll('{{query}}', task.query || '').replaceAll('{{city}}', task.city || '').replaceAll('{{country}}', task.country || '').replaceAll('{{maxResults}}', String(task.maxResults || 20)));
}

function getDiscoveryLimit(maxResults) {
  const requested = Number(maxResults) || 20;
  return Math.max(20, Math.min(50, requested * 4));
}

function buildApifyInput(task) {
  if (process.env.APIFY_INSTAGRAM_INPUT_TEMPLATE) {
    try {
      return applyTemplate(JSON.parse(process.env.APIFY_INSTAGRAM_INPUT_TEMPLATE), task);
    } catch {
      return null;
    }
  }

  const actorId = getApifyConfig().actorId;
  const taggedSearchType = String(task.sourceKeyword || '').match(/^(user|hashtag|place):/i)?.[1]?.toLowerCase();
  const inferredSearchType = taggedSearchType || (String(task.query || '').trim().startsWith('#') ? 'hashtag' : 'user');
  if (actorId.includes('instagram-search-scraper')) {
    return {
      search: task.query,
      searchType: inferredSearchType,
      searchLimit: getDiscoveryLimit(task.maxResults),
      enhanceUserSearchWithFacebookPage: false,
    };
  }

  return {
    search: task.query,
    query: task.query,
    searchType: inferredSearchType,
    resultsLimit: getDiscoveryLimit(task.maxResults),
    maxItems: getDiscoveryLimit(task.maxResults),
  };
}

function pickFirst(item, keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && String(item[key]).trim()) return item[key];
  }
  return null;
}

function pickNested(item, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], item);
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return null;
}

function normalizeInstagramUrl(value, handle) {
  if (value && String(value).startsWith('http')) return String(value);
  const cleanHandle = String(handle || value || '').replace(/^@/, '').trim();
  return cleanHandle ? `https://www.instagram.com/${cleanHandle}/` : null;
}

function buildInstagramCategoryGuess(item, bio) {
  return [
    item.category,
    item.businessCategoryName,
    item.categoryName,
    item.businessCategory,
    item.name,
    item.fullName,
    item.username,
    bio,
  ].filter(Boolean).join(' ').slice(0, 250);
}

function buildLeadFromApifyItem(task, item, index) {
  const handle = pickFirst(item, ['username', 'userName', 'handle', 'account', 'profileName', 'ownerUsername'])
    || pickNested(item, ['ig_business.profile.username', 'profile.username']);
  const rawUrl = pickFirst(item, ['url', 'profileUrl', 'instagramUrl', 'inputUrl'])
    || pickNested(item, ['ig_business.profile.url', 'ig_business.profile.profileUrl', 'profile.url']);
  if (item?.error && !handle && !rawUrl) return null;
  const displayName = pickFirst(item, ['fullName', 'name', 'displayName', 'title'])
    || pickNested(item, ['ig_business.profile.fullName', 'profile.fullName'])
    || handle
    || `Instagram profile ${index + 1}`;
  const instagram = normalizeInstagramUrl(rawUrl, handle);
  const followers = Number(pickFirst(item, ['followersCount', 'followers', 'followerCount'])) || 0;
  const bio = pickFirst(item, ['biography', 'bio', 'description'])
    || pickNested(item, ['ig_business.profile.biography', 'profile.biography'])
    || '';
  const website = pickFirst(item, ['externalUrl', 'website', 'websiteUrl']);
  const phone = pickFirst(item, ['phoneNumber', 'phone', 'whatsapp']);
  const email = pickFirst(item, ['email', 'publicEmail']);
  const address = pickFirst(item, ['location_address', 'address', 'streetAddress']);
  const city = pickFirst(item, ['location_city', 'city']) || task.city;
  const categoryGuess = buildInstagramCategoryGuess(item, bio);

  return {
    companyName: displayName,
    displayName: handle ? `@${String(handle).replace(/^@/, '')}` : displayName,
    country: task.country,
    city,
    address,
    phone,
    internationalPhoneNumber: phone,
    whatsapp: phone,
    email,
    website: website && String(website).startsWith('http') ? String(website) : null,
    instagram,
    sourceType: 'INSTAGRAM',
    sourceQuery: task.query,
    sourceKeyword: task.sourceKeyword,
    sourceCity: city,
    sourceCountry: task.country,
    categoryGuess,
    types: ['instagram_profile', item.searchSource === 'google' ? 'instagram_place' : 'online_store'].filter(Boolean),
    notes: item?.error
      ? `Apify Instagram actor tarafindan kismi profil sonucu bulundu: ${item.errorDescription || item.error}`
      : 'Apify Instagram actor tarafindan bulundu.',
    rawPayload: {
      provider: 'apify_instagram',
      handle,
      followers,
      bio,
      isBusinessAccount: Boolean(item.isBusinessAccount || item.businessCategoryName),
      item,
    },
  };
}

async function runApifyInstagramSearch(task) {
  const { token, actorId } = getApifyConfig();
  if (!token || !actorId) return null;

  const input = buildApifyInput(task);
  if (!input) return null;

  const url = `https://api.apify.com/v2/actors/${normalizeActorId(actorId)}/run-sync-get-dataset-items?clean=true&format=json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Apify Instagram actor failed: ${response.status} ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }

  const items = await response.json();
  return (Array.isArray(items) ? items : [])
    .map((item, index) => buildLeadFromApifyItem(task, item, index))
    .filter(Boolean)
    .filter((lead) => isBabyKidsClothingLead(lead))
    .slice(0, Number(task.maxResults) || 20);
}

function buildInstagramLead({ country, city, query, sourceKeyword }, profile, index) {
  const locationSlug = slugify(city || country);
  const handle = `${profile.handle}.${locationSlug}.${index + 1}`;
  const hasWhatsapp = index % 3 !== 2;
  const hasWebsite = index % 2 === 0;
  const phoneSuffix = String(700000 + (locationSlug.length * 113) + index).slice(-6);
  const phone = hasWhatsapp ? `+90 5${phoneSuffix.slice(0, 2)} ${phoneSuffix.slice(2, 5)} ${phoneSuffix.slice(5)}${index}` : null;

  return {
    companyName: `${profile.label} ${city || country}`,
    displayName: `@${handle}`,
    country,
    city,
    phone,
    internationalPhoneNumber: phone,
    whatsapp: phone?.replace(/\s/g, '') || null,
    website: hasWebsite ? `https://${handle.replace(/\./g, '-')}.example.com` : null,
    instagram: `https://www.instagram.com/${handle}/`,
    sourceType: 'INSTAGRAM',
    sourceQuery: query,
    sourceKeyword,
    sourceCity: city,
    sourceCountry: country,
    categoryGuess: profile.signal,
    types: ['instagram_profile', 'clothing_store', 'online_store'],
    notes: 'Instagram aday arama modulu tarafindan bulundu. Canli scraper baglaninca bu kayit gercek profil verisiyle zenginlestirilecek.',
    rawPayload: {
      provider: 'instagram_candidate',
      handle,
      followers: profile.followers + (index * 730),
      bioSignals: [profile.signal, 'whatsapp sales', 'kids collection'],
      query,
      sourceKeyword,
      isMockCandidate: true,
    },
  };
}

export async function runInstagramSearch({ country, city, query, sourceKeyword, maxResults = 20 }) {
  const task = { country, city, query, sourceKeyword, maxResults };
  const { token, actorId } = getApifyConfig();
  try {
    const liveLeads = await runApifyInstagramSearch(task);
    if (liveLeads?.length) return liveLeads;
  } catch (err) {
    if (token && actorId) throw err;
  }

  if (token && actorId) return [];

  const count = Math.min(Number(maxResults) || 20, 50);
  return Array.from({ length: count }).map((_, index) => {
    const profile = instagramProfiles[index % instagramProfiles.length];
    return buildInstagramLead({ country, city, query, sourceKeyword }, profile, index);
  });
}
