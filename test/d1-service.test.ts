import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure D1 response parsing logic extracted from d1.ts (no axios import needed)
function parseBooked(raw: unknown): number {
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return 0;
  return Math.max(0, Math.trunc(Number(raw)));
}

function extractResults(result: unknown): unknown[] {
  if (!result || typeof result !== "object") return [];
  const r = result as { result?: { results?: unknown[] }[] };
  const first = r.result?.[0];
  return first?.results ?? [];
}

function isSuccess(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  return (result as { success?: boolean }).success === true;
}

const MAX_SEATS = 20;

function getAvailableSeatsFromResult(result: unknown): number {
  if (!isSuccess(result)) throw new Error("D1 query failed");
  const rows = extractResults(result);
  const raw = rows[0]?.booked;
  const booked = parseBooked(raw);
  return MAX_SEATS - booked;
}

describe("D1 parseBooked", () => {
  it("returns count from numeric value", () => {
    assert.equal(parseBooked(5), 5);
    assert.equal(parseBooked(0), 0);
  });

  it("returns 0 for null", () => {
    assert.equal(parseBooked(null), 0);
  });

  it("returns 0 for undefined", () => {
    assert.equal(parseBooked(undefined), 0);
  });

  it("returns 0 for NaN", () => {
    assert.equal(parseBooked(NaN), 0);
  });

  it("truncates decimals", () => {
    assert.equal(parseBooked(5.9), 5);
  });

  it("clamps negatives to 0", () => {
    assert.equal(parseBooked(-3), 0);
  });

  it("parses numeric strings", () => {
    assert.equal(parseBooked("7"), 7);
  });
});

describe("extractResults", () => {
  it("returns results array from valid D1 response", () => {
    const response = { success: true, result: [{ results: [{ a: 1 }] }] };
    assert.deepEqual(extractResults(response), [{ a: 1 }]);
  });

  it("returns empty array for missing results", () => {
    assert.deepEqual(extractResults({}), []);
    assert.deepEqual(extractResults(null), []);
    assert.deepEqual(extractResults("string"), []);
  });

  it("handles D1 response with empty results", () => {
    const response = { success: true, result: [{ results: [] }] };
    assert.deepEqual(extractResults(response), []);
  });
});

describe("isSuccess", () => {
  it("returns true for success", () => {
    assert.equal(isSuccess({ success: true }), true);
  });

  it("returns false for failure or missing", () => {
    assert.equal(isSuccess({ success: false }), false);
    assert.equal(isSuccess({}), false);
    assert.equal(isSuccess(null), false);
  });
});

describe("getAvailableSeatsFromResult", () => {
  it("returns MAX_SEATS when no bookings", () => {
    assert.equal(
      getAvailableSeatsFromResult({
        success: true,
        result: [{ results: [{ booked: 0 }] }],
      }),
      20,
    );
  });

  it("returns remaining seats", () => {
    assert.equal(
      getAvailableSeatsFromResult({
        success: true,
        result: [{ results: [{ booked: 5 }] }],
      }),
      15,
    );
  });

  it("handles null booked", () => {
    assert.equal(
      getAvailableSeatsFromResult({
        success: true,
        result: [{ results: [{ booked: null }] }],
      }),
      20,
    );
  });

  it("throws on failed query", () => {
    assert.throws(
      () => getAvailableSeatsFromResult({ success: false, result: [] }),
      /D1 query failed/,
    );
  });
});
