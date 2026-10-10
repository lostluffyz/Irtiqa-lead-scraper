// ---------------------------------------------------------------------------
// Website helpers (pure, no deps)
// ---------------------------------------------------------------------------
//
// cleanWebsite(url): trim; add https:// when no protocol; drop tracking
//   params (utm_*, gclid, fbclid) and trailing slashes + hash; keep
//   protocol, host and path. Returns null when unparseable.
// websiteKey(url): lowercase hostname without a leading "www.",
//   or null when invalid.

const TRACKING_PARAMS = new Set(["gclid", "fbclid"]);

function isTrackingParam(name) {
  return name.startsWith("utm_") || TRACKING_PARAMS.has(name);
}

function tryParse(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function parseWebsite(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return (
    tryParse(trimmed) ||
    tryParse(`https://${trimmed.replace(/^\/+/, "")}`)
  );
}

export function cleanWebsite(url) {
  const parsed = parseWebsite(url);
  if (!parsed || !parsed.hostname) return null;
  for (const name of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(name)) {
      parsed.searchParams.delete(name);
    }
  }
  parsed.hash = "";
  let out = parsed.toString();
  out = out.replace(/\/+$/, "");
  return out || null;
}

export function websiteKey(url) {
  const parsed = parseWebsite(url);
  if (!parsed || !parsed.hostname) return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, "") || null;
}
