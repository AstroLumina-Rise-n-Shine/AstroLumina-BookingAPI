import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure normalization functions from calcom.ts (no axios import needed)
function unwrapData<T>(body: unknown): T | undefined {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return undefined;
}

function normalizeSlotEntry(item: unknown): { start: string; end?: string } {
  if (item && typeof item === "object" && "start" in item) {
    const o = item as { start: string; end?: string };
    return { start: o.start, end: o.end ?? o.start };
  }
  const s = String(item);
  return { start: s, end: s };
}

function normalizeSlotsBody(body: unknown): Record<string, { start: string; end?: string }[]> {
  const map =
    unwrapData<Record<string, unknown>>(body) ??
    (body as Record<string, unknown>);
  if (!map || typeof map !== "object") {
    return {};
  }
  const out: Record<string, { start: string; end?: string }[]> = {};
  for (const [date, slots] of Object.entries(map)) {
    if (!Array.isArray(slots)) continue;
    out[date] = slots.map(normalizeSlotEntry);
  }
  return out;
}

function normalizeBookingV2(raw: unknown): { startTime: string; endTime: string } {
  const b = raw as { startTime?: string; endTime?: string; start?: string; end?: string };
  return {
    startTime: b.startTime ?? b.start ?? "",
    endTime: b.endTime ?? b.end ?? "",
  };
}

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
