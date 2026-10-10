import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanWebsite, websiteKey } from "./lib/website.js";

describe("cleanWebsite", () => {
  it("removes utm/gclid/fbclid params but keeps others", () => {
    assert.equal(
      cleanWebsite("https://shop.ng/a?utm_source=x&utm_medium=y&gclid=1&fbclid=2&ref=home"),
      "https://shop.ng/a?ref=home",
    );
  });

  it("removes a trailing slash", () => {
    assert.equal(cleanWebsite("https://shop.ng/"), "https://shop.ng");
  });

  it("adds https:// when protocol is missing", () => {
    assert.equal(cleanWebsite("shop.ng/sales"), "https://shop.ng/sales");
  });

  it("keeps www in the stored website", () => {
    assert.equal(cleanWebsite("https://www.shop.ng/"), "https://www.shop.ng");
  });

  it("returns null for invalid strings", () => {
    assert.equal(cleanWebsite("::::"), null);
  });

  it("returns null for empty input", () => {
    assert.equal(cleanWebsite(""), null);
    assert.equal(cleanWebsite(null), null);
  });
});

describe("websiteKey", () => {
  it("lowercases and strips www", () => {
    assert.equal(websiteKey("https://WWW.Shop.NG/a?utm_source=x"), "shop.ng");
  });

  it("works without protocol", () => {
    assert.equal(websiteKey("shop.ng"), "shop.ng");
  });

  it("returns null for invalid input", () => {
    assert.equal(websiteKey("::::"), null);
    assert.equal(websiteKey(""), null);
  });
});
