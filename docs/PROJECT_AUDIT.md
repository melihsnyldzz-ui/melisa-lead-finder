# Melisa Lead Finder Project Audit

## Business Focus

Melisa Lead Finder is a B2B lead discovery and qualification tool for finding potential wholesale baby and kids clothing customers.

The product should stay focused on two discovery channels:

- Google Places: physical baby/kids clothing stores, boutiques, newborn shops, baby product stores with clothing signal, wholesalers, distributors, and retailers.
- Instagram through Apify: online sellers, Instagram boutiques, WhatsApp order profiles, and virtual baby/kids clothing stores.

This is not a spam automation tool. The system should not send automated Instagram DMs, follow accounts, like posts, comment, or scrape follower/following graphs. It should discover, enrich, score, deduplicate, and help the sales team decide the next manual action.

## Current Architecture

The repository is a small npm workspace monorepo:

- `apps/api`: Express API, Prisma data access, Google Places provider, Instagram Apify provider, Gemini planning and analysis services.
- `apps/web`: Vite React frontend with a single large `App.jsx` that contains most dashboard, search, map, lead, settings, and Instagram UI state.
- `prisma`: PostgreSQL schema and migrations.
- `docs`: provider and project notes.

Current backend capability:

- Lead CRUD, filtering, CSV export, stats, feedback, and Gemini analysis.
- Search tasks and search run history.
- Google Places search execution with duplicate protection and monthly safety counters.
- Instagram search execution through Apify when configured, with deterministic mock fallback when no Apify config exists.
- Gemini search plans for Google, Instagram, and process strategy, with local fallbacks when Gemini fails.
- Shared scoring and target filtering for baby/kids clothing relevance.

Current frontend capability:

- Country/map based search entry.
- Google smart search task creation and run.
- Instagram AI criteria generation and multi-query execution.
- Lead list, lead detail, feedback buttons, AI analysis, status changes, and CSV export.
- Company profile and Gemini test/settings flow.
- Search history and current Instagram run result separation.

## What Works Well

- The project already has the right high-level pieces: Google, Instagram, Gemini, deduplication, scoring, feedback, and search history.
- Gemini failure does not fully block the workflow because local fallback plans exist.
- Google and Instagram results are filtered toward baby/kids clothing before lead creation.
- User feedback is already stored and used by planning logic.
- Search run history exists, which is important for avoiding repeated low-value searches.
- The app is local-first and simple to run compared with a larger SaaS stack.

## Confusing UX Parts

- The frontend is too dense. Search, strategy, map, stats, lead list, current results, archive, settings, and analysis compete for attention.
- Google and Instagram workflows look related but still feel like separate tools instead of one guided sales flow.
- Search results and all-time lead archives can still feel mixed in some views.
- Gemini warnings are too technical when JSON, quota, DNS, or API errors happen.
- Search plan details are useful, but too much raw detail is visible before the user has seen results.
- Lead detail mixes contact actions, scoring, AI output, and raw operational fields in a way that can overwhelm a sales user.
- The status model is still partially lead-quality oriented (`HOT`, `LOW_QUALITY`) rather than fully sales-pipeline oriented.

## Unnecessary Complexity

- `apps/web/src/App.jsx` holds too many responsibilities in one component. It should be split by workflow, not by technical widget.
- The current `Lead` model carries source fields, score fields, Google fields, Instagram fields, AI fields, sales fields, and raw payload together.
- Source types are inconsistent with the roadmap naming: current values include `APIFY`, `INSTAGRAM`, and `WEBSITE`; the target model wants `INSTAGRAM_APIFY`, `WEBSITE_SCAN`, etc.
- Instagram profile data is stored inside `Lead` and `rawPayload` instead of a dedicated `InstagramProfile` model.
- Source evidence is stored mostly as fields on `Lead` and `SearchRunHistory`; a separate `LeadSource` model would make Google/Instagram/website evidence easier to inspect and debug.
- Some local-language keyword data appears mojibake-encoded in source files. This can reduce search quality and should be repaired before expanding country libraries.

