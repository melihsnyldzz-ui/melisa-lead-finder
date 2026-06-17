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

function slugify(value) {
  return String(value || 'market')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
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
  const count = Math.min(Number(maxResults) || 20, 50);
  return Array.from({ length: count }).map((_, index) => {
    const profile = instagramProfiles[index % instagramProfiles.length];
    return buildInstagramLead({ country, city, query, sourceKeyword }, profile, index);
  });
}
