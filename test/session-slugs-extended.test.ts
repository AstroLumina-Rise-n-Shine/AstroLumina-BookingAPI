import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CalComEventType } from "../src/types/calcom.js";
import {
  SESSION_SLUGS,
  SESSION_SLUG_ALIASES,
  resolveEventTypeForSession,
} from "../src/config/session-slugs.js";

function makeEvent(id: number, slug: string): CalComEventType {
  return {
    id,
    title: `Event ${id}`,
    slug,
    description: null,
    lengthInMinutes: 60,
    locations: [],
    bookingFields: [],
    disableGuests: false,
    slotInterval: null,
    minimumBookingNotice: 0,
    beforeEventBuffer: 0,
    afterEventBuffer: 0,
    scheduleId: null,
    price: 0,
    currency: "RON",
    bookingLimitsCount: null,
    confirmationPolicy: null,
    recurringEvent: null,
    seatsPerTimeSlot: null,
  };
}

describe("SESSION_SLUGS", () => {
  it("maps every session key to a non-empty slug", () => {
    assert.ok(Object.keys(SESSION_SLUGS).length > 0);
    for (const slug of Object.values(SESSION_SLUGS)) {
      assert.ok(slug.length > 0);
    }
  });

  it("contains exactly the three expected session keys", () => {
    assert.deepEqual(Object.keys(SESSION_SLUGS).sort(), [
      "astrograma-natala-si-karmica",
      "astrograma-previzionala",
      "astrograma-relationala",
    ].sort());
  });

  it("every SESSION_SLUGS value is unique", () => {
    const values = Object.values(SESSION_SLUGS);
    assert.equal(new Set(values).size, values.length);
  });
});

describe("SESSION_SLUG_ALIASES", () => {
  it("is an object (may be empty)", () => {
    assert.ok(typeof SESSION_SLUG_ALIASES === "object");
    assert.ok(SESSION_SLUG_ALIASES !== null);
  });
});

describe("resolveEventTypeForSession", () => {
  const events = [
    makeEvent(1, "astrograma-natala-si-karmica"),
    makeEvent(2, "astrograma-relationala"),
    makeEvent(3, "astrograma-previzionala"),
  ];

  it("resolves each session key to its matching event", () => {
    for (const [key, expectedId] of [
      ["astrograma-natala-si-karmica", 1],
      ["astrograma-relationala", 2],
      ["astrograma-previzionala", 3],
    ]) {
      const found = resolveEventTypeForSession(key, events);
      assert.equal(found?.id, expectedId);
      assert.equal(found?.slug, key);
    }
  });

  it("returns undefined for an unknown session key", () => {
    assert.equal(resolveEventTypeForSession("no-such-session", events), undefined);
    assert.equal(resolveEventTypeForSession("", events), undefined);
  });

  it("returns undefined when no event carries the expected slug", () => {
    const otherEvents = [makeEvent(9, "some-other-slug")];
    assert.equal(
      resolveEventTypeForSession("astrograma-natala-si-karmica", otherEvents),
      undefined,
    );
  });

  it("returns undefined for an empty event list", () => {
    assert.equal(
      resolveEventTypeForSession("astrograma-natala-si-karmica", []),
      undefined,
    );
  });

  it("prefers the most recently created event on duplicate slugs", () => {
    const duplicates = [
      makeEvent(10, "astrograma-natala-si-karmica"),
      makeEvent(42, "astrograma-natala-si-karmica"),
      makeEvent(7, "astrograma-natala-si-karmica"),
    ];
    const found = resolveEventTypeForSession(
      "astrograma-natala-si-karmica",
      duplicates,
    );
    assert.equal(found?.id, 42);
  });

  it("is case-sensitive on slug matching", () => {
    const mixed = [makeEvent(5, "Astrograma-Natala-Si-Karmica")];
    assert.equal(
      resolveEventTypeForSession("astrograma-natala-si-karmica", mixed),
      undefined,
    );
  });
});
