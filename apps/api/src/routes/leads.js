import { Router } from 'express';
import { Parser } from 'json2csv';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../httpErrors.js';
import { createLeadIfNew } from '../services/leadDeduplication.js';
import { analyzeLeadWithGemini } from '../services/geminiLeadAnalyzer.js';
import { getCompanyProfile } from '../services/companyProfileService.js';

const router = Router();

const leadStatusSchema = z.enum([
  'NEW',
  'HOT',
  'REVIEW',
  'QUALIFIED',
  'CONTACT_READY',
  'CONTACTED',
  'REPLIED',
  'CATALOG_SENT',
  'OFFER_SENT',
  'WON',
  'LOST',
  'NURTURE',
  'LOW_QUALITY',
  'REJECTED',
  'CONVERTED',
]);
const leadFeedbackSchema = z.enum(['NONE', 'LIKED', 'DISLIKED']);
const sourceTypeSchema = z.enum(['DEMO', 'GOOGLE_PLACES', 'APIFY', 'INSTAGRAM_APIFY', 'WEBSITE', 'WEBSITE_SCAN', 'CSV_IMPORT', 'INSTAGRAM', 'MANUAL']);
const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'VIP']);
const riskLabelSchema = z.enum(['REAL_STORE', 'WHOLESALER', 'ONLINE_SELLER', 'INFLUENCER', 'PERSONAL_ACCOUNT', 'IRRELEVANT_CATEGORY', 'INACTIVE', 'UNKNOWN']);

const createLeadSchema = z.object({
  companyName: z.string().trim().min(1),
  googlePlaceId: z.string().trim().optional().nullable(),
  displayName: z.string().trim().optional().nullable(),
  country: z.string().trim().min(1),
  city: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  internationalPhoneNumber: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  website: z.string().trim().url().optional().nullable(),
  instagram: z.string().trim().url().optional().nullable(),
  googleMapsUrl: z.string().trim().url().optional().nullable(),
  sourceType: sourceTypeSchema.optional(),
  sourceQuery: z.string().trim().optional().nullable(),
  sourceKeyword: z.string().trim().optional().nullable(),
  sourceCity: z.string().trim().optional().nullable(),
  sourceCountry: z.string().trim().optional().nullable(),
  categoryGuess: z.string().trim().optional().nullable(),
  businessStatus: z.string().trim().optional().nullable(),
  types: z.array(z.string()).optional(),
  openingHours: z.unknown().optional().nullable(),
  rating: z.number().optional().nullable(),
  userRatingsTotal: z.number().int().optional().nullable(),
  status: leadStatusSchema.optional(),
  priority: prioritySchema.optional(),
  riskLabel: riskLabelSchema.optional(),
  nextBestAction: z.string().trim().optional().nullable(),
  nextFollowUpDate: z.coerce.date().optional().nullable(),
  userFeedback: leadFeedbackSchema.optional(),
  userFeedbackAt: z.coerce.date().optional().nullable(),
  assignedTo: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  rawPayload: z.unknown().optional(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  leadScore: z.number().int().min(0).max(100).optional(),
  combinedScore: z.number().int().min(0).max(100).optional(),
  fitScore: z.number().int().min(0).max(35).optional(),
  contactScore: z.number().int().min(0).max(25).optional(),
  activityScore: z.number().int().min(0).max(15).optional(),
  potentialScore: z.number().int().min(0).max(20).optional(),
  riskScore: z.number().int().min(0).max(5).optional(),
  scoreReason: z.string().trim().optional().nullable(),
});

const listLeadsQuerySchema = z.object({
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  sourceType: sourceTypeSchema.optional(),
  sourceTypes: z.string().trim().optional(),
  status: leadStatusSchema.optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  q: z.string().trim().optional(),
});

const leadDetailInclude = {
  sources: { orderBy: { createdAt: 'desc' }, take: 20 },
  instagramProfiles: { orderBy: { updatedAt: 'desc' }, take: 5 },
  activities: { orderBy: { createdAt: 'desc' }, take: 20 },
};

function parseSourceTypes(sourceType, sourceTypes) {
  const values = sourceTypes
    ? sourceTypes.split(',').map((item) => item.trim()).filter(Boolean)
    : sourceType
      ? [sourceType]
      : [];
  const valid = values.filter((value) => sourceTypeSchema.safeParse(value).success);
  return [...new Set(valid)];
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-12) : null;
}

