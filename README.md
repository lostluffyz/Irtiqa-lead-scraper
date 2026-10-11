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
| `depth` | string | no | `"2"` (1–10; how far the tool scrolls the results list — more results, longer run; exact semantics inferred from the flag name) |
| `require_contact` | string | no | `"false"` (drop rows with no valid phone and no email) |
| `country_allowlist` | string | no | `""` = no filter (e.g. `"NG"` or `"NG,GH"`) |
| `skip_closed` | string | no | `"false"` (drop permanently closed businesses) |

All inputs reach steps through `env:` (never interpolated into shell).
`requested_count` is applied AFTER gates and dedupe, so "requested N" means
"up to N new valid leads inserted".

## Ingest order and counters

Parse NDJSON (tolerant of truncated lines) → normalize → gates → dedupe →
limit → insert.

| Counter column | Meaning |
|----------------|---------|
| `scraped_count` | rows read from the tool output |
| `valid_count` | rows surviving normalization AND gates |
| `skipped_count` | rows dropped by the gates (previously always 0) |
| `duplicate_count` | rows dropped by dedupe |
| `inserted_count` / `error_count` | insert results (unchanged) |

A final `if: always()` step marks jobs still `pending`/`running` as failed,
so killed runs no longer strand jobs. The docker step has its own
20-minute timeout (`continue-on-error: true`) inside the 30-minute job
timeout, so ingestion still runs on partial results.

## Local Development

```bash
cd scripts
npm install
node ingest.js \
  --scrape-job-id <uuid> \
  --input results.json \
  --requested 100 \
  --dry-run true \
  --require-contact false \
  --country-allowlist "" \
  --skip-closed false
```

## Tests

```bash
cd scripts
node --test
```

Dependency-free unit tests (`node:test` + `node:assert/strict` only):
`normalize`, `phone`, `email`, `website`, `country`, `gates`, `ndjson`,
`dedupe` helpers plus an offline 12-row normalize+gates fixture.

## Operations

- Image pin: the workflow runs
  `gosom/google-maps-scraper@sha256:<digest>` via the workflow-level
  `SCRAPER_IMAGE` variable (pinned from run #9, 2026-10-11), guarded by a
  "Validate scraper image digest" step that fails unless the value matches
  `^gosom/google-maps-scraper@sha256:[0-9a-f]{64}$`. To upgrade: copy the new
  digest from a successful run log, dry-run it (manual `workflow_dispatch`
  with the branch selected, `dry_run=true`), then change the one line.
- Runner pin: `runs-on: ubuntu-24.04`, because the `ubuntu-latest` label
  migrates to Ubuntu 26 beginning 2026-10-19 (annotation seen on run #9).
- Observed run-time: about 4 minutes and 34 places for one search at depth 4.
