const AUDIENCE_TERMS = [
  'baby',
  'babies',
  'kids',
  'kid',
  'children',
  "children's",
  'childrens',
  'infant',
  'toddler',
  'newborn',
  'bebek',
  'çocuk',
  'cocuk',
  'copii',
  'bebe',
  'kinder',
  'детск',
  'дети',
  'ребен',
  'малыш',
  'младен',
  'дитяч',
  'бебеш',
];

const CLOTHING_TERMS = [
  'clothing',
  'clothes',
  'wear',
  'fashion',
  'apparel',
  'garment',
  'boutique',
  'retailer',
  'online store',
  'online shop',
  'giyim',
  'kiyafet',
  'kıyafet',
  'haine',
  'imbracaminte',
  'îmbrăcăminte',
  'bekleidung',
  'mode',
  'odzież',
  'одежд',
  'одяг',
  'дрехи',
  'дүкөн',
  'дүкен',
];

const STRONG_CLOTHING_PHRASES = [
  'baby clothing',
  'baby clothes',
  'kids clothing',
  'kids clothes',
  "children's clothing",
  "children's wear",
  "children's boutique",
  'bebek giyim',
  'çocuk giyim',
  'cocuk giyim',
  'haine copii',
  'haine bebe',
  'kinderbekleidung',
  'kindermode',
  'sklep z odzieżą dziecięcą',
  'детская одежда',
  'детской одежды',
  'одежда для детей',
  'одежда для малышей',
  'магазин детской одежды',
  'дитячий одяг',
  'бебешки дрехи',
];

const CHILDREN_CLOTHING_BRAND_TERMS = [
  'baby boom',
  'babyboom',
  'babydress',
  'bambini',
  'bebetto',
  'karapuz',
  'monnalisa',
  'playtoday',
  'mini-ya',
  'miniya',
  'kids joy',
  'germany kids',
  'kari kids',
];

const RETAIL_TERMS = [
  'store',
  'shop',
  'boutique',
  'mağaza',
  'magaza',
  'dukkan',
  'dükkan',
  'butik',
  'siparis',
  'sipariş',
  'whatsapp',
  'catalog',
  'katalog',
  'магазин',
  'крама',
  'խանութ',
  'mağazası',
  'dükany',
  'doʻkoni',
  'dükөнү',
  'дүкені',
];

const SALES_READY_TERMS = [
  'whatsapp',
  'order',
  'orders',
  'catalog',
  'catalogue',
  'retail',
  'retailer',
  'boutique',
  'online shop',
  'online store',
  'delivery',
  'shipping',
  'siparis',
  'sipariş',
  'katalog',
  'toptan',
  'wholesale',
  'dm for order',
  'link in bio',
];

const LOW_INTENT_PROFILE_TERMS = [
  'blog',
  'influencer',
  'personal blog',
  'mom blog',
  'mummy blog',
  'photography',
  'model',
  'fan page',
  'community',
];

const UNRELATED_TYPES = [
  'restaurant',
  'cafe',
  'bar',
  'lodging',
  'hotel',
  'car_repair',
  'gas_station',
  'real_estate_agency',
  'toy_store',
  'book_store',
  'shoe_store',
  'furniture_store',
  'pharmacy',
  'shopping_mall',
  'supermarket',
];

const UNRELATED_TERMS = [
  'toy',
  'toys',
  'shoe',
  'shoes',
  'ayakkabı',
  'oyuncak',
  'jucarii',
  'jucării',
  'spielzeug',
  'игруш',
  'pharmacy',
  'eczane',
  'furniture',
  'mobilya',
  'stroller',
  'pram',
  'car seat',
  'mall',
  'shopping center',
  'supermarket',
  'hypermarket',
];

AUDIENCE_TERMS.push(
  'çocuk',
  'детск',
  'дети',
  'ребен',
  'малыш',
  'бебеш',
  'дитяч',
  'дитин',
  'copil',
  'dzieci',
);

CLOTHING_TERMS.push(
  'kıyafet',
  'îmbrăcăminte',
  'odzież',
  'одежд',
  'дрех',
  'одяг',
  'облек',
  'ubran',
);

STRONG_CLOTHING_PHRASES.push(
  'çocuk giyim',
  'sklep z odzieżą dziecięcą',
  'детская одежда',
  'детской одежды',
  'магазин детской одежды',
  'детски дрехи',
  'бебешки дрехи',
  'дитячий одяг',
  'одежда для детей',
  'одежда для малышей',
);

