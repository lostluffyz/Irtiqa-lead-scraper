import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseNdjson } from "./lib/ndjson.js";

describe("parseNdjson", () => {
  it("parses valid lines", () => {
    const { rows, skipped } = parseNdjson('{"a":1}\n{"b":2}\n');
    assert.deepEqual(rows, [{ a: 1 }, { b: 2 }]);
    assert.equal(skipped, 0);
  });

  it("skips a truncated final line", () => {
    const { rows, skipped } = parseNdjson('{"a":1}\n{"b":2\n');
    assert.deepEqual(rows, [{ a: 1 }]);
    assert.equal(skipped, 1);
  });

  it("skips an invalid middle line without losing the rest", () => {
    const { rows, skipped } = parseNdjson('{"a":1}\nNOT JSON\n{"b":2}\n');
    assert.deepEqual(rows, [{ a: 1 }, { b: 2 }]);
    assert.equal(skipped, 1);
  });

  it("skips non-object values", () => {
    const { rows, skipped } = parseNdjson('{"a":1}\n42\n"str"\n[1]\nnull\n');
    assert.deepEqual(rows, [{ a: 1 }]);
    assert.equal(skipped, 4);
  });

  it("empty input yields no rows", () => {
    assert.deepEqual(parseNdjson(""), { rows: [], skipped: 0 });
    assert.deepEqual(parseNdjson("   \n  \n"), { rows: [], skipped: 0 });
  });

  it("non-string input yields no rows", () => {
    assert.deepEqual(parseNdjson(null), { rows: [], skipped: 0 });
  });
});
