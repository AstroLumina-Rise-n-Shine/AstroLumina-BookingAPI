// Unit tests for escapeHtml: attacker markup must come out inert.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../src/utils/escape-html.js";

describe("escapeHtml", () => {
  it("escapes angle brackets so tags cannot form", () => {
    assert.equal(
      escapeHtml('<img src=x onerror="alert(1)">'),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("escapes ampersands first (no double-escaping)", () => {
    assert.equal(escapeHtml("a&b"), "a&amp;b");
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });

  it("escapes single quotes", () => {
    assert.equal(escapeHtml("l'ADN"), "l&#39;ADN");
  });

  it("leaves plain text untouched", () => {
    assert.equal(escapeHtml("Constelații 2026"), "Constelații 2026");
  });
});
