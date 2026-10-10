#!/usr/bin/env node

// ============================================
// Mark Failed — Workflow hygiene step
// ============================================
//
// Runs with `if: always()` at the end of the scrape workflow. Marks a
// scrape job as failed ONLY when it is still "pending" or "running"
// (i.e. ingestion never finished: timeout kill, runner crash, early exit).
// Jobs that already reached completed/partial/failed/cancelled are never
// touched.
//
// Usage:
//   node scripts/mark-failed.js --job-id <uuid>
//
// Environment variables:
//   SUPABASE_URL              — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key

import { createClient } from "@supabase/supabase-js";

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
  return { jobId: parsed["job-id"] };
}

async function main() {
  const { jobId } = parseArgs();
  if (!jobId) {
    console.error("mark-failed: missing --job-id, nothing to do");
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("mark-failed: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return;
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("scrape_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: "Workflow ended before ingestion finished",
    })
    .eq("id", jobId)
    .in("status", ["pending", "running"])
    .select("id");

  if (error) {
    console.error("mark-failed: update failed:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("mark-failed: job already in a terminal state, untouched");
  } else {
    console.log("mark-failed: stale job marked as failed");
  }
}

main().catch((err) => {
  console.error("mark-failed: fatal error:", err?.message || err);
});
