// ---------------------------------------------------------------------------
// pickBestEmail — choose one email address from a scraped list (pure)
// ---------------------------------------------------------------------------
//
// Rules:
//   - Trim + lowercase every candidate; drop invalid syntax (simple regex).
//   - Reject scraping artifacts: domains/TLDs ending .png/.jpg/.jpeg/.gif/
//     .webp/.svg/.css/.js and placeholder domains (example.com, domain.com,
//     sentry.io, wixpress.com, sentry-next.wixpress.com).
//   - Prefer a non-generic local part; fall back to the first valid generic
//     one (info, contact, hello, admin, support, sales, enquiries, enquiry,
//     mail, office, hi, team).
//   - Return null when nothing valid remains.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAD_TLDS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js"];
const PLACEHOLDER_DOMAINS = [
  "example.com",
  "domain.com",
  "sentry.io",
  "wixpress.com",
  "sentry-next.wixpress.com",
];
const GENERIC_LOCALS = new Set([
  "info",
  "contact",
  "hello",
  "admin",
  "support",
  "sales",
  "enquiries",
  "enquiry",
  "mail",
  "office",
  "hi",
  "team",
]);

function cleanCandidate(raw) {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (BAD_TLDS.some((tld) => domain.endsWith(tld))) return null;
  if (PLACEHOLDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return null;
  }
  return email;
}

export function pickBestEmail(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const valid = [];
  for (const raw of list) {
    const email = cleanCandidate(raw);
    if (email) valid.push(email);
  }
  if (valid.length === 0) return null;
  const personal = valid.find(
    (email) => !GENERIC_LOCALS.has(email.slice(0, email.indexOf("@"))),
  );
  return personal || valid[0];
}