const TARGET_CONTEXT_TERMS = [
  ...AUDIENCE_TERMS,
  ...CLOTHING_TERMS,
  ...STRONG_CLOTHING_PHRASES,
  ...CHILDREN_CLOTHING_BRAND_TERMS,
];

function professionalDomain(website) {
  if (!website) return false;
  try {
    const host = new URL(website).hostname.replace(/^www\./, '');
    return Boolean(host.includes('.') && !/(facebook|instagram|linktr|blogspot|wordpress)\./i.test(host));
  } catch {
    return false;
  }
}

function scoreStatus(score) {
  if (score >= 80) return 'HOT';
  if (score >= 60) return 'QUALIFIED';
  if (score >= 40) return 'REVIEW';
  return 'LOW_QUALITY';
}

function scorePriority(score) {
  if (score >= 90) return 'VIP';
  if (score >= 80) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function buildResultText(lead) {
  return [
    lead.companyName,
    lead.displayName,
    lead.categoryGuess,
    lead.notes,
    lead.rawPayload?.bio,
    ...(lead.rawPayload?.bioSignals || []),
    ...(lead.types || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function buildQueryText(lead) {
  return [
    lead.sourceQuery,
    lead.sourceKeyword,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function isBabyKidsClothingLead(lead) {
  const resultText = buildResultText(lead);
  const hasUnrelatedType = (lead.types || []).some((type) => UNRELATED_TYPES.includes(type));
  const hasUnrelatedTerm = includesAny(resultText, UNRELATED_TERMS);
  const resultHasStrongPhrase = includesAny(resultText, STRONG_CLOTHING_PHRASES);
  const resultHasKnownKidsBrand = includesAny(resultText, CHILDREN_CLOTHING_BRAND_TERMS);
  const resultHasAudience = includesAny(resultText, AUDIENCE_TERMS);
  const resultHasClothing = includesAny(resultText, CLOTHING_TERMS) || (lead.types || []).includes('clothing_store');
  const resultHasRetail = includesAny(resultText, RETAIL_TERMS) || (lead.types || []).includes('store');

  if ((hasUnrelatedType || hasUnrelatedTerm) && !resultHasStrongPhrase && !resultHasKnownKidsBrand) {
    return false;
  }

  return resultHasStrongPhrase || resultHasKnownKidsBrand || (resultHasAudience && (resultHasClothing || resultHasRetail));
}

export function isClearlyOutsideBabyKidsClothingTarget(lead) {
  const resultText = buildResultText(lead);
  const hasTargetContext = includesAny(resultText, TARGET_CONTEXT_TERMS);
  const hasUnrelatedType = (lead.types || []).some((type) => UNRELATED_TYPES.includes(type));
  const hasUnrelatedTerm = includesAny(resultText, UNRELATED_TERMS);

  return (hasUnrelatedType || hasUnrelatedTerm) && !hasTargetContext;
}

export function scoreLead(lead) {
  const reasons = [];
  let score = 0;
  let fitScore = 0;
  let contactScore = 0;
  let activityScore = 0;
  let potentialScore = 0;
  let riskScore = 5;

  const resultText = buildResultText(lead);
  const queryText = buildQueryText(lead);
  const text = [resultText, queryText].filter(Boolean).join(' ');

  const isTarget = isBabyKidsClothingLead(lead);
  const hasAudienceSignal = includesAny(resultText, AUDIENCE_TERMS)
    || includesAny(resultText, CHILDREN_CLOTHING_BRAND_TERMS);
  const hasClothingSignal = includesAny(resultText, CLOTHING_TERMS)
    || includesAny(resultText, STRONG_CLOTHING_PHRASES)
    || (lead.types || []).includes('clothing_store');

  if (isTarget) {
    score += 35;
    fitScore = 35;
    reasons.push('confirmed baby/kids clothing signal');
  } else if (hasClothingSignal) {
    score -= 10;
    fitScore = 10;
    reasons.push('general clothing only; no baby/kids proof');
  } else if (hasAudienceSignal) {
    score -= 10;
    fitScore = 8;
    reasons.push('baby/kids signal without clothing proof');
  }

  if (lead.phone || lead.internationalPhoneNumber || lead.whatsapp) {
    score += 20;
    contactScore += 15;
    reasons.push('phone exists');
  }
  if (lead.website) {
    score += 15;
    contactScore += 5;
    reasons.push('website exists');
  }
  if (lead.instagram) {
    score += 15;
    contactScore += 5;
    reasons.push('instagram profile exists');
  }
  const isInstagramSource = ['INSTAGRAM', 'INSTAGRAM_APIFY', 'APIFY'].includes(lead.sourceType);

  if (isInstagramSource && isTarget) {
    score += 10;
    potentialScore += 8;
    reasons.push('instagram-only baby/kids clothing sales channel');
  }
  if (includesAny(resultText, SALES_READY_TERMS)) {
    score += isInstagramSource ? 12 : 6;
    potentialScore += isInstagramSource ? 8 : 4;
    reasons.push('sales-ready shop signal');
  }
  if ((lead.rawPayload?.followers || 0) >= 5000) {
    score += 10;
    activityScore += 6;
    reasons.push('instagram audience signal');
  }
  if ((lead.rating || lead.rawPayload?.rating || 0) >= 4) {
    score += 10;
    activityScore += 4;
    reasons.push('rating >= 4.0');
  }
  if ((lead.userRatingsTotal || lead.rawPayload?.userRatingsTotal || lead.rawPayload?.reviewCount || 0) >= 20) {
    score += 10;
    activityScore += 4;
    reasons.push('20+ reviews');
  }
  if (lead.businessStatus === 'OPERATIONAL' || lead.rawPayload?.businessStatus === 'OPERATIONAL') {
    score += 10;
    activityScore += 3;
    reasons.push('business operational');
  }
  if (lead.openingHours) {
    score += 5;
    activityScore += 2;
    reasons.push('opening hours exist');
  }
  if (professionalDomain(lead.website)) {
    score += 5;
    potentialScore += 4;
    reasons.push('professional website domain');
  }

  if (['CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'].includes(lead.businessStatus)) {
    score -= 20;
    riskScore = 0;
    reasons.push('business closed');
  }
  if ((lead.types || []).some((type) => UNRELATED_TYPES.includes(type))) {
    score -= 20;
    riskScore = 0;
    reasons.push('unrelated place type');
  }
  if (includesAny(text, UNRELATED_TERMS) && !isTarget) {
    score -= 25;
    riskScore = 0;
    reasons.push('unrelated product signal');
  }
  if (isInstagramSource && includesAny(resultText, LOW_INTENT_PROFILE_TERMS) && !includesAny(resultText, SALES_READY_TERMS)) {
    score -= 20;
    riskScore = Math.min(riskScore, 1);
    reasons.push('low-intent social profile');
  }
  if (!hasClothingSignal) {
    score -= 25;
    reasons.push('not a clothing store');
  }
  if (!isTarget) {
    score -= 45;
    reasons.push('outside baby/kids clothing target');
  }
  if (!lead.phone && !lead.internationalPhoneNumber && !lead.website && !lead.instagram) {
    score -= 10;
    reasons.push('no phone, website, or instagram');
  }
  if (lead.rating && lead.rating < 3.5) {
    score -= 10;
    reasons.push('rating below 3.5');
  }

  const leadScore = Math.max(0, Math.min(score, 100));
  const hasContact = Boolean(lead.whatsapp || lead.phone || lead.internationalPhoneNumber || lead.email || lead.website || lead.instagram);
  const riskLabel = !isTarget
    ? 'IRRELEVANT_CATEGORY'
    : includesAny(resultText, LOW_INTENT_PROFILE_TERMS) && !includesAny(resultText, SALES_READY_TERMS)
      ? 'INFLUENCER'
      : isInstagramSource
        ? 'ONLINE_SELLER'
        : includesAny(resultText, ['wholesale', 'toptan'])
          ? 'WHOLESALER'
          : 'REAL_STORE';
  const nextBestAction = !isTarget
    ? 'REVIEW_MANUALLY'
    : lead.whatsapp || lead.phone || lead.internationalPhoneNumber
      ? 'CONTACT_ON_WHATSAPP'
      : lead.instagram
        ? 'CONTACT_ON_INSTAGRAM'
        : lead.email
          ? 'SEND_EMAIL'
          : hasContact
            ? 'REVIEW_MANUALLY'
            : 'NURTURE';

  return {
    leadScore,
    combinedScore: leadScore,
    fitScore: Math.max(0, Math.min(fitScore, 35)),
    contactScore: Math.max(0, Math.min(contactScore, 25)),
    activityScore: Math.max(0, Math.min(activityScore, 15)),
    potentialScore: Math.max(0, Math.min(potentialScore, 20)),
    riskScore: Math.max(0, Math.min(riskScore, 5)),
    scoreReason: reasons.join('; ') || 'no strong signal',
    status: scoreStatus(leadScore),
    priority: scorePriority(leadScore),
    riskLabel,
    nextBestAction,
  };
}
