const demoNames = [
  'Baby World SRL',
  'Mini Kids Boutique',
  'Little Star Baby Shop',
  'Kinder Haus Mode',
  'Bebe Fashion Center',
  'Happy Kids Store',
  'Baby Land Outlet',
  'Kids Concept Boutique',
];

export async function runDemoSearch({ country, city, query, maxResults = 20 }) {
  const count = Math.min(Number(maxResults) || 20, 50);
  const locationSlug = `${city || country}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const locationCode = String([...locationSlug].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 900 + 100);
  return Array.from({ length: count }).map((_, index) => {
    const name = demoNames[index % demoNames.length];
    const phone = `+${index % 2 === 0 ? '40' : '36'} 555 ${locationCode} ${String(index).padStart(3, '0')}`;
    const whatsapp = phone.replace(/\s/g, '');
    return {
      companyName: `${name} ${city || country} ${index + 1}`,
      displayName: name,
      country,
      city,
      address: `${city || country} merkez`,
      phone,
      whatsapp: index % 3 !== 0 ? whatsapp : null,
      email: index % 4 === 0 ? `sales${index}@${locationSlug}.example.com` : null,
      website: index % 2 === 0 ? `https://${locationSlug}-example-${index}.com` : null,
      instagram: index % 3 !== 1 ? `https://instagram.com/demo_baby_${locationSlug}_${index}` : null,
      googleMapsUrl: `https://maps.google.com/?q=${encodeURIComponent(`${name} ${city || country}`)}`,
      sourceType: 'DEMO',
      sourceQuery: query,
      categoryGuess: 'baby kids clothing boutique',
      notes: 'Demo provider tarafından oluşturuldu',
      rawPayload: {
        rating: 3.8 + ((index % 5) / 10),
        reviewCount: 10 + index * 7,
        instagramActive: index % 3 !== 1,
        multiBranch: index % 7 === 0,
      },
    };
  });
}
