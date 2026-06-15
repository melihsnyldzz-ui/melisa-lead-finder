import { scoreLead } from './leadScoring.js';

function clean(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-12) : null;
}

function normalizeDomain(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function cleanLeadInput(lead) {
  return Object.fromEntries(
    Object.entries(lead).map(([key, value]) => [key, clean(value)]),
  );
}

async function findByNormalizedPhone(prisma, lead) {
  const target = normalizePhone(lead.internationalPhoneNumber || lead.phone || lead.whatsapp);
  if (!target) return null;

  const candidates = await prisma.lead.findMany({
    where: { OR: [{ phone: { not: null } }, { whatsapp: { not: null } }, { internationalPhoneNumber: { not: null } }] },
    take: 5000,
  });

  return candidates.find((candidate) => [
    candidate.internationalPhoneNumber,
    candidate.phone,
    candidate.whatsapp,
  ].some((phone) => normalizePhone(phone) === target)) || null;
}

async function findByNormalizedDomain(prisma, lead) {
  const target = normalizeDomain(lead.website);
  if (!target) return null;

  const candidates = await prisma.lead.findMany({
    where: { website: { not: null } },
    select: { id: true, website: true },
    take: 5000,
  });
  const match = candidates.find((candidate) => normalizeDomain(candidate.website) === target);
  return match ? prisma.lead.findUnique({ where: { id: match.id } }) : null;
}

export async function findDuplicateLead(prisma, lead) {
  const input = cleanLeadInput(lead);

  if (input.googlePlaceId) {
    const existing = await prisma.lead.findFirst({ where: { googlePlaceId: input.googlePlaceId } });
    if (existing) return existing;
  }

  const byPhone = await findByNormalizedPhone(prisma, input);
  if (byPhone) return byPhone;

  const byDomain = await findByNormalizedDomain(prisma, input);
  if (byDomain) return byDomain;

  if (input.companyName && input.city) {
    const byNameCity = await prisma.lead.findFirst({
      where: {
        companyName: { equals: input.companyName, mode: 'insensitive' },
        city: { equals: input.city, mode: 'insensitive' },
      },
    });
    if (byNameCity) return byNameCity;
  }

  return null;
}

export async function createLeadIfNew(prisma, lead) {
  const input = cleanLeadInput(lead);
  const existing = await findDuplicateLead(prisma, input);

  if (existing) {
    return { lead: existing, created: false };
  }

  const scoring = scoreLead(input);
  const createdLead = await prisma.lead.create({ data: { ...input, ...scoring } });
  return { lead: createdLead, created: true };
}
