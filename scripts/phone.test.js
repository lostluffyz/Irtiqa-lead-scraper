import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "./lib/phone.js";

describe("normalizePhone — Nigerian formats", () => {
  it("+234 with spaces is mobile", () => {
    assert.deepEqual(normalizePhone("+234 803 123 4567"), {
      e164: "+2348031234567",
      type: "mobile",
      valid: true,
    });
  });

  it("local 0803 with spaces converts to +234 mobile", () => {
    assert.deepEqual(normalizePhone("0803 123 4567"), {
      e164: "+2348031234567",
      type: "mobile",
      valid: true,
    });
  });

  it("compact local 08031234567 converts", () => {
    assert.deepEqual(normalizePhone("08031234567"), {
      e164: "+2348031234567",
      type: "mobile",
      valid: true,
    });
  });

  it("234 prefix without plus converts", () => {
    assert.deepEqual(normalizePhone("2348031234567"), {
      e164: "+2348031234567",
      type: "mobile",
      valid: true,
    });
  });

  it("canonical +2348031234567 passes through", () => {
    assert.deepEqual(normalizePhone("+2348031234567"), {
      e164: "+2348031234567",
      type: "mobile",
      valid: true,
    });
  });

  it("0701 prefix is mobile", () => {
    assert.deepEqual(normalizePhone("07011234567"), {
      e164: "+2347011234567",
      type: "mobile",
      valid: true,
    });
  });

  it("0901 prefix is mobile", () => {
    assert.deepEqual(normalizePhone("+2349012345678"), {
      e164: "+2349012345678",
      type: "mobile",
      valid: true,
    });
  });

  it("Lagos landline (01) is landline", () => {
    assert.deepEqual(normalizePhone("(01) 234 5678"), {
      e164: "+23412345678",
      type: "landline",
      valid: true,
    });
  });

  it("tel: prefix is stripped", () => {
    assert.deepEqual(normalizePhone("tel:+2348031234567"), {
      e164: "+2348031234567",
      type: "mobile",
      valid: true,
    });
  });

  it("trailing extension is dropped", () => {
    assert.deepEqual(normalizePhone("08031234567 x12"), {
      e164: "+2348031234567",
      type: "mobile",
      valid: true,
    });
  });

  it("dashes and parentheses are stripped", () => {
    assert.deepEqual(normalizePhone("+234-803-123-4567"), {
      e164: "+2348031234567",
      type: "mobile",
      valid: true,
    });
  });

  it("short numbers are invalid", () => {
    assert.deepEqual(normalizePhone("12345"), {
      e164: null,
      type: "unknown",
      valid: false,
    });
  });

  it("empty input is invalid", () => {
    assert.deepEqual(normalizePhone(""), {
      e164: null,
      type: "unknown",
      valid: false,
    });
    assert.deepEqual(normalizePhone(null), {
      e164: null,
      type: "unknown",
      valid: false,
    });
  });

  it("non-NG explicit + numbers are unknown but valid", () => {
    assert.deepEqual(normalizePhone("+1-415-555-0132"), {
      e164: "+14155550132",
      type: "unknown",
      valid: true,
    });
  });

  it("too-short international numbers are invalid", () => {
    assert.equal(normalizePhone("+12").valid, false);
  });

  it("national number with non-NG default is invalid", () => {
    assert.equal(normalizePhone("08031234567", "GH").valid, false);
  });
});
