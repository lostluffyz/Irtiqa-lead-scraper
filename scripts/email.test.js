import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickBestEmail } from "./lib/email.js";

describe("pickBestEmail", () => {
  it("returns a simple valid email", () => {
    assert.equal(pickBestEmail(["jane@example.org"]), "jane@example.org");
  });

  it("trims and lowercases", () => {
    assert.equal(pickBestEmail(["  Jane.Doe@Shop.NG  "]), "jane.doe@shop.ng");
  });

  it("prefers non-generic over generic even when generic comes first", () => {
    assert.equal(
      pickBestEmail(["info@shop.ng", "adaeze@shop.ng"]),
      "adaeze@shop.ng",
    );
  });

  it("falls back to the first valid generic", () => {
    assert.equal(pickBestEmail(["sales@shop.ng", "info@shop.ng"]), "sales@shop.ng");
  });

  it("rejects invalid syntax", () => {
    assert.equal(pickBestEmail(["not-an-email", "also@bad", "@nodomain"]), null);
  });

  it("rejects image/script file artifacts", () => {
    assert.equal(pickBestEmail(["logo@site.png", "ok@site.ng"]), "ok@site.ng");
    assert.equal(pickBestEmail(["a@site.jpg", "b@site.svg"]), null);
  });

  it("rejects placeholder domains", () => {
    assert.equal(pickBestEmail(["user@example.com", "ada@real.ng"]), "ada@real.ng");
    assert.equal(pickBestEmail(["x@sub.sentry.io"]), null);
  });

  it("returns null for empty or non-array input", () => {
    assert.equal(pickBestEmail([]), null);
    assert.equal(pickBestEmail(null), null);
    assert.equal(pickBestEmail("a@b.ng"), null);
  });

  it("skips non-string entries", () => {
    assert.equal(pickBestEmail([null, 42, "ada@shop.ng"]), "ada@shop.ng");
  });

  it("treats sales@ as generic for preference but keeps it as fallback", () => {
    assert.equal(pickBestEmail(["support@x.ng"]), "support@x.ng");
  });
});
