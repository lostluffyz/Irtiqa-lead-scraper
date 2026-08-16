#!/usr/bin/env node

// ============================================
// Irtiqa Lead Scraper — Ingestion Script
// ============================================
//
// Reads Google Maps scraper JSON output, normalizes fields,
// deduplicates (google_place_id primary, website fallback,
// company_name+phone fallback), validates, and inserts into Supabase.
//
// Usage:
//   node ingest.js \
//     --scrape-job-id <uuid> \
//     --input results.json \
//     --requested 100 \
//     --dry-run true
//
// Environment variables:
//   SUPABASE_URL            — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { normalizeResult } from "./lib/normalize.js";

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

async function deduplicate(supabase, leads) {
  const deduplicated = [];
  const stats = { duplicate: 0, valid: 0 };

  // In-memory dedup tracking
  const seenPlaceIds = new Set();
  const seenWebsites = new Set();
  const seenNamePhone = new Set();

  for (const lead of leads) {
    // Check google_place_id (primary)
    if (lead.google_place_id) {
      if (seenPlaceIds.has(lead.google_place_id)) {
        stats.duplicate++;
        continue;
      }

      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("google_place_id", lead.google_place_id)
        .limit(1);

      if (existing && existing.length > 0) {
        stats.duplicate++;
        continue;
      }

      seenPlaceIds.add(lead.google_place_id);
    }

    // Check website (secondary)
    if (lead.website) {
      const normalizedWebsite = lead.website
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");

      if (seenWebsites.has(normalizedWebsite)) {
        stats.duplicate++;
        continue;
      }

      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("website", lead.website)
        .limit(1);

      if (existing && existing.length > 0) {
        stats.duplicate++;
        continue;
      }

      seenWebsites.add(normalizedWebsite);
    }

    // Check company_name + phone (tertiary)
    if (lead.company_name && lead.phone) {
      const key = `${lead.company_name.toLowerCase()}|${lead.phone}`;
      if (seenNamePhone.has(key)) {
        stats.duplicate++;
        continue;
      }

      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("company_name", lead.company_name)
        .eq("phone", lead.phone)
        .limit(1);

      if (existing && existing.length > 0) {
        stats.duplicate++;
        continue;
      }

      seenNamePhone.add(key);
    }

    stats.valid++;
    deduplicated.push(lead);
  }

  return { deduplicated, stats };
}

// ---------------------------------------------------------------------------
// Batch insert
// ---------------------------------------------------------------------------

async function batchInsert(supabase, leads, batchSize = 50) {
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);

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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  console.log("=== Irtiqa Lead Scraper — Ingestion ===");
  console.log(`Scrape Job ID: ${config.scrapeJobId || "(none)"}`);
  console.log(`Input: ${config.inputFile}`);
  console.log(`Requested: ${config.requestedCount}`);
  console.log(`Dry Run: ${config.dryRun}`);
  console.log("");

  // Initialize Supabase
  const supabase = initSupabase();

  // Mark job as running
  if (config.scrapeJobId) {
    await updateJobStatus(supabase, config.scrapeJobId, {
      status: "running",
      started_at: new Date().toISOString(),
    });
  }

  // Read scraper output
  // gosom/google-maps-scraper -json outputs NDJSON (one JSON object per line).
  // We handle both JSON array and NDJSON formats for compatibility.
  let rawResults;
  try {
    const fileContent = readFileSync(config.inputFile, "utf8");
    const trimmed = fileContent.trim();

    if (!trimmed) {
      rawResults = [];
    } else if (trimmed.startsWith("[")) {
      // JSON array format
      rawResults = JSON.parse(trimmed);
    } else {
      // NDJSON format: one JSON object per line
      rawResults = trimmed
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line, i) => {
          try {
            return JSON.parse(line);
          } catch (e) {
            throw new Error(
              `Invalid JSON on line ${i + 1}: ${e.message}\n  Line: ${line.substring(0, 100)}`,
            );
          }
        });
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

  // Limit to requested count
  const limited = normalized.slice(0, config.requestedCount);
  console.log(`After limit: ${limited.length}`);

  // Deduplicate
  const { deduplicated, stats: dedupStats } = await deduplicate(
    supabase,
    limited,
  );
  console.log(`After dedup: ${deduplicated.length} new (${dedupStats.duplicate} duplicates)`);

  // Update stats
  const stats = {
    scraped_count: rawResults.length,
    valid_count: normalized.length,
    duplicate_count: dedupStats.duplicate,
    skipped_count: limited.length - deduplicated.length - dedupStats.duplicate,
  };

  // Insert (or dry run)
  let insertedCount = 0;
  let errorCount = 0;

  if (config.dryRun) {
    console.log("\n=== DRY RUN — No database writes ===");
    console.log(`Would insert: ${deduplicated.length}`);
  } else {
    console.log("\nInserting leads...");
    const { inserted, errors } = await batchInsert(supabase, deduplicated);
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
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
