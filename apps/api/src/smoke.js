import 'dotenv/config';
import { prisma } from './db.js';

const apiUrl = process.env.VITE_API_URL || 'http://localhost:4000/api';
const runId = Date.now().toString(36);
const city = `Smoke City ${runId}`;
const query = `baby clothing store ${city}`;
let task = null;
let instagramTask = null;
let directMatchLead = null;

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
  assert(Array.isArray(firstRun.searchedResults), 'Search run should return searchedResults');
  assert(firstRun.searchedResults.length === 3, `Expected 3 searchedResults, got ${firstRun.searchedResults.length}`);
  assert(Array.isArray(firstRun.bestLeads), 'Search run should return bestLeads');
  assert(firstRun.bestLeads.length > 0, 'Search run should include bestLeads');

  const historyAfter = await request(`/search-tasks/history/check?country=Romania&city=${encodeURIComponent(city)}&query=${encodeURIComponent(query)}&sourceType=DEMO`);
  assert(historyAfter.alreadyCompleted === true, 'Smoke search should have completed history after first run');

  const persistedHistory = await request(`/search-tasks/history?country=Romania&city=${encodeURIComponent(city)}&sourceType=DEMO&status=COMPLETED&take=5`);
  const persistedRun = persistedHistory.find((run) => run.query === query);
  assert(persistedRun, 'Search run history should include the smoke run');
  assert(Array.isArray(persistedRun.searchedResults), 'Search run history should persist searchedResults');
  assert(persistedRun.searchedResults.length === 3, `Expected persisted searchedResults to include 3 items, got ${persistedRun.searchedResults.length}`);
  assert(Array.isArray(persistedRun.bestLeads), 'Search run history should persist bestLeads');
  assert(persistedRun.usage && typeof persistedRun.usage === 'object', 'Search run history should persist usage metadata');

  const secondRun = await request(`/search-tasks/${task.id}/run`, { method: 'POST', body: '{}' });
  assert(secondRun.status === 'COMPLETED', 'Search task re-run did not complete');
  assert(secondRun.foundCount === 3, `Expected task foundCount to stay 3, got ${secondRun.foundCount}`);
  assert(secondRun.createdCount === 0, `Expected duplicate re-run to create 0 leads, got ${secondRun.createdCount}`);

  const smokeLeads = await request(`/leads?city=${encodeURIComponent(city)}`);
  assert(Array.isArray(smokeLeads) && smokeLeads.length === 3, `Expected 3 smoke leads, got ${smokeLeads.length}`);

  const demoSourceLeads = await request(`/leads?city=${encodeURIComponent(city)}&sourceTypes=DEMO`);
  assert(Array.isArray(demoSourceLeads) && demoSourceLeads.length === 3, `Expected DEMO source filter to return 3 smoke leads, got ${demoSourceLeads.length}`);

  directMatchLead = await prisma.lead.create({
    data: {
      companyName: `${smokeLeads[0].companyName} Match Check`,
      displayName: smokeLeads[0].displayName || smokeLeads[0].companyName,
      country: smokeLeads[0].country,
      city: smokeLeads[0].city,
      phone: smokeLeads[0].phone,
      whatsapp: smokeLeads[0].whatsapp,
      website: smokeLeads[0].website,
      sourceType: 'MANUAL',
      sourceQuery: query,
      categoryGuess: 'baby kids clothing boutique',
      leadScore: 70,
    },
  });

  const updated = await request(`/leads/${smokeLeads[0].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'QUALIFIED' }),
  });
  assert(updated.status === 'QUALIFIED', 'Lead status update failed');
  assert(Array.isArray(updated.sources), 'Lead detail update should include source evidence');

  const likedLead = await request(`/leads/${smokeLeads[0].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ userFeedback: 'LIKED', userFeedbackAt: new Date().toISOString() }),
  });
  assert(likedLead.userFeedback === 'LIKED', 'Lead feedback update failed');
  assert(
    likedLead.activities?.some((activity) => activity.activityType === 'FEEDBACK' && activity.result === 'LIKED'),
    'Lead feedback should create a FEEDBACK activity',
  );

  const learningSummary = await request('/ai/learning-summary?country=Romania');
  assert(learningSummary.snapshot, 'Learning summary should include snapshot');
  assert(learningSummary.snapshot.totalFeedback >= 1, 'Learning summary should include feedback count');
  assert(Array.isArray(learningSummary.snapshot.google.bestCities), 'Learning summary should include google best cities');

  const possibleMatches = await request(`/leads/${smokeLeads[0].id}/possible-matches`);
  assert(Array.isArray(possibleMatches), 'Possible matches endpoint should return an array');
  const directMatch = possibleMatches.find((match) => match.id === directMatchLead.id);
  assert(directMatch, 'Possible matches should include a same phone/domain test lead');
  assert(directMatch.matchScore >= 35, `Expected possible match score >= 35, got ${directMatch.matchScore}`);
  assert(directMatch.matchReasons?.length > 0, 'Possible match should include match reasons');

  const multiSourceLeads = await request(`/leads?city=${encodeURIComponent(city)}&sourceTypes=DEMO,MANUAL`);
  assert(Array.isArray(multiSourceLeads) && multiSourceLeads.length === 4, `Expected multi source filter to return 4 smoke leads, got ${multiSourceLeads.length}`);

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

  instagramTask = await request('/search-tasks', {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Instagram Task ${runId}`,
      country: 'Romania',
      city,
      query: `haine copii ${city}`,
      sourceKeyword: 'haine copii',
      sourceType: 'INSTAGRAM',
      maxResults: 5,
    }),
  });
  const instagramRun = await request(`/search-tasks/${instagramTask.id}/run`, { method: 'POST', body: '{}' });
  assert(instagramRun.status === 'COMPLETED', 'Instagram smoke task did not complete');
  assert(
    (instagramRun.createdCount || 0) + (instagramRun.targetFilteredCount || 0) + (instagramRun.duplicateCount || 0) > 0,
    'Instagram smoke should classify found profiles as created, duplicate, or filtered',
  );
  assert(Array.isArray(instagramRun.searchedResults), 'Instagram smoke should return searchedResults');
  assert(
    instagramRun.searchedResults.some((result) => result.qualityScore !== null),
    'Instagram searched results should include qualityScore',
  );

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
  await prisma.lead.deleteMany({ where: { sourceQuery: `haine copii ${city}` } }).catch(() => null);
  await prisma.searchRunHistory.deleteMany({ where: { query } }).catch(() => null);
  await prisma.searchRunHistory.deleteMany({ where: { query: `haine copii ${city}` } }).catch(() => null);
  if (task?.id) {
    await prisma.searchTask.delete({ where: { id: task.id } }).catch(() => null);
  }
  if (instagramTask?.id) {
    await prisma.searchTask.delete({ where: { id: instagramTask.id } }).catch(() => null);
  }
  await prisma.$disconnect();

  if (deletedLeads.count > 0) {
    console.log(JSON.stringify({ cleanup: 'ok', deletedLeads: deletedLeads.count }, null, 2));
  }
}
