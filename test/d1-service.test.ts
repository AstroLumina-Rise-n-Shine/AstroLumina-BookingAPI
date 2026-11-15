import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup-env-process.js";

import {
  MAX_SEATS,
  parseBooked,
  extractResults,
} from "../src/services/d1.js";

describe("parseBooked", () => {
  it("returns count from numeric value", () => {
    assert.equal(parseBooked(5), 5);
    assert.equal(parseBooked(0), 0);
  });

  it("returns 0 for null and undefined", () => {
    assert.equal(parseBooked(null), 0);
    assert.equal(parseBooked(undefined), 0);
  });

  it("returns 0 for non-numeric values", () => {
    assert.equal(parseBooked("abc"), 0);
    assert.equal(parseBooked({}), 0);
  });

  it("truncates floats and coerces numeric strings", () => {
    assert.equal(parseBooked(3.9), 3);
    assert.equal(parseBooked("7"), 7);
  });

  it("clamps negative values to 0", () => {
    assert.equal(parseBooked(-4), 0);
  });
});

describe("extractResults", () => {
  it("returns rows from a D1 response", () => {
    const rows = [{ booked: 2 }];
    assert.deepEqual(extractResults({ success: true, result: [{ results: rows }] }), rows);
  });

  it("returns [] for malformed responses", () => {
    assert.deepEqual(extractResults({}), []);
    assert.deepEqual(extractResults(null), []);
    assert.deepEqual(extractResults("string"), []);
  });

  it("handles D1 response with empty results", () => {
    const response = { success: true, result: [{ results: [] }] };
    assert.deepEqual(extractResults(response), []);
  });
});

describe("remaining seat arithmetic", () => {
  it("returns MAX_SEATS when no bookings", () => {
    const rows = extractResults({ success: true, result: [{ results: [{ booked: 0 }] }] });
    assert.equal(MAX_SEATS - parseBooked((rows[0] as { booked?: unknown } | undefined)?.booked), 20);
  });

  it("returns remaining seats", () => {
    const rows = extractResults({ success: true, result: [{ results: [{ booked: 5 }] }] });
    assert.equal(MAX_SEATS - parseBooked((rows[0] as { booked?: unknown } | undefined)?.booked), 15);
  });

  it("handles a null booked value", () => {
    const rows = extractResults({ success: true, result: [{ results: [{ booked: null }] }] });
    assert.equal(MAX_SEATS - parseBooked((rows[0] as { booked?: unknown } | undefined)?.booked), 20);
  });
});