## Recommended Product Shape

Keep the product simple around these core screens and objects:

- Search Task: choose country, let AI/local planner generate the best Google or Instagram search plan, preview queries, run, and see only this run's results.
- Lead List: all saved leads with filters, score, source, status, contact availability, and next action.
- Lead Detail: one company, its sources, score breakdown, AI analysis, contact actions, notes, and sales activity.
- Lead Scoring: clear score parts and reason, not just one opaque number.
- Source Records: Google, Instagram, website, CSV, or manual evidence attached to a lead.
- Sales Status: move a lead through review, contact, catalog, offer, won/lost, nurture.
- Export: CSV or similar clean output for sales follow-up.

## Data Model Gaps Against Roadmap

Current schema has:

- `Lead`
- `SearchTask`
- `SearchRunHistory`
- `CompanyProfile`

Roadmap needs these additional or improved concepts:

- `LeadSource`: every Google, Instagram, website, CSV, or manual evidence record.
- `InstagramProfile`: normalized Instagram-specific profile facts.
- `LeadActivity`: status history, contact attempts, catalog sent, offer sent, notes, and outcomes.
- Expanded `Lead` scoring fields: `combinedScore`, `fitScore`, `contactScore`, `activityScore`, `potentialScore`, `riskScore`.
- Expanded sales statuses: `NEW`, `REVIEW`, `QUALIFIED`, `CONTACT_READY`, `CONTACTED`, `REPLIED`, `CATALOG_SENT`, `OFFER_SENT`, `WON`, `LOST`, `REJECTED`, `NURTURE`.

## Search Quality Gaps

Google:

- Already supports country, city, keyword group, local keywords, dedupe, and scoring.
- Needs cleaner country keyword library with correctly encoded local-language terms.
- Should create `LeadSource` records for each Google evidence item.

Instagram:

- Has multi-query planning in the frontend/backend, but the public product concept should become explicit: generate plan, preview/edit query list, then run the plan.
- Apify results should save Instagram-specific fields into `InstagramProfile`, not only `Lead.rawPayload`.
- Query generation should be local-language first, broad-but-targeted second, and feedback-driven over time.
- Low-quality profiles should be filtered before becoming leads unless they are saved as rejected/source-only evidence for debugging.

Gemini:

- Gemini should be treated as a planner and analyst, not a scraper.
- All Gemini outputs must be validated and clamped before execution.
- Error copy should be user-friendly and should never expose raw provider payloads in primary UI.
- Local fallback plans must remain because quota, DNS, or malformed JSON can happen.

## Sprint Recommendation

Sprint 1 should stop here: document the current system and align the product focus.

Sprint 2 should be a careful schema migration, not a UI rewrite. Add the missing data model behind the existing UI first:

- Add `LeadSource`.
- Add `InstagramProfile`.
- Add `LeadActivity`.
- Expand `Lead` score and sales fields while keeping old fields for backward compatibility.
- Add mapping code so existing Google and Instagram searches continue working.

Sprint 3 and Sprint 4 should then turn Instagram into a visible plan-based workflow:

- `POST /api/instagram/search-plan/gemini`
- strict JSON response validation
- fallback local query generator
- editable multi-query plan in the UI
- Apify execution per query with per-query limit

## Immediate Cleanup Priorities

1. Repair mojibake local-language keywords in backend and frontend libraries.
2. Rename Instagram source handling toward `INSTAGRAM_APIFY` while keeping compatibility with existing `INSTAGRAM` records.
3. Split `App.jsx` into focused components after the schema is stable.
4. Make Gemini/API provider errors friendly in UI.
5. Keep the current run result panel separate from the full lead archive in every search workflow.
6. Show sales next action and contact availability prominently in lead list and lead detail.

## Definition Of Done For This Audit

- The project goal is narrowed to wholesale baby/kids clothing lead discovery.
- Current architecture and pain points are documented.
- The next implementation step is clear: unified lead data model first, then Gemini search planner endpoint and Instagram multi-query execution.
