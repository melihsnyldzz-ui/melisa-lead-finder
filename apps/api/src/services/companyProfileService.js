export const DEFAULT_COMPANY_PROFILE_ID = 'default';

export const defaultCompanyProfile = {
  id: DEFAULT_COMPANY_PROFILE_ID,
  companyName: 'Melisa Baby',
  description: 'Turkey-based wholesale baby and kids clothing supplier focused on B2B customers.',
  productCategories: [
    'baby clothing',
    'kids clothing',
    'children boutique products',
    'seasonal baby and kids apparel',
  ],
  targetCustomerTypes: [
    'baby clothing stores',
    'kids clothing stores',
    'children boutiques',
    'baby shops',
    'online kids fashion stores',
    'retailers that may buy wholesale stock',
  ],
  excludedCustomerTypes: [
    'clinics',
    'schools',
    'playgrounds',
    'toy-only shops',
    'adult fashion stores',
    'supermarkets',
    'personal influencer accounts',
    'closed businesses',
  ],
  targetCountries: [
    'Romania',
    'Bulgaria',
    'Georgia',
    'Armenia',
    'Kazakhstan',
    'Turkmenistan',
    'Russia regions',
    'Moldova',
    'Ukraine',
    'Poland',
  ],
  valueProposition: 'Reliable Turkish wholesale supply for baby and kids clothing stores, with practical product variety and export-friendly communication.',
  salesTone: 'Polite, concise, professional Turkish WhatsApp style. Avoid spam language and avoid exaggerated claims.',
  minimumOrderNote: 'Ask whether the store buys wholesale products before discussing order details.',
  outreachLanguage: 'tr',
};

export async function getCompanyProfile(prisma) {
  return prisma.companyProfile.upsert({
    where: { id: DEFAULT_COMPANY_PROFILE_ID },
    update: {},
    create: defaultCompanyProfile,
  });
}
