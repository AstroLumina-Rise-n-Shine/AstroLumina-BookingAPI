import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup-env-process.js";

import {
  unwrapData,
  normalizeSlotEntry,
  normalizeSlotsBody,
  normalizeBookingV2,
} from "../src/services/calcom.js";

describe("calcom unwrapData", () => {
  it("returns the data payload when present", () => {
    assert.deepEqual(unwrapData({ data: { a: 1 } }), { a: 1 });
  });

  it("returns undefined without a data wrapper", () => {
    assert.equal(unwrapData({ a: 1 }), undefined);
    assert.equal(unwrapData(null), undefined);
  });
});

describe("calcom normalizeSlotEntry", () => {
  it("normalizes object with start and end", () => {
    const result = normalizeSlotEntry({ start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" });
    assert.equal(result.start, "2026-04-01T10:00:00Z");
    assert.equal(result.end, "2026-04-01T11:00:00Z");
  });

  it("normalizes object with start only", () => {
    const result = normalizeSlotEntry({ start: "2026-04-01T10:00:00Z" });
    assert.equal(result.start, "2026-04-01T10:00:00Z");
    assert.equal(result.end, "2026-04-01T10:00:00Z");
  });

  it("normalizes plain string", () => {
    const result = normalizeSlotEntry("2026-04-01T10:00:00Z");
    assert.equal(result.start, "2026-04-01T10:00:00Z");
    assert.equal(result.end, "2026-04-01T10:00:00Z");
  });
});

describe("calcom normalizeSlotsBody", () => {
  it("normalizes body with data wrapper", () => {
    const body = { data: { "2026-04-01": [{ start: "10:00", end: "11:00" }] } };
    const result = normalizeSlotsBody(body);
    assert.ok("2026-04-01" in result);
    assert.equal(result["2026-04-01"].length, 1);
    assert.equal(result["2026-04-01"][0].start, "10:00");
  });

  it("normalizes body without data wrapper", () => {
    const body = { "2026-04-01": [{ start: "10:00" }] };
    const result = normalizeSlotsBody(body);
    assert.equal(result["2026-04-01"].length, 1);
  });

  it("returns empty object for non-object body", () => {
    assert.deepEqual(normalizeSlotsBody(null), {});
    assert.deepEqual(normalizeSlotsBody("string"), {});
    assert.deepEqual(normalizeSlotsBody(42), {});
  });

  it("skips non-array slot values", () => {
    const body = { "2026-04-01": "not an array", "2026-04-02": [{ start: "10:00" }] };
    const result = normalizeSlotsBody(body);
    assert.ok(!("2026-04-01" in result));
    assert.equal(result["2026-04-02"].length, 1);
  });
});

describe("calcom normalizeBookingV2", () => {
  it("uses startTime/endTime when present", () => {
    const result = normalizeBookingV2({ startTime: "2026-04-01T10:00:00Z", endTime: "2026-04-01T11:00:00Z" });
    assert.equal(result.startTime, "2026-04-01T10:00:00Z");
    assert.equal(result.endTime, "2026-04-01T11:00:00Z");
  });

  it("falls back to start/end fields", () => {
    const result = normalizeBookingV2({ start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" });
    assert.equal(result.startTime, "2026-04-01T10:00:00Z");
    assert.equal(result.endTime, "2026-04-01T11:00:00Z");
  });

  it("returns empty strings for missing fields", () => {
    const result = normalizeBookingV2({});
    assert.equal(result.startTime, "");
    assert.equal(result.endTime, "");
  });
});
