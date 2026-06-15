# Melisa Lead Finder V1 Blueprint

## Goal

Produce a daily pipeline of qualified potential customers for Melisa Baby's sales team.

## V1 Flow

1. Admin creates a search task.
2. Demo/Google provider returns candidate companies.
3. System saves leads.
4. Lead scoring service scores each candidate.
5. Sales team reviews leads.
6. Qualified leads are marked as CRM-ready.
7. CSV export is used until ERP/CRM API integration is added.

## Lead Statuses

- NEW: newly found
- REVIEW: sales team is reviewing
- QUALIFIED: good target
- REJECTED: not suitable
- CONVERTED: transferred to CRM or ready for CRM transfer

## Scoring Rules

- Baby/kids category signal: +25
- Phone or WhatsApp: +20
- Website: +15
- Instagram: +15
- Active Instagram signal: +10
- Google rating over 4.0: +5
- Review count over 20: +5
- Wholesale/multibranch signal: +5

## V2 Additions

- Google Places provider
- Apify provider
- OpenAI enrichment/scoring
- Deduplication engine
- User roles
- Real CRM/ERP export endpoint
- WhatsApp message draft templates
