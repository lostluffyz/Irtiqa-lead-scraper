// ---------------------------------------------------------------------------
// normalizeResult — Convert gosom/google-maps-scraper output to lead fields
// ---------------------------------------------------------------------------
//
// Scraper schema (NDJSON, one object per line):
//   title:           string
//   address:         string  ("123 Main St, Berlin, Germany")
//   complete_address: { borough, street, city, postal_code, state, country }
//   web_site:        string  (note: underscore, not "website")
//   phone:           string
//   category:        string
//   place_id:        string
//   link:            string  (Google Maps URL)
//   review_rating:   number
//   review_count:    number
//   latitude:        number
//   longitude:       number
//   emails:          string[]
//
// NOTE: the tool's exact field for permanently-closed businesses is NOT
// visible in this repo (fixtures/tests/README show no such field).
// detectClosed() therefore checks raw.permanently_closed === true plus
// status/open-hours text matching /permanently closed|closed permanently/i.
// If the real tool field differs, only detectClosed() needs to change.

import { normalizePhone } from "./phone.js";
import { pickBestEmail } from "./email.js";
import { cleanWebsite } from "./website.js";
import { normalizeCountry, titleCasePlace } from "./country.js";

const CLOSED_TEXT_RE = /permanently\s*closed|closed\s*permanently/i;

export function detectClosed(item) {
  if (!item || typeof item !== "object") return false;
  if (item.permanently_closed === true) return true;
  for (const key of ["status", "business_status", "open_hours", "opening_hours", "hours"]) {
    const value = item[key];
    if (typeof value === "string" && CLOSED_TEXT_RE.test(value)) return true;
  }
  return false;
}

export function normalizeResult(item) {
  const company_name = item.title || item.name || null;
  if (!company_name) return null;

  // Parse address components
  // gosom/google-maps-scraper outputs:
  //   complete_address: { borough, street, city, postal_code, state, country } (object)
  //   address: "123 Main St, Berlin, Germany" (flat string)
  let country = null;
  let state = null;
  let city = null;

  const ca = item.complete_address;
  if (ca && typeof ca === "object" && !Array.isArray(ca)) {
    // Structured address from scraper — use fields directly
    country = ca.country || null;
    state = ca.state || null;
    city = ca.city || null;
  }

  // If structured address yielded nothing, fall back to flat string
  if (!country && !state && !city) {
    const addressStr =
      (typeof ca === "string" ? ca : null) || item.address || "";
    if (addressStr) {
      const parts = addressStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length >= 3) {
        country = parts[parts.length - 1] || null;
        state = parts[parts.length - 2] || null;
        city = parts[parts.length - 3] || null;
      } else if (parts.length === 2) {
        country = parts[1] || null;
        city = parts[0] || null;
      } else if (parts.length === 1) {
        city = parts[0] || null;
      }
    }
  }

  // Normalize place names: ISO codes -> full names, casing fixed.
  // ("NG" -> "Nigeria"; "LAGOS" -> "Lagos"; mixed case untouched.)
  country = country == null ? null : titleCasePlace(normalizeCountry(country));
  state = state == null ? null : titleCasePlace(state);
  city = city == null ? null : titleCasePlace(city);

  // Best email (trimmed, lowercased, artifacts rejected)
  const email = pickBestEmail(item.emails);

  // Phone: store E.164 when valid, otherwise the original trimmed string
  // (a bad phone never drops the lead). Validity is exposed for the gates.
  const rawPhone = typeof item.phone === "string" ? item.phone.trim() : item.phone || null;
  const phoneInfo = normalizePhone(rawPhone);
  const phone = phoneInfo.valid ? phoneInfo.e164 : rawPhone || null;

  // Human-readable notes (partners type private notes in this same field):
  // one line per available part, joined with " | ". Latitude/longitude and
  // place_id stay out (place_id has its own column).
  const noteParts = [];
  if (item.review_rating) {
    noteParts.push(
      `Google Maps rating ${item.review_rating}` +
        (item.review_count ? ` (${item.review_count} reviews)` : ""),
    );
  } else if (item.review_count) {
    noteParts.push(`Google Maps reviews: ${item.review_count}`);
  }
  if (item.category) noteParts.push(`Category: ${item.category}`);
  if (item.link) noteParts.push(`Maps: ${item.link}`);
  const internal_notes = noteParts.length > 0 ? noteParts.join(" | ") : null;

  return {
    company_name,
    // Scraper outputs "web_site" (with underscore), not "website"
    website: cleanWebsite(item.web_site || item.website || null),
    phone,
    phoneType: phoneInfo.type,
    phoneValid: phoneInfo.valid,
    email,
    industry: item.category || null,
    country,
    state,
    city,
    internal_notes,
    google_place_id: item.place_id || null,
    permanentlyClosed: detectClosed(item),
    source: "google_maps",
    status: "not_contacted",
  };
}
