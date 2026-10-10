#!/usr/bin/env node

// ============================================
// Irtiqa Lead Scraper — Ingestion Script
// ============================================
//
// Reads Google Maps scraper JSON output, normalizes fields, applies
// quality gates, deduplicates (intra-batch, then place id / website key /
// E.164 phone / company_name+phone against the database), limits to the
// requested count, and inserts into Supabase.
//
// Flow: parse NDJSON (tolerant) -> normalize -> gates -> dedupe -> LIMIT
//   -> insert. "requested N" therefore means "up to N new valid leads".
//
// Usage:
//   node ingest.js \
//     --scrape-job-id <uuid> \
//     --input results.json \
//     --requested 100 \
//     --dry-run true \
//     [--require-contact true] \
//     [--country-allowlist "NG,GH"] \
//     [--skip-closed true]
//
// Environment variables:
//   SUPABASE_URL            — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { normalizeResult } from "./lib/normalize.js";
import { parseNdjson } from "./lib/ndjson.js";
import { applyGates } from "./lib/gates.js";
import { markIntraBatchDupes } from "./lib/dedupe.js";
import { websiteKey } from "./lib/website.js";

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (key && value !== undefined) {
      parsed[key] = value;
    }
  }
  return {
    scrapeJobId: parsed["scrape-job-id"],
    inputFile: parsed["input"] || "results/results.json",
    requestedCount: parseInt(parsed["requested"] || "100", 10),
    dryRun: parsed["dry-run"] === "true",
    // Quality gates (all default to today's behavior: no filtering)
    requireContact: parsed["require-contact"] === "true",
    countryAllowlist: (parsed["country-allowlist"] || "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    skipClosed: parsed["skip-closed"] === "true",
  };
}

// ---------------------------------------------------------------------------
// Initialize Supabase client (service role, bypasses RLS)
// ---------------------------------------------------------------------------

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------
//
// Order (both passes): place id, website, phone (E.164), name+phone.
// Intra-batch duplicates are removed first by the pure markIntraBatchDupes()
// helper (unit-tested, no database). The DB pass then checks survivors.
//
// Website DB check uses the normalized host key: rows whose website contains
// the host are fetched with ilike and compared with websiteKey() in JS,
// because stored URLs vary in protocol/casing/trailing slash.
// Phone DB check is one batched `.in("phone", …)` query over the valid
// E.164 numbers in the batch.

async function fetchPhonesInDb(supabase, e164List) {
  const found = new Set();
  const unique = [...new Set(e164List.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const { data } = await supabase.from("leads").select("phone").in("phone", chunk);
    for (const row of data || []) {
      if (row.phone) found.add(row.phone);
    }
  }
  return found;
}

async function deduplicateDb(supabase, leads) {
  const deduplicated = [];
  let duplicate = 0;

  const phonesInDb = await fetchPhonesInDb(
    supabase,
    leads.filter((l) => l.phoneValid && l.phone).map((l) => l.phone),
  );

  for (const lead of leads) {
    // Check google_place_id (primary)
    if (lead.google_place_id) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("google_place_id", lead.google_place_id)
        .limit(1);

      if (existing && existing.length > 0) {
        duplicate++;
        continue;
      }
    }

    // Check website (secondary, by normalized host key)
    if (lead.website) {
      const key = websiteKey(lead.website);
      if (key) {
        const { data: existing } = await supabase
          .from("leads")
          .select("id, website")
          .ilike("website", `%${key}%`)
          .limit(50);

        if (
          existing &&
          existing.some((row) => row.website && websiteKey(row.website) === key)
        ) {
          duplicate++;
          continue;
        }
      }
    }

    // Check normalized phone (E.164)
    if (lead.phoneValid && lead.phone && phonesInDb.has(lead.phone)) {
      duplicate++;
      continue;
    }

    // Check company_name + phone (tertiary)
    if (lead.company_name && lead.phone) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("company_name", lead.company_name)
        .eq("phone", lead.phone)
        .limit(1);

      if (existing && existing.length > 0) {
        duplicate++;
        continue;
      }
    }

    deduplicated.push(lead);
  }

  return { deduplicated, duplicate };
}

