import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyGates } from "./lib/gates.js";

function row(overrides = {}) {
  return {
    company_name: "Test Ltd",
    phone: "+2348031234567",
    phoneValid: true,
    email: null,
    country: "Nigeria",
    permanentlyClosed: false,
    ...overrides,
  };
}

describe("applyGates — requireContact", () => {
  it("keeps rows with a valid phone", () => {
    const { kept, dropped } = applyGates([row()], { requireContact: true });
    assert.equal(kept.length, 1);
    assert.equal(dropped.no_contact, 0);
  });

  it("keeps rows with only an email", () => {
    const { kept } = applyGates(
      [row({ phone: "abc", phoneValid: false, email: "ada@shop.ng" })],
      { requireContact: true },
    );
    assert.equal(kept.length, 1);
  });

  it("drops rows with neither valid phone nor email", () => {
    const { kept, dropped } = applyGates(
      [row({ phone: "abc", phoneValid: false, email: null })],
      { requireContact: true },
    );
    assert.equal(kept.length, 0);
    assert.equal(dropped.no_contact, 1);
  });

  it("does nothing when requireContact is false", () => {
    const { kept } = applyGates(
      [row({ phone: null, phoneValid: false, email: null })],
      { requireContact: false },
    );
    assert.equal(kept.length, 1);
  });
});

describe("applyGates — country allowlist", () => {
  it("keeps NG rows under an NG allowlist", () => {
    const { kept } = applyGates([row()], { countryAllowlist: ["NG"] });
    assert.equal(kept.length, 1);
  });

  it("drops non-NG rows", () => {
    const { kept, dropped } = applyGates([row({ country: "Ghana" })], {
      countryAllowlist: ["NG"],
    });
    assert.equal(kept.length, 0);
    assert.equal(dropped.country, 1);
  });

  it("drops rows whose country cannot be determined when filtered", () => {
    const { kept, dropped } = applyGates([row({ country: null })], {
      countryAllowlist: ["NG"],
    });
    assert.equal(kept.length, 0);
    assert.equal(dropped.country, 1);
  });

  it("empty allowlist disables the filter", () => {
    const { kept } = applyGates([row({ country: "Ghana" })], {
      countryAllowlist: [],
    });
    assert.equal(kept.length, 1);
  });

  it("allowlist matching is case-insensitive", () => {
    const { kept } = applyGates([row({ country: "NG" })], {
      countryAllowlist: ["ng"],
    });
    assert.equal(kept.length, 1);
  });
});

describe("applyGates — skipClosed", () => {
  it("drops permanently closed rows", () => {
    const { kept, dropped } = applyGates([row({ permanentlyClosed: true })], {
      skipClosed: true,
    });
    assert.equal(kept.length, 0);
    assert.equal(dropped.closed, 1);
  });

  it("keeps open rows", () => {
    const { kept } = applyGates([row()], { skipClosed: true });
    assert.equal(kept.length, 1);
  });

  it("does nothing when skipClosed is false", () => {
    const { kept } = applyGates([row({ permanentlyClosed: true })], {
      skipClosed: false,
    });
    assert.equal(kept.length, 1);
  });
});

describe("applyGates — combined", () => {
  it("counts each drop reason independently", () => {
    const rows = [
      row(),
      row({ phone: null, phoneValid: false, email: null }),
      row({ country: "Kenya" }),
      row({ permanentlyClosed: true }),
    ];
    const { kept, dropped } = applyGates(rows, {
      requireContact: true,
      countryAllowlist: ["NG"],
      skipClosed: true,
    });
    assert.equal(kept.length, 1);
    assert.deepEqual(dropped, { no_contact: 1, country: 1, closed: 1 });
  });
});