function normalizeDomain(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function normalizeInstagram(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw.includes('instagram.com') && !raw.startsWith('@')) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'instagram.com') return null;
    const handle = parsed.pathname.split('/').filter(Boolean)[0];
    return handle ? handle.replace(/^@/, '').toLowerCase() : null;
  } catch {
    const handle = raw.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').split(/[/?#]/)[0];
    return handle ? handle.toLowerCase() : null;
  }
}

function nameTokens(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ğüşöçıİ\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !['baby', 'kids', 'shop', 'store', 'magaza', 'giyim', 'butik', 'cocuk', 'bebek'].includes(token));
}

function collectLeadSignals(lead) {
  const instagramHandles = new Set([
    normalizeInstagram(lead.instagram),
    ...(lead.instagramProfiles || []).map((profile) => normalizeInstagram(profile.profileUrl || profile.username)),
  ].filter(Boolean));
  const domains = new Set([
    normalizeDomain(lead.website),
    ...(lead.instagramProfiles || []).map((profile) => normalizeDomain(profile.website)),
  ].filter(Boolean));
  const phones = new Set([
    normalizePhone(lead.phone),
    normalizePhone(lead.internationalPhoneNumber),
    normalizePhone(lead.whatsapp),
    ...(lead.instagramProfiles || []).flatMap((profile) => [normalizePhone(profile.phone), normalizePhone(profile.whatsapp)]),
  ].filter(Boolean));

  return {
    instagramHandles,
    domains,
    phones,
    tokens: new Set(nameTokens(`${lead.companyName || ''} ${lead.displayName || ''}`)),
  };
}

function scorePossibleMatch(selected, candidate) {
  const selectedSignals = collectLeadSignals(selected);
  const candidateSignals = collectLeadSignals(candidate);
  const reasons = [];
  let score = 0;

  if ([...selectedSignals.instagramHandles].some((value) => candidateSignals.instagramHandles.has(value))) {
    score += 45;
    reasons.push('Ayni Instagram profili');
  }
  if ([...selectedSignals.domains].some((value) => candidateSignals.domains.has(value))) {
    score += 35;
    reasons.push('Ayni website domaini');
  }
  if ([...selectedSignals.phones].some((value) => candidateSignals.phones.has(value))) {
    score += 35;
    reasons.push('Ayni telefon/WhatsApp');
  }

  const overlapTokens = [...selectedSignals.tokens].filter((token) => candidateSignals.tokens.has(token));
  const sameCity = selected.city && candidate.city && selected.city.toLowerCase() === candidate.city.toLowerCase();
  const sameCountry = selected.country && candidate.country && selected.country.toLowerCase() === candidate.country.toLowerCase();

  if (overlapTokens.length && sameCity) {
    score += 20;
    reasons.push(`Ayni sehir ve benzer isim: ${overlapTokens.slice(0, 2).join(', ')}`);
  } else if (overlapTokens.length && sameCountry) {
    score += 10;
    reasons.push(`Ayni ulke ve benzer isim: ${overlapTokens.slice(0, 2).join(', ')}`);
  }

  return { score: Math.min(score, 100), reasons };
}

