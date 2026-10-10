import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCountry, countryCode, titleCasePlace } from "./lib/country.js";

describe("normalizeCountry (Intl.DisplayNames)", () => {
  it('"NG" -> "Nigeria"', () => {
    assert.equal(normalizeCountry("NG"), "Nigeria");
  });

  it('"GB" -> "United Kingdom"', () => {
    assert.equal(normalizeCountry("GB"), "United Kingdom");
  });

  it('"US" -> "United States"', () => {
    assert.equal(normalizeCountry("US"), "United States");
  });

  it('"AE" -> "United Arab Emirates"', () => {
    assert.equal(normalizeCountry("AE"), "United Arab Emirates");
  });

  it("codes are case-insensitive", () => {
    assert.equal(normalizeCountry("ng"), "Nigeria");
  });

  it("an already-a-name value is returned trimmed", () => {
    assert.equal(normalizeCountry("  Nigeria  "), "Nigeria");
  });

  it("unknown codes return unchanged", () => {
    assert.equal(normalizeCountry("XX"), "XX");
  });
});

describe("countryCode", () => {
  it("resolves codes", () => {
    assert.equal(countryCode("NG"), "NG");
    assert.equal(countryCode("ng"), "NG");
  });

  it("resolves known names", () => {
    assert.equal(countryCode("Nigeria"), "NG");
    assert.equal(countryCode("Ghana"), "GH");
  });

  it("finds Nigeria in free address text", () => {
    assert.equal(countryCode("14 Allen Ave, Ikeja, Lagos, Nigeria"), "NG");
  });

  it("returns null when undeterminable", () => {
    assert.equal(countryCode(""), null);
    assert.equal(countryCode(null), null);
    assert.equal(countryCode("Somewhere"), null);
  });
});

describe("titleCasePlace", () => {
  it('"LAGOS" -> "Lagos"', () => {
    assert.equal(titleCasePlace("LAGOS"), "Lagos");
  });

  it('"port harcourt" -> "Port Harcourt"', () => {
    assert.equal(titleCasePlace("port harcourt"), "Port Harcourt");
  });

  it("mixed-case strings are untouched", () => {
    assert.equal(titleCasePlace("Lagos"), "Lagos");
    assert.equal(titleCasePlace("McDonald"), "McDonald");
  });

  it("empty string stays empty", () => {
    assert.equal(titleCasePlace(""), "");
  });
});
