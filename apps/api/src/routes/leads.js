import { Router } from 'express';
import { Parser } from 'json2csv';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../httpErrors.js';
import { createLeadIfNew } from '../services/leadDeduplication.js';
import { analyzeLeadWithGemini } from '../services/geminiLeadAnalyzer.js';
import { getCompanyProfile } from '../services/companyProfileService.js';

const router = Router();

const leadStatusSchema = z.enum(['NEW', 'HOT', 'REVIEW', 'QUALIFIED', 'LOW_QUALITY', 'REJECTED', 'CONVERTED']);
const leadFeedbackSchema = z.enum(['NONE', 'LIKED', 'DISLIKED']);
const sourceTypeSchema = z.enum(['DEMO', 'GOOGLE_PLACES', 'APIFY', 'WEBSITE', 'INSTAGRAM', 'MANUAL']);

const createLeadSchema = z.object({
  companyName: z.string().trim().min(1),
  googlePlaceId: z.string().trim().optional().nullable(),
  displayName: z.string().trim().optional().nullable(),
  country: z.string().trim().min(1),
  city: z.string().trim().optional().nullable(),
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
  userFeedback: leadFeedbackSchema.optional(),
  userFeedbackAt: z.coerce.date().optional().nullable(),
  assignedTo: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  rawPayload: z.unknown().optional(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  leadScore: z.number().int().min(0).max(100).optional(),
  scoreReason: z.string().trim().optional().nullable(),
});

const listLeadsQuerySchema = z.object({
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  status: leadStatusSchema.optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  q: z.string().trim().optional(),
});

function buildLeadWhere({ country, city, status, minScore, q }) {
  return {
    ...(country ? { country: { contains: String(country), mode: 'insensitive' } } : {}),
    ...(city ? { city: { contains: String(city), mode: 'insensitive' } } : {}),
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
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) throw notFound('Lead not found');
    res.json(lead);
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
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data: input });
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
    });

    res.json(lead);
  } catch (err) {
    next(err);
  }
});

export default router;
