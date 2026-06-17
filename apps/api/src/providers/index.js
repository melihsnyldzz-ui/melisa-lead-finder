import { runDemoSearch } from './demoProvider.js';
import { runGooglePlacesSearch } from './googlePlacesProvider.js';
import { runInstagramSearch } from './instagramProvider.js';
import { getGeminiStatus } from '../services/geminiLeadAnalyzer.js';

const providers = {
  DEMO: runDemoSearch,
  GOOGLE_PLACES: runGooglePlacesSearch,
  INSTAGRAM: runInstagramSearch,
};

const providerMetadata = {
  DEMO: {
    label: 'Demo',
    implemented: true,
    configured: true,
  },
  GOOGLE_PLACES: {
    label: 'Google Places',
    implemented: true,
    configured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    requiredEnv: 'GOOGLE_PLACES_API_KEY',
  },
  APIFY: {
    label: 'Apify',
    implemented: false,
    configured: Boolean(process.env.APIFY_TOKEN),
    requiredEnv: 'APIFY_TOKEN',
  },
  WEBSITE: {
    label: 'Website',
    implemented: false,
    configured: false,
  },
  INSTAGRAM: {
    label: 'Instagram',
    implemented: true,
    configured: true,
  },
  MANUAL: {
    label: 'Manual',
    implemented: false,
    configured: true,
  },
};

export function getSearchProvider(sourceType = 'DEMO') {
  const provider = providers[sourceType];
  if (!provider) {
    const error = new Error(`Provider is not implemented: ${sourceType}`);
    error.status = 400;
    throw error;
  }
  return provider;
}

export function listProviderStatuses() {
  return {
    ...providerMetadata,
    GEMINI: {
      label: 'Google Gemini',
      implemented: true,
      requiredEnv: 'GEMINI_API_KEY',
      ...getGeminiStatus(),
    },
  };
}
