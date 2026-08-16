import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeResult } from "./lib/normalize.js";

// ---------------------------------------------------------------------------
// Real-world gosom/google-maps-scraper schema
// ---------------------------------------------------------------------------

describe("normalizeResult — real scraper schema", () => {
  const realItem = {
    input_id: "1",
    link: "https://maps/place/tech-solutions/...",
    cid: "123456",
    title: "Tech Solutions Pvt Ltd",
    categories: ["Software Company"],
    category: "Software Company",
    address: "123 MG Road, New Delhi, Delhi, India",
    web_site: "https://techsolutions.com",
    phone: "+91-11-23456789",
    plus_code: "7JHX+Q4",
    review_count: 42,
    review_rating: 4.5,
    latitude: 28.6139,
    longitude: 77.209,
    place_id: "ChIJ_test1",
    complete_address: {
      borough: "",
      street: "123 MG Road",
      city: "New Delhi",
      postal_code: "110001",
      state: "Delhi",
      country: "India",
    },
    emails: ["info@techsolutions.com"],
  };

  it("extracts company_name from title", () => {
    const result = normalizeResult(realItem);
    assert.equal(result.company_name, "Tech Solutions Pvt Ltd");
  });

  it("uses web_site (underscore) for website", () => {
    const result = normalizeResult(realItem);
    assert.equal(result.website, "https://techsolutions.com");
  });

  it("extracts city/state/country from complete_address object", () => {
    const result = normalizeResult(realItem);
    assert.equal(result.city, "New Delhi");
    assert.equal(result.state, "Delhi");
    assert.equal(result.country, "India");
  });

  it("extracts first email", () => {
    const result = normalizeResult(realItem);
    assert.equal(result.email, "info@techsolutions.com");
  });

  it("extracts phone", () => {
    const result = normalizeResult(realItem);
    assert.equal(result.phone, "+91-11-23456789");
  });

  it("extracts industry from category", () => {
    const result = normalizeResult(realItem);
    assert.equal(result.industry, "Software Company");
  });

  it("extracts google_place_id from place_id", () => {
    const result = normalizeResult(realItem);
    assert.equal(result.google_place_id, "ChIJ_test1");
  });

  it("builds internal_notes JSON with metadata", () => {
    const result = normalizeResult(realItem);
    const notes = JSON.parse(result.internal_notes);
    assert.equal(notes.google_maps_url, realItem.link);
    assert.equal(notes.review_rating, 4.5);
    assert.equal(notes.review_count, 42);
    assert.equal(notes.latitude, 28.6139);
    assert.equal(notes.longitude, 77.209);
    assert.equal(notes.place_id, "ChIJ_test1");
    assert.equal(notes.category, "Software Company");
  });

  it("sets source and status", () => {
    const result = normalizeResult(realItem);
    assert.equal(result.source, "google_maps");
    assert.equal(result.status, "not_contacted");
  });
});

// ---------------------------------------------------------------------------
// Edge cases — complete_address type handling
// ---------------------------------------------------------------------------