async function deduplicate(supabase, leads) {
  const intra = markIntraBatchDupes(leads);
  const db = await deduplicateDb(supabase, intra.kept);
  return {
    deduplicated: db.deduplicated,
    stats: { duplicate: intra.dropped + db.duplicate, valid: db.deduplicated.length },
  };
}

// ---------------------------------------------------------------------------
// Batch insert
// ---------------------------------------------------------------------------

async function batchInsert(supabase, leads, createdBy, batchSize = 50) {
  let inserted = 0;
  let errors = 0;

  // Only real leads columns are sent. Auxiliary fields used by the gates
  // and dedupe (phoneType, phoneValid, permanentlyClosed) never reach the DB.
  const toRow = (lead) => ({
    company_name: lead.company_name,
    website: lead.website,
    phone: lead.phone,
    email: lead.email,
    industry: lead.industry,
    country: lead.country,
    state: lead.state,
    city: lead.city,
    internal_notes: lead.internal_notes,
    google_place_id: lead.google_place_id,
    source: lead.source,
    status: lead.status,
    created_by: createdBy,
  });

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize).map(toRow);

    const { data, error } = await supabase
      .from("leads")
      .insert(batch)
      .select("id");

    if (error) {
      console.error(`  Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += data?.length || batch.length;
    }
  }

  return { inserted, errors };
}

// ---------------------------------------------------------------------------
// Update scrape job status
// ---------------------------------------------------------------------------

async function updateJobStatus(supabase, jobId, updates) {
  if (!jobId) return;

  const { error } = await supabase
    .from("scrape_jobs")
    .update(updates)
    .eq("id", jobId);

  if (error) {
    console.error("Failed to update job status:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Look up created_by from scrape_jobs (required for leads NOT NULL constraint)
// ---------------------------------------------------------------------------

async function getCreatedBy(supabase, jobId) {
  if (!jobId) return null;

  const { data, error } = await supabase
    .from("scrape_jobs")
    .select("created_by")
    .eq("id", jobId)
    .single();

  if (error || !data) {
    console.error("Failed to look up created_by:", error?.message || "not found");
    return null;
  }

  return data.created_by;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  console.log("=== Irtiqa Lead Scraper — Ingestion ===");
  console.log(`Scrape Job ID: ${config.scrapeJobId || "(none)"}`);
  console.log(`Input: ${config.inputFile}`);
  console.log(`Requested: ${config.requestedCount}`);
  console.log(`Dry Run: ${config.dryRun}`);
  console.log(
    `Gates: requireContact=${config.requireContact} ` +
      `countryAllowlist=[${config.countryAllowlist.join(",")}] ` +
      `skipClosed=${config.skipClosed}`,
  );
  console.log("");

  // Initialize Supabase
  const supabase = initSupabase();

  // Mark job as running
  let createdBy = null;
  if (config.scrapeJobId) {
    await updateJobStatus(supabase, config.scrapeJobId, {
      status: "running",
      started_at: new Date().toISOString(),
    });
    createdBy = await getCreatedBy(supabase, config.scrapeJobId);
    if (!createdBy) {
      console.error("WARNING: No created_by found for this job. Leads will not have a creator reference.");
    }
  }

  // Read scraper output
  // gosom/google-maps-scraper -json outputs NDJSON (one JSON object per line).
  // We handle both JSON array and NDJSON formats for compatibility.
  // Truncated or invalid NDJSON lines (e.g. a killed scraper step) are
  // skipped and counted instead of failing the whole file.
  let rawResults;
  let parseSkipped = 0;
  try {
    const fileContent = readFileSync(config.inputFile, "utf8");
    const trimmed = fileContent.trim();

    if (!trimmed) {
      rawResults = [];
    } else if (trimmed.startsWith("[")) {
      // JSON array format
      rawResults = JSON.parse(trimmed);
    } else {
      // NDJSON format: invalid lines are skipped, not fatal
      const parsed = parseNdjson(trimmed);
      rawResults = parsed.rows;
      parseSkipped = parsed.skipped;
      if (parseSkipped > 0) {
        console.log(`Skipped ${parseSkipped} invalid/truncated line(s) in input`);
      }
    }
  } catch (err) {
    console.error("Failed to read/parse input file:", err.message);
    if (config.scrapeJobId) {
      await updateJobStatus(supabase, config.scrapeJobId, {
        status: "failed",
        error_message: `Failed to read input: ${err.message}`,
        completed_at: new Date().toISOString(),
      });
    }
    process.exit(1);
  }

  // Ensure array
  if (!Array.isArray(rawResults)) {
    rawResults = [];
  }

  console.log(`Scraped results: ${rawResults.length}`);

  // Normalize
  const normalized = rawResults
    .map(normalizeResult)
    .filter((r) => r !== null);

  console.log(`Valid after normalization: ${normalized.length}`);

  // Quality gates (no-ops unless enabled via CLI flags)
  const { kept: gated, dropped: gateDropped } = applyGates(normalized, {
    requireContact: config.requireContact,
    countryAllowlist: config.countryAllowlist,
    skipClosed: config.skipClosed,
  });
  const gateDroppedTotal =
    gateDropped.no_contact + gateDropped.country + gateDropped.closed;
  if (gateDroppedTotal > 0) {
    console.log(
      `Gates dropped ${gateDroppedTotal} ` +
        `(no_contact=${gateDropped.no_contact} ` +
        `country=${gateDropped.country} closed=${gateDropped.closed})`,
    );
  }

  // Deduplicate (intra-batch first, then against the database)
  const { deduplicated: deduped, stats: dedupStats } = await deduplicate(
    supabase,
    gated,
  );
  console.log(`After dedup: ${deduped.length} new (${dedupStats.duplicate} duplicates)`);

  // Limit to requested count — applied AFTER gates and dedupe, so
  // "requested N" means "up to N new valid leads inserted".
  const limited = deduped.slice(0, config.requestedCount);
  console.log(`After limit: ${limited.length}`);

  // Update stats
  //   scraped_count: rows read from the tool output
  //   valid_count:   rows that survived normalization AND gates
  //   skipped_count: rows dropped by the gates
  //   duplicate_count: rows dropped by dedupe
  const stats = {
    scraped_count: rawResults.length,
    valid_count: gated.length,
    duplicate_count: dedupStats.duplicate,
    skipped_count: gateDroppedTotal,
  };

  // Insert (or dry run)
  let insertedCount = 0;
  let errorCount = 0;

  if (config.dryRun) {
    console.log("\n=== DRY RUN — No database writes ===");
    console.log(`Would insert: ${limited.length}`);
  } else {
    console.log("\nInserting leads...");
    const { inserted, errors } = await batchInsert(supabase, limited, createdBy);
    insertedCount = inserted;
    errorCount = errors;
    console.log(`Inserted: ${insertedCount}`);
    if (errorCount > 0) {
      console.log(`Errors: ${errorCount}`);
    }
  }

  // Determine final status
  let finalStatus = "completed";
  if (errorCount > 0 && insertedCount > 0) {
    finalStatus = "partial";
  } else if (errorCount > 0 && insertedCount === 0) {
    finalStatus = "failed";
  }

  // Update job in Supabase
  if (config.scrapeJobId) {
    await updateJobStatus(supabase, config.scrapeJobId, {
      status: config.dryRun ? "completed" : finalStatus,
      scraped_count: stats.scraped_count,
      valid_count: stats.valid_count,
      inserted_count: insertedCount,
      duplicate_count: stats.duplicate_count,
      skipped_count: stats.skipped_count,
      error_count: errorCount,
      completed_at: new Date().toISOString(),
    });
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Scraped: ${stats.scraped_count}`);
  console.log(`Valid: ${stats.valid_count}`);
  console.log(`Inserted: ${insertedCount}`);
  console.log(`Duplicates: ${stats.duplicate_count}`);
  console.log(`Skipped: ${stats.skipped_count}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Status: ${config.dryRun ? "completed (dry run)" : finalStatus}`);

  // Exit with error code if inserts failed (so GitHub Actions marks workflow as failed)
  if (!config.dryRun && errorCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
