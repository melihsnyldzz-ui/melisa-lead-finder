import 'dotenv/config';
import { prisma } from './db.js';

const apiUrl = process.env.VITE_API_URL || 'http://localhost:4000/api';
const runId = Date.now().toString(36);
const city = `Smoke City ${runId}`;
const query = `baby clothing store ${city}`;
let task = null;

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const health = await request('/health');
  assert(health.ok, 'Health endpoint did not return ok=true');

  const providers = await request('/providers');
  assert(providers.DEMO?.configured, 'Demo provider should be configured');

  const countryStats = await request('/leads/country-stats');
  assert(typeof countryStats === 'object' && countryStats !== null, 'Country stats should return an object');

  task = await request('/search-tasks', {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Demo Task ${runId}`,
      country: 'Romania',
      city,
      query,
      sourceType: 'DEMO',
      maxResults: 3,
    }),
  });

  const historyBefore = await request(`/search-tasks/history/check?country=Romania&city=${encodeURIComponent(city)}&query=${encodeURIComponent(query)}&sourceType=DEMO`);
  assert(historyBefore.alreadyCompleted === false, 'Smoke search should not have completed history before first run');

  const firstRun = await request(`/search-tasks/${task.id}/run`, { method: 'POST', body: '{}' });
  assert(firstRun.status === 'COMPLETED', 'Search task did not complete');
  assert(firstRun.createdCount === 3, `Expected 3 new leads, got ${firstRun.createdCount}`);

  const historyAfter = await request(`/search-tasks/history/check?country=Romania&city=${encodeURIComponent(city)}&query=${encodeURIComponent(query)}&sourceType=DEMO`);
  assert(historyAfter.alreadyCompleted === true, 'Smoke search should have completed history after first run');

  const secondRun = await request(`/search-tasks/${task.id}/run`, { method: 'POST', body: '{}' });
  assert(secondRun.status === 'COMPLETED', 'Search task re-run did not complete');
  assert(secondRun.foundCount === 3, `Expected task foundCount to stay 3, got ${secondRun.foundCount}`);
  assert(secondRun.createdCount === 0, `Expected duplicate re-run to create 0 leads, got ${secondRun.createdCount}`);

  const smokeLeads = await request(`/leads?city=${encodeURIComponent(city)}`);
  assert(Array.isArray(smokeLeads) && smokeLeads.length === 3, `Expected 3 smoke leads, got ${smokeLeads.length}`);

  const updated = await request(`/leads/${smokeLeads[0].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'QUALIFIED' }),
  });
  assert(updated.status === 'QUALIFIED', 'Lead status update failed');

  const invalid = await fetch(`${apiUrl}/search-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country: 'Romania' }),
  });
  assert(invalid.status === 400, `Expected invalid task to return 400, got ${invalid.status}`);

  const invalidMinScore = await fetch(`${apiUrl}/leads?minScore=200`);
  assert(invalidMinScore.status === 400, `Expected invalid minScore to return 400, got ${invalidMinScore.status}`);

  const missingLead = await fetch(`${apiUrl}/leads/not-a-real-lead`);
  assert(missingLead.status === 404, `Expected missing lead to return 404, got ${missingLead.status}`);

  const missingTaskRun = await fetch(`${apiUrl}/search-tasks/not-a-real-task/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(missingTaskRun.status === 404, `Expected missing task run to return 404, got ${missingTaskRun.status}`);

  const csv = await fetch(`${apiUrl}/leads/export.csv`);
  assert(csv.ok, `CSV export failed: ${csv.status}`);
  assert((csv.headers.get('content-type') || '').includes('text/csv'), 'CSV export did not return text/csv');

  const filteredCsv = await fetch(`${apiUrl}/leads/export.csv?country=Romania&status=QUALIFIED`);
  assert(filteredCsv.ok, `Filtered CSV export failed: ${filteredCsv.status}`);
  assert((filteredCsv.headers.get('content-type') || '').includes('text/csv'), 'Filtered CSV export did not return text/csv');

  const stats = await request('/leads/stats');
  console.log(JSON.stringify({
    ok: true,
    totalBeforeCleanup: stats.total,
    hotBeforeCleanup: stats.hot,
    firstRunCreated: firstRun.createdCount,
    secondRunCreated: secondRun.createdCount,
    cleanup: 'pending',
    csv: 'ok',
  }, null, 2));
} finally {
  const deletedLeads = await prisma.lead.deleteMany({ where: { sourceQuery: query } });
  await prisma.searchRunHistory.deleteMany({ where: { query } }).catch(() => null);
  if (task?.id) {
    await prisma.searchTask.delete({ where: { id: task.id } }).catch(() => null);
  }
  await prisma.$disconnect();

  if (deletedLeads.count > 0) {
    console.log(JSON.stringify({ cleanup: 'ok', deletedLeads: deletedLeads.count }, null, 2));
  }
}