function buildLeadWhere({ country, city, sourceType, sourceTypes, status, minScore, q }) {
  const parsedSourceTypes = parseSourceTypes(sourceType, sourceTypes);
  return {
    ...(country ? { country: { contains: String(country), mode: 'insensitive' } } : {}),
    ...(city ? { city: { contains: String(city), mode: 'insensitive' } } : {}),
    ...(parsedSourceTypes.length === 1 ? { sourceType: parsedSourceTypes[0] } : {}),
    ...(parsedSourceTypes.length > 1 ? { sourceType: { in: parsedSourceTypes } } : {}),
    ...(status ? { status } : { status: { not: 'REJECTED' } }),
    ...(minScore !== undefined ? { leadScore: { gte: minScore } } : {}),
    ...(q ? { companyName: { contains: String(q), mode: 'insensitive' } } : {}),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const query = listLeadsQuerySchema.parse(req.query);
    const leads = await prisma.lead.findMany({
      where: buildLeadWhere(query),
      orderBy: [{ leadScore: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

router.get('/country-stats', async (_req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { status: { not: 'REJECTED' } },
      select: { country: true, leadScore: true, status: true },
    });

    const stats = leads.reduce((acc, lead) => {
      if (!acc[lead.country]) {
        acc[lead.country] = { total: 0, hot: 0, review: 0, qualified: 0, converted: 0 };
      }
      acc[lead.country].total += 1;
      if (lead.leadScore >= 80) acc[lead.country].hot += 1;
      if (lead.status === 'REVIEW') acc[lead.country].review += 1;
      if (lead.status === 'QUALIFIED') acc[lead.country].qualified += 1;
      if (lead.status === 'CONVERTED') acc[lead.country].converted += 1;
      return acc;
    }, {});

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const [total, hot, review, converted] = await Promise.all([
      prisma.lead.count({ where: { status: { not: 'REJECTED' } } }),
      prisma.lead.count({ where: { status: { not: 'REJECTED' }, OR: [{ leadScore: { gte: 80 } }, { status: 'HOT' }] } }),
      prisma.lead.count({ where: { status: 'REVIEW' } }),
      prisma.lead.count({ where: { status: 'CONVERTED' } }),
    ]);
    res.json({ total, hot, review, converted });
  } catch (err) {
    next(err);
  }
});

router.get('/export.csv', async (req, res, next) => {
  try {
    const query = listLeadsQuerySchema.parse(req.query);
    const leads = await prisma.lead.findMany({
      where: buildLeadWhere(query),
      orderBy: { leadScore: 'desc' },
    });
    const parser = new Parser({ fields: ['googlePlaceId', 'companyName', 'country', 'city', 'phone', 'internationalPhoneNumber', 'website', 'googleMapsUrl', 'rating', 'userRatingsTotal', 'businessStatus', 'types', 'sourceQuery', 'sourceKeyword', 'leadScore', 'status', 'scoreReason'] });
    const csv = parser.parse(leads);
    res.header('Content-Type', 'text/csv');
    res.attachment('melisa-leads.csv');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: leadDetailInclude,
    });
    if (!lead) throw notFound('Lead not found');
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/possible-matches', async (req, res, next) => {
  try {
    const selected = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: leadDetailInclude,
    });
    if (!selected) throw notFound('Lead not found');

    const candidates = await prisma.lead.findMany({
      where: {
        id: { not: selected.id },
        status: { not: 'REJECTED' },
        ...(selected.country ? { country: { equals: selected.country, mode: 'insensitive' } } : {}),
      },
      include: {
        instagramProfiles: { take: 3 },
      },
      orderBy: [{ leadScore: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });

    const matches = candidates
      .map((candidate) => {
        const match = scorePossibleMatch(selected, candidate);
        return {
          id: candidate.id,
          companyName: candidate.companyName,
          displayName: candidate.displayName,
          country: candidate.country,
          city: candidate.city,
          sourceType: candidate.sourceType,
          leadScore: candidate.leadScore,
          phone: candidate.internationalPhoneNumber || candidate.phone || candidate.whatsapp,
          website: candidate.website,
          instagram: candidate.instagram || candidate.instagramProfiles?.[0]?.profileUrl || null,
          matchScore: match.score,
          matchReasons: match.reasons,
        };
      })
      .filter((candidate) => candidate.matchScore >= 20)
      .sort((a, b) => b.matchScore - a.matchScore || b.leadScore - a.leadScore)
      .slice(0, 10);

    res.json(matches);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = createLeadSchema.parse(req.body);
    const { lead, created } = await createLeadIfNew(prisma, input);
    res.set('X-Duplicate-Lead', String(!created));
    res.status(created ? 201 : 200).json(lead);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const input = updateLeadSchema.parse(req.body);
    const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Lead not found');
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data: input, include: leadDetailInclude });

    if (input.userFeedback && input.userFeedback !== existing.userFeedback) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          activityType: 'FEEDBACK',
          channel: 'APP',
          content: `Feedback changed from ${existing.userFeedback} to ${input.userFeedback}`,
          result: input.userFeedback,
          createdBy: 'user',
        },
      });
      const leadWithActivity = await prisma.lead.findUnique({
        where: { id: lead.id },
        include: leadDetailInclude,
      });
      return res.json(leadWithActivity);
    }

    res.json(lead);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/ai-analysis', async (req, res, next) => {
  try {
    const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Lead not found');

    const companyProfile = await getCompanyProfile(prisma);
    const analysis = await analyzeLeadWithGemini(existing, companyProfile);
    const lead = await prisma.lead.update({
      where: { id: existing.id },
      data: {
        aiAnalysis: analysis,
        aiAnalyzedAt: new Date(),
      },
      include: leadDetailInclude,
    });

    res.json(lead);
  } catch (err) {
    next(err);
  }
});

export default router;
