// ---------------------------------------------------------------------------
// NDJSON parsing with truncation tolerance (pure, no deps)
// ---------------------------------------------------------------------------
//
// parseNdjson(text) -> { rows, skipped }
// Parses one JSON object per line. Lines that fail to parse (e.g. a
// truncated final line after a killed scraper step) are SKIPPED and counted
// instead of failing the whole file. Non-object values (numbers, strings,
// arrays, null) are skipped as well.

export function parseNdjson(text) {
  const rows = [];
  let skipped = 0;
  if (typeof text !== "string") return { rows, skipped };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        rows.push(value);
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }
  return { rows, skipped };
}
