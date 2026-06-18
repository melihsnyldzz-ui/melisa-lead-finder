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
  'магазин',
  'крама',
  'խանութ',
  'mağazası',
  'dükany',
  'doʻkoni',
  'dükөнү',
  'дүкені',
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

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function buildResultText(lead) {
  return [
    lead.companyName,
    lead.displayName,
    lead.categoryGuess,
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
    reasons.push('confirmed baby/kids clothing signal');
  } else if (hasClothingSignal) {
    score -= 10;
    reasons.push('general clothing only; no baby/kids proof');
  } else if (hasAudienceSignal) {
    score -= 10;
    reasons.push('baby/kids signal without clothing proof');
  }

  if (lead.phone || lead.internationalPhoneNumber || lead.whatsapp) {
    score += 20;
    reasons.push('phone exists');
  }
  if (lead.website) {
    score += 15;
    reasons.push('website exists');
  }
  if (lead.instagram) {
    score += 15;
    reasons.push('instagram profile exists');
  }
  if (lead.sourceType === 'INSTAGRAM' && isTarget) {
    score += 10;
    reasons.push('instagram-only baby/kids clothing sales channel');
  }
  if ((lead.rawPayload?.followers || 0) >= 5000) {
    score += 10;
    reasons.push('instagram audience signal');
  }
  if ((lead.rating || lead.rawPayload?.rating || 0) >= 4) {
    score += 10;
    reasons.push('rating >= 4.0');
  }
  if ((lead.userRatingsTotal || lead.rawPayload?.userRatingsTotal || lead.rawPayload?.reviewCount || 0) >= 20) {
    score += 10;
    reasons.push('20+ reviews');
  }
  if (lead.businessStatus === 'OPERATIONAL' || lead.rawPayload?.businessStatus === 'OPERATIONAL') {
    score += 10;
    reasons.push('business operational');
  }
  if (lead.openingHours) {
    score += 5;
    reasons.push('opening hours exist');
  }
  if (professionalDomain(lead.website)) {
    score += 5;
    reasons.push('professional website domain');
  }

  if (['CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'].includes(lead.businessStatus)) {
    score -= 20;
    reasons.push('business closed');
  }
  if ((lead.types || []).some((type) => UNRELATED_TYPES.includes(type))) {
    score -= 20;
    reasons.push('unrelated place type');
  }
  if (includesAny(text, UNRELATED_TERMS) && !isTarget) {
    score -= 25;
    reasons.push('unrelated product signal');
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
  return {
    leadScore,
    scoreReason: reasons.join('; ') || 'no strong signal',
    status: scoreStatus(leadScore),
  };
}