describe("normalizeResult — complete_address edge cases", () => {
  it("handles null complete_address with string address fallback", () => {
    const result = normalizeResult({
      title: "Null CA",
      complete_address: null,
      address: "Mumbai, Maharashtra, India",
    });
    assert.equal(result.city, "Mumbai");
    assert.equal(result.state, "Maharashtra");
    assert.equal(result.country, "India");
  });

  it("handles undefined complete_address with string address fallback", () => {
    const result = normalizeResult({
      title: "Undefined CA",
      address: "Bangalore, Karnataka, India",
    });
    assert.equal(result.city, "Bangalore");
    assert.equal(result.state, "Karnataka");
    assert.equal(result.country, "India");
  });

  it("handles empty object complete_address with string address fallback", () => {
    const result = normalizeResult({
      title: "Empty Object CA",
      complete_address: {},
      address: "Chennai, Tamil Nadu, India",
    });
    assert.equal(result.city, "Chennai");
    assert.equal(result.state, "Tamil Nadu");
    assert.equal(result.country, "India");
  });

  it("handles array complete_address with string address fallback", () => {
    const result = normalizeResult({
      title: "Array CA",
      complete_address: ["street", "city"],
      address: "Pune, Maharashtra, India",
    });
    assert.equal(result.city, "Pune");
    assert.equal(result.state, "Maharashtra");
    assert.equal(result.country, "India");
  });

  it("handles missing both complete_address and address", () => {
    const result = normalizeResult({ title: "No Address" });
    assert.equal(result.city, null);
    assert.equal(result.state, null);
    assert.equal(result.country, null);
  });

  it("handles string complete_address (legacy format)", () => {
    const result = normalizeResult({
      title: "String CA",
      complete_address: "Hyderabad, Telangana, India",
    });
    assert.equal(result.city, "Hyderabad");
    assert.equal(result.state, "Telangana");
    assert.equal(result.country, "India");
  });

  it("handles empty string complete_address", () => {
    const result = normalizeResult({
      title: "Empty String CA",
      complete_address: "",
      address: "Kolkata, West Bengal, India",
    });
    assert.equal(result.city, "Kolkata");
  });

  it("handles complete_address with empty string fields", () => {
    const result = normalizeResult({
      title: "Empty Fields CA",
      complete_address: {
        borough: "",
        street: "",
        city: "",
        postal_code: "",
        state: "",
        country: "",
      },
    });
    assert.equal(result.city, null);
    assert.equal(result.state, null);
    assert.equal(result.country, null);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — missing/null fields
// ---------------------------------------------------------------------------

describe("normalizeResult — missing fields", () => {
  it("returns null if no title or name", () => {
    assert.equal(normalizeResult({}), null);
    assert.equal(normalizeResult({ title: "" }), null);
    assert.equal(normalizeResult({ name: "" }), null);
  });

  it("falls back to name if title missing", () => {
    const result = normalizeResult({ name: "Fallback Name" });
    assert.equal(result.company_name, "Fallback Name");
  });

  it("handles null emails array", () => {
    const result = normalizeResult({ title: "No Emails", emails: null });
    assert.equal(result.email, null);
  });

  it("handles empty emails array", () => {
    const result = normalizeResult({ title: "Empty Emails", emails: [] });
    assert.equal(result.email, null);
  });

  it("handles website fallback from 'website' key", () => {
    const result = normalizeResult({ title: "Legacy", website: "old.com" });
    assert.equal(result.website, "old.com");
  });

  it("prefers web_site over website", () => {
    const result = normalizeResult({
      title: "Both",
      web_site: "new.com",
      website: "old.com",
    });
    assert.equal(result.website, "new.com");
  });

  it("sets null internal_notes when no metadata present", () => {
    const result = normalizeResult({ title: "Minimal" });
    assert.equal(result.internal_notes, null);
  });
});

// ---------------------------------------------------------------------------
// Address parsing fallback (flat string)
// ---------------------------------------------------------------------------

describe("normalizeResult — flat address string parsing", () => {
  it("parses 3+ segment address (city, state, country)", () => {
    const result = normalizeResult({
      title: "Three Parts",
      address: "Berlin, Berlin, Germany",
    });
    assert.equal(result.city, "Berlin");
    assert.equal(result.state, "Berlin");
    assert.equal(result.country, "Germany");
  });

  it("parses 2 segment address (city, country)", () => {
    const result = normalizeResult({
      title: "Two Parts",
      address: "London, UK",
    });
    assert.equal(result.city, "London");
    assert.equal(result.state, null);
    assert.equal(result.country, "UK");
  });

  it("parses 1 segment address (city only)", () => {
    const result = normalizeResult({
      title: "One Part",
      address: "Tokyo",
    });
    assert.equal(result.city, "Tokyo");
    assert.equal(result.state, null);
    assert.equal(result.country, null);
  });

  it("trims whitespace in address parts", () => {
    const result = normalizeResult({
      title: "Spaces",
      address: "  Paris  ,  Ile-de-France  ,  France  ",
    });
    assert.equal(result.city, "Paris");
    assert.equal(result.state, "Ile-de-France");
    assert.equal(result.country, "France");
  });
});
