// Unit tests for the CORS origin list: every service endpoint must be
// reachable over both protocols from local hosts and its DNS names, the
// public origins must be present, and the list must hold no duplicates.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DC_DNS,
  K8S_DNS,
  FRONTEND_DC_PORT,
  ASTROLOGY_DC_PORT,
  BOOKING_DC_PORT,
  BOOKING_K8S_PORT,
  PAYMENT_DC_PORT,
} from "./setup-env.js";

const { defaultOrigins } = await import("../src/config/cors.js");

describe("defaultOrigins", () => {
  it("covers localhost over http and https for the frontend port", () => {
    assert.ok(defaultOrigins.includes(`http://localhost:${FRONTEND_DC_PORT}`));
    assert.ok(defaultOrigins.includes(`https://localhost:${FRONTEND_DC_PORT}`));
  });

  it("covers the lab IPs for every service DC port", () => {
    for (const port of [ASTROLOGY_DC_PORT, BOOKING_DC_PORT, PAYMENT_DC_PORT]) {
      for (const ip of ["192.168.200.210", "192.168.200.211", "192.168.200.212", "192.168.100.210", "192.168.100.211", "192.168.100.212"]) {
        assert.ok(defaultOrigins.includes(`http://${ip}:${port}`));
        assert.ok(defaultOrigins.includes(`https://${ip}:${port}`));
      }
    }
  });

  it("covers the DC and K8S DNS names of each service", () => {
    assert.ok(defaultOrigins.includes(`http://${DC_DNS}:${BOOKING_DC_PORT}`));
    assert.ok(
      defaultOrigins.includes(`https://${K8S_DNS}:${BOOKING_K8S_PORT}`),
    );
  });

  it("contains the four public origins", () => {
    for (const origin of [
      "https://astrolumina.pages.dev",
      "https://develop.astrolumina.pages.dev",
      "https://astrolumina.com",
      "https://astrolumina.ro",
    ]) {
      assert.ok(defaultOrigins.includes(origin));
    }
  });

  it("holds no duplicates", () => {
    assert.equal(new Set(defaultOrigins).size, defaultOrigins.length);
  });
});
