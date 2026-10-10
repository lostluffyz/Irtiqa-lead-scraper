import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeResult } from "./lib/normalize.js";
import { applyGates } from "./lib/gates.js";

// ---------------------------------------------------------------------------
// Offline end-to-end: 12 SYNTHETIC rows (all invented) through
// normalize + applyGates with require-contact + NG allowlist.
// No real business data.
// ---------------------------------------------------------------------------

function item(overrides) {
  return {
    title: "Synthetic Business",
    address: "1 Test Road, Ikeja, Lagos, Nigeria",
    complete_address: { city: "Ikeja", state: "Lagos", country: "NG" },
    link: "https://maps/place/synthetic",
    place_id: "ChIJ_synth",
    category: "Pharmacy",
    ...overrides,
  };
}

const ROWS = [
  // 0: NG + valid mobile -> kept
  item({ title: "Keep Mobile", phone: "08031234567" }),
  // 1: NG + email only -> kept
  item({ title: "Keep Email", phone: null, emails: ["adaeze@shop.ng"] }),
  // 2: NG + neither -> dropped no_contact
  item({ title: "Drop NoContact", phone: null, emails: [] }),
  // 3: Ghana + phone -> dropped country
  item({
    title: "Drop Ghana",
    phone: "0244123456",
    complete_address: { city: "Accra", state: "Greater Accra", country: "GH" },
    address: "1 Test Road, Accra, Ghana",
  }),
  // 4: blank country + phone -> dropped country (undetermined)
  item({ title: "Drop Unknown", phone: "08031234567", complete_address: null, address: "Nowhere" }),
  // 5: NG + contact but closed -> dropped closed
  item({ title: "Drop Closed", phone: "08031234567", permanently_closed: true }),
  // 6: NG + bad email only -> dropped no_contact
  item({ title: "Drop BadEmail", phone: null, emails: ["logo@site.png"] }),
  // 7: foreign + number + email -> kept (email satisfies contact; country NG)
  item({ title: "Keep Foreign", phone: "+14155550132", emails: ["bob@shop.ng"] }),
  // 8: NG landline + no email -> kept (landline is valid contact)
  item({ title: "Keep Landline", phone: "(01) 234 5678" }),
  // 9: duplicate place_id of row 0 -> kept here (dedupe is a later stage)
  item({ title: "Keep DupPlace", phone: "07011234567", place_id: "ChIJ_synth" }),
  // 10: empty-string phone + generic email -> kept via email fallback
  item({ title: "Keep Generic", phone: "", emails: ["info@shop.ng"] }),
  // 11: NG + whitespace phone + no email -> dropped no_contact
  item({ title: "Drop Blank", phone: "   ", emails: null }),
];

describe("offline fixture — normalize + gates (require-contact, NG)", () => {
  it("keeps the exact expected rows with exact dropped counts", () => {
    const normalized = ROWS.map(normalizeResult).filter((r) => r !== null);
    assert.equal(normalized.length, 12);
    const { kept, dropped } = applyGates(normalized, {
      requireContact: true,
      countryAllowlist: ["NG"],
      skipClosed: true,
    });
    assert.deepEqual(
      kept.map((r) => r.company_name),
      ["Keep Mobile", "Keep Email", "Keep Foreign", "Keep Landline", "Keep DupPlace", "Keep Generic"],
    );
    assert.deepEqual(dropped, { no_contact: 3, country: 2, closed: 1 });
  });

  it("spot-checks normalized values of kept rows", () => {
    const normalized = ROWS.map(normalizeResult).filter((r) => r !== null);
    const { kept } = applyGates(normalized, {
      requireContact: true,
      countryAllowlist: ["NG"],
      skipClosed: true,
    });
    const mobile = kept.find((r) => r.company_name === "Keep Mobile");
    assert.equal(mobile.phone, "+2348031234567");
    assert.equal(mobile.country, "Nigeria");
    assert.equal(mobile.city, "Ikeja");
    const landline = kept.find((r) => r.company_name === "Keep Landline");
    assert.equal(landline.phoneType, "landline");
    assert.ok(landline.internal_notes.includes("Category: Pharmacy"));
  });
});
