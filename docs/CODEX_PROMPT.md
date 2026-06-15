# Codex Prompt — Melisa Lead Finder V1

Build and harden the `melisa-lead-finder` project.

Context:
- This is a standalone full-stack lead generation application for Melisa Baby, a wholesale baby clothing company.
- It must remain separate from the ERP for now.
- V1 must avoid spam, illegal scraping, or automatic outbound WhatsApp messages.
- V1 uses demo provider first; Google Places, Apify, and OpenAI are provider interfaces to be connected after the app is stable.

Tech stack:
- React + Vite frontend
- Node.js + Express backend
- PostgreSQL
- Prisma ORM
- Redis/BullMQ later for background jobs
- Docker Compose for local database services

Immediate tasks:
1. Install dependencies and make the app run locally.
2. Run Prisma generate and migration.
3. Verify seed script creates demo leads.
4. Verify API endpoints:
   - GET /api/health
   - GET /api/leads
   - GET /api/leads/stats
   - POST /api/search-tasks
   - POST /api/search-tasks/:id/run
   - PATCH /api/leads/:id
   - GET /api/leads/export.csv
5. Verify frontend displays dashboard, lead list, lead detail, task form, and task run button.
6. Add tests or smoke scripts if needed.
7. Do not add real scraping until provider contracts are reviewed.

Acceptance criteria:
- `docker compose up -d` starts postgres and redis.
- `npm install` succeeds.
- `npm run db:generate` succeeds.
- `npm run db:migrate` succeeds.
- `npm run db:seed` succeeds.
- `npm run dev` starts API and web.
- User can create a demo search task, run it, see generated leads, update status, and export CSV.
