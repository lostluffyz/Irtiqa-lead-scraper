# Irtiqa Lead Scraper

Google Maps lead scraper for the Revenue Partner Workspace.

Runs inside GitHub Actions using the official `gosom/google-maps-scraper` Docker image.

## How It Works

1. Admin triggers a scrape job from the Revenue Partner admin UI
2. Vercel dispatches a GitHub Actions workflow
3. GitHub Actions runs the Docker scraper
4. Ingestion script normalizes, deduplicates, and inserts leads into Supabase
5. New leads appear as unassigned in the Revenue Partner app

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |

## Workflow Inputs

| Input | Type | Required | Default |
|-------|------|----------|---------|
| `scrape_job_id` | string | yes | — |
| `query` | string | yes | — |
| `location` | string | yes | — |
| `requested_count` | number | yes | — |
| `extract_emails` | boolean | no | false |
| `dry_run` | boolean | no | true |

## Local Development

```bash
cd scripts
npm install
node ingest.js \
  --scrape-job-id <uuid> \
  --input results.json \
  --requested 100 \
  --dry-run true
```
