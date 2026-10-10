import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markIntraBatchDupes } from "./lib/dedupe.js";

function lead(overrides = {}) {
  return {
    company_name: "Unique Ltd",
    website: null,
    phone: null,
    phoneValid: false,
    google_place_id: null,
    ...overrides,
  };
}

describe("markIntraBatchDupes", () => {
  it("keeps distinct rows", () => {
    const { kept, dropped } = markIntraBatchDupes([
      lead({ company_name: "A Ltd", google_place_id: "p1" }),
      lead({ company_name: "B Ltd", google_place_id: "p2" }),
    ]);
    assert.equal(kept.length, 2);
    assert.equal(dropped, 0);
  });

  it("drops repeated place ids", () => {
    const { kept, dropped } = markIntraBatchDupes([
      lead({ company_name: "A Ltd", google_place_id: "p1" }),
      lead({ company_name: "A Ltd Again", google_place_id: "p1" }),
    ]);
    assert.equal(kept.length, 1);
    assert.equal(dropped, 1);
  });

  it("drops websites matching by key (case/protocol/www insensitive)", () => {
    const { kept, dropped } = markIntraBatchDupes([
      lead({ company_name: "A Ltd", website: "https://WWW.Shop.NG/" }),
      lead({ company_name: "B Ltd", website: "http://shop.ng/sales" }),
    ]);
    assert.equal(kept.length, 1);
    assert.equal(dropped, 1);
  });

  it("drops repeated valid E.164 phones", () => {
    const { kept, dropped } = markIntraBatchDupes([
      lead({ company_name: "A Ltd", phone: "+2348031234567", phoneValid: true }),
      lead({ company_name: "B Ltd", phone: "+2348031234567", phoneValid: true }),
    ]);
    assert.equal(kept.length, 1);
    assert.equal(dropped, 1);
  });

  it("ignores invalid phones for the phone check", () => {
    const { kept, dropped } = markIntraBatchDupes([
      lead({ company_name: "A Ltd", phone: "abc", phoneValid: false }),
      lead({ company_name: "B Ltd", phone: "abc", phoneValid: false }),
    ]);
    assert.equal(kept.length, 2);
    assert.equal(dropped, 0);
  });

  it("drops repeated lowercase name + stored phone", () => {
    const { kept, dropped } = markIntraBatchDupes([
      lead({ company_name: "Akor Ltd", phone: "0803", phoneValid: false }),
      lead({ company_name: "AKOR LTD", phone: "0803", phoneValid: false }),
    ]);
    assert.equal(kept.length, 1);
    assert.equal(dropped, 1);
  });
});
