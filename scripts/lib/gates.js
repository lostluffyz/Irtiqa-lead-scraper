// ---------------------------------------------------------------------------
// applyGates — ingest-side quality gates (pure, no deps)
// ---------------------------------------------------------------------------
//
// applyGates(rows, options) -> { kept, dropped: { no_contact, country, closed } }
//   options: { requireContact?: boolean,
//              countryAllowlist?: string[] (2-letter codes, empty = no filter),
//              skipClosed?: boolean }
//
// Rules:
//   (1) requireContact: drop when there is NO valid phone (row.phoneValid)
//       AND NO email (row.email).
//   (2) country: with a non-empty allowlist, drop rows whose countryCode is
//       not listed; rows whose country cannot be determined are dropped.
//   (3) skipClosed: drop rows flagged row.permanentlyClosed.
//
// NOTE: the tool's real field name for closed businesses is NOT visible in
// this repo (fixtures/tests/README show no such field). normalize.js sets
// row.permanentlyClosed via tolerant detection (raw.permanently_closed ===
// true, or status/open-hours text matching /permanently closed|closed
// permanently/i). If the real tool field differs, only that detector changes.

import { countryCode } from "./country.js";

export function applyGates(rows, options = {}) {
  const requireContact = options.requireContact === true;
  const allowlist = Array.isArray(options.countryAllowlist)
    ? options.countryAllowlist
        .map((c) => String(c).trim().toUpperCase())
        .filter(Boolean)
    : [];
  const skipClosed = options.skipClosed === true;

  const kept = [];
  const dropped = { no_contact: 0, country: 0, closed: 0 };

  for (const row of rows) {
    if (requireContact && !row.phoneValid && !row.email) {
      dropped.no_contact++;
      continue;
    }
    if (allowlist.length > 0) {
      const code = countryCode(row.country);
      if (!code || !allowlist.includes(code)) {
        dropped.country++;
        continue;
      }
    }
    if (skipClosed && row.permanentlyClosed) {
      dropped.closed++;
      continue;
    }
    kept.push(row);
  }

  return { kept, dropped };
}
