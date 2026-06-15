import 'dotenv/config';
import { prisma } from './db.js';
import { runDemoSearch } from './providers/demoProvider.js';
import { createLeadIfNew } from './services/leadDeduplication.js';

const demoLeads = await runDemoSearch({ country: 'Romania', city: 'Bucharest', query: 'baby clothing store Bucharest', maxResults: 12 });
let created = 0;
let skipped = 0;

for (const lead of demoLeads) {
  const result = await createLeadIfNew(prisma, lead);
  if (result.created) created += 1;
  else skipped += 1;
}

console.log(`Seed complete: ${created} created, ${skipped} skipped`);
await prisma.$disconnect();
