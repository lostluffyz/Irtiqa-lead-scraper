// ---------------------------------------------------------------------------
// Country / place-name helpers (pure, no deps)
// ---------------------------------------------------------------------------
//
// normalizeCountry(value): 2-letter ISO code (case-insensitive) -> full
//   English name via Intl.DisplayNames (Node ships ICU); an already-a-name
//   value is returned trimmed; unknown/invalid codes return unchanged.
// countryCode(value): 2-letter code when determinable — a code, a known
//   name via a reverse lookup, or "Nigeria" found in free text; else null.
// titleCasePlace(value): title-cases ALL-LOWER or ALL-UPPER strings;
//   mixed-case strings are untouched.

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

let reverseLookup = null;

// A compact, dependency-free code list. Intl.DisplayNames can name codes
// but cannot enumerate the region list (supportedValuesOf has no "region"
// key), so names are resolved through DisplayNames at lookup build time.
const KNOWN_REGION_CODES = [
  "NG", "GH", "GB", "US", "AE", "DE", "FR", "IN", "KE", "ZA", "CA", "AU",
  "IE", "NL", "ES", "IT", "PT", "BE", "CH", "SE", "NO", "DK", "FI", "PL",
  "BR", "MX", "EG", "SA", "QA", "KW", "BH", "OM", "JO", "TR", "CN", "JP",
  "KR", "SG", "MY", "ID", "PH", "TH", "VN", "PK", "BD", "LK", "ET", "RW",
  "UG", "TZ", "SN", "CI", "CM", "ML", "BF", "NE", "TD", "SD", "LY", "TN",
  "DZ", "MA", "MU",
];

function getReverseLookup() {
  if (reverseLookup) return reverseLookup;
  reverseLookup = new Map();
  let codes = KNOWN_REGION_CODES;
  try {
    const supported = Intl.supportedValuesOf("region");
    if (Array.isArray(supported) && supported.length > 0) codes = supported;
  } catch {
    // No "region" key on this ICU build — use the curated list.
  }
  for (const code of codes) {
    try {
      const name = displayNames.of(code);
      if (name && name.toUpperCase() !== code.toUpperCase()) {
        reverseLookup.set(name.toLowerCase(), code.toUpperCase());
      }
    } catch {
      // Ignore codes this ICU build cannot name.
    }
  }
  return reverseLookup;
}

export function normalizeCountry(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    try {
      const name = displayNames.of(trimmed.toUpperCase());
      // Unknown codes fall back to the code itself — return unchanged.
      if (!name || name.toUpperCase() === trimmed.toUpperCase()) return trimmed;
      return name;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function countryCode(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    try {
      const name = displayNames.of(trimmed.toUpperCase());
      if (name && name.toUpperCase() !== trimmed.toUpperCase()) {
        return trimmed.toUpperCase();
      }
    } catch {
      // Not a real code — fall through to name lookup.
    }
  }
  const known = getReverseLookup().get(trimmed.toLowerCase());
  if (known) return known;
  if (/\bnigeria\b/i.test(trimmed)) return "NG";
  return null;
}

export function titleCasePlace(value) {
  if (typeof value !== "string") return value;
  if (!value) return value;
  const isAllLower = value === value.toLowerCase();
  const isAllUpper = value === value.toUpperCase();
  if (!isAllLower && !isAllUpper) return value;
  return value
    .toLowerCase()
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part) || part.length === 0
        ? part
        : part[0].toUpperCase() + part.slice(1),
    )
    .join("");
}
