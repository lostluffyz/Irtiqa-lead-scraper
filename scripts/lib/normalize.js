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

  // Extract first email
  let email = null;
  if (item.emails && Array.isArray(item.emails) && item.emails.length > 0) {
    email = item.emails[0];
  }

  // Build metadata for internal_notes
  const metadata = {};
  if (item.link) metadata.google_maps_url = item.link;
  if (item.review_rating) metadata.review_rating = item.review_rating;
  if (item.review_count) metadata.review_count = item.review_count;
  if (item.latitude) metadata.latitude = item.latitude;
  if (item.longitude) metadata.longitude = item.longitude;
  if (item.place_id) metadata.place_id = item.place_id;
  if (item.category) metadata.category = item.category;

  const internal_notes =
    Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;

  return {
    company_name,
    // Scraper outputs "web_site" (with underscore), not "website"
    website: item.web_site || item.website || null,
    phone: item.phone || null,
    email,
    industry: item.category || null,
    country,
    state,
    city,
    internal_notes,
    google_place_id: item.place_id || null,
    source: "google_maps",
    status: "not_contacted",
  };
}
