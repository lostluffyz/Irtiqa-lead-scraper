// ---------------------------------------------------------------------------
// normalizePhone — Nigerian-first phone normalization (pure, no deps)
// ---------------------------------------------------------------------------
//
// normalizePhone(raw, defaultCountry = "NG") -> { e164, type, valid }
//   e164: "+2348031234567" style E.164, or null when not valid
//   type: "mobile" | "landline" | "unknown"
//   valid: boolean
//
// Rules:
//   - Drop a trailing extension ("x12", "ext. 3") before parsing.
//   - Strip every character except digits and a leading "+".
//   - Nigeria (+234): mobile = +234 + 10 digits starting 70/80/81/90/91;
//     a local leading 0 is replaced with +234; landlines (area code without
//     the 0) are valid with 8-10 digits after +234.
//   - Explicit "+" non-Nigerian numbers: kept as digits-only E.164,
//     type "unknown", valid with 8-15 digits.
//   - Anything else -> valid false, e164 null.

const NG_MOBILE_PREFIXES = ["70", "80", "81", "90", "91"];

function classifyNigeria(rest) {
  if (/^\d{10}$/.test(rest) && NG_MOBILE_PREFIXES.includes(rest.slice(0, 2))) {
    return "mobile";
  }
  if (/^\d{8,10}$/.test(rest)) {
    return "landline";
  }
  return null;
}

function invalid() {
  return { e164: null, type: "unknown", valid: false };
}

export function normalizePhone(raw, defaultCountry = "NG") {
  if (raw === null || raw === undefined) return invalid();
  let s = String(raw);
  // Drop trailing extensions: "08031234567 x12", "01 234 5678 ext. 3"
  s = s.replace(/\s*(?:ext\.?|x)\s*\d+\s*$/i, "");
  const cleaned = s.replace(/[^0-9+]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return invalid();

  const hadPlus = cleaned[0] === "+";
  const digits = cleaned.replace(/\+/g, "");
  if (!digits) return invalid();

  // Explicit international format
  if (hadPlus) {
    if (digits.startsWith("234")) {
      const type = classifyNigeria(digits.slice(3));
      if (!type) return invalid();
      return { e164: `+${digits}`, type, valid: true };
    }
    if (digits.length >= 8 && digits.length <= 15) {
      return { e164: `+${digits}`, type: "unknown", valid: true };
    }
    return invalid();
  }

  // National format — only Nigeria is supported without an explicit "+"
  if (defaultCountry !== "NG") return invalid();
  const national = digits.startsWith("0") ? digits.slice(1) : digits;
  const rest = national.startsWith("234") ? national.slice(3) : national;
  const type = classifyNigeria(rest);
  if (!type) return invalid();
  return { e164: `+234${rest}`, type, valid: true };
}
